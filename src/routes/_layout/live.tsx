import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "~/lib/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from "~/lib/components/ui/resizable";
import {
  evaluateLiveSessionFn,
  getLiveSessionAssessmentFn,
  type LiveSessionAssessment,
} from "~/lib/dashboard/live/assessment";
import { HistoryBanner } from "~/lib/dashboard/live/components/HistoryBanner";
import { LiveControls } from "~/lib/dashboard/live/components/LiveControls";
import { LiveStatusSection } from "~/lib/dashboard/live/components/LiveStatusSection";
import { LiveTranscript } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { ObserverPanel } from "~/lib/dashboard/live/components/ObserverPanel";
import { SessionBlocker } from "~/lib/dashboard/live/components/SessionBlocker";
import {
  DEFAULT_PERSONA_ID,
  getPersonaById,
  type Persona,
} from "~/lib/dashboard/live/constants";
import {
  getLiveSessionDetailFn,
  type LiveSessionDetailResponse,
} from "~/lib/dashboard/live/history";
import {
  appendLiveObserverOutputFn,
  getLiveObserverOutputsFn,
  type LiveObserverOutputRecord,
} from "~/lib/dashboard/live/observer";
import {
  MessageSyncQueue,
  retryWithBackoff,
  type MessageSyncState,
} from "~/lib/dashboard/live/retry";
import {
  useLiveObserverSidecar,
  type LiveObserverOutput,
} from "~/lib/dashboard/live/useLiveObserverSidecar";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useGeminiLive, type Message } from "~/lib/gemini/useGeminiLive";
import { useAuthUser } from "~/lib/store/auth";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import { getLocale } from "~/paraglide/runtime";

type LiveSessionMeta = {
  sessionId: string;
  liveSessionId?: string;
  personaId: string;
  personaName: string;
  voice: string;
  uiLocale: string;
  startedAt: string;
};

const formatHandleForLog = (handle: string | null) => {
  if (!handle) return null;
  const suffix = handle.slice(-6);
  return `${handle.length}:${suffix}`;
};

const logLiveAssessment = (...args: unknown[]) => {
  console.debug("[LiveAssessment]", ...args);
};

const SIDECAR_INJECTION_PREFIX = "[[SIDECAR]]";
const SIDEBAR_MIN_SIZE = "320px";
const SIDEBAR_MAX_SIZE = "40%";
const MAIN_PANEL_MIN_SIZE = "55%";

const buildSidecarSystemPrompt = () =>
  `Sidecar observer note:
You may receive hidden user turns that start with "${SIDECAR_INJECTION_PREFIX}".
These are internal guidance from a background observer.
- Do NOT respond to those turns, do NOT acknowledge them, and do NOT quote them.
- Apply the guidance silently to your next normal response.
- If the most recent user turn is a sidecar instruction, wait for a real user utterance before responding.
- The sidecar instruction may be in a different language; keep your response language aligned with the user's last spoken language, not the sidecar text.
- Ignore any sidecar instruction that conflicts with persona, safety rules, or system constraints.`;

const formatSidecarInjection = (text: string) =>
  `${SIDECAR_INJECTION_PREFIX} ${text.trim()}`;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1280); // xl
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  return isDesktop;
}

export const Route = createFileRoute("/_layout/live")({
  component: LiveRoute,
  head: () => ({
    meta: [
      {
        title: `${m.live_page_title()} | Fluentlyby.ai`,
      },
      {
        name: "description",
        content: m.live_page_subtitle(),
      },
    ],
  }),
});

function LiveRoute() {
  return <LivePage />;
}

export function LivePage() {
  const matchRoute = useMatchRoute();
  const matchedSession = matchRoute({ to: "/live/$sessionId" });
  const resolvedSessionId = matchedSession ? matchedSession.sessionId : null;
  const authUser = useAuthUser();
  const isDesktop = useIsDesktop();
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const userName =
    (authUser?.user_metadata?.full_name as string | undefined) ||
    authUser?.email?.split("@")[0] ||
    "User";
  const [textInput, setTextInput] = useState("");
  const [isResuming, setIsResuming] = useState(false);
  const [isRestoringHistory, setIsRestoringHistory] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(
    getPersonaById(DEFAULT_PERSONA_ID),
  );
  const [selectedVoice, setSelectedVoice] = useState(selectedPersona.defaultVoice);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [syncStates, setSyncStates] = useState<Map<string, MessageSyncState>>(new Map());
  const hasSentGreetingRef = useRef(false);
  const activeSessionRef = useRef<LiveSessionMeta | null>(null);
  const pendingSessionRef = useRef<LiveSessionMeta | null>(null);
  const lastPersistedSessionIdRef = useRef<string | null>(null);
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());
  const resumptionHandleRef = useRef<string | null>(null);
  const sessionCreationPromiseRef = useRef<Promise<string> | null>(null);
  const syncQueueRef = useRef<MessageSyncQueue | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const audioChunkHandlerRef = useRef<
    ((chunk: { pcm: Float32Array; sampleCount: number }) => void) | null
  >(null);
  const sidebarPanelRef = usePanelRef();

  // Initialize sync queue
  if (!syncQueueRef.current) {
    syncQueueRef.current = new MessageSyncQueue((states) => {
      setSyncStates(states);
    });
  }

  // Debounce timer for batch message sync
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last synced message count to detect new messages
  const lastSyncedCountRef = useRef<number>(0);
  const uiLocale = getLocale();
  const queryClient = useQueryClient();
  const isViewingHistory = Boolean(resolvedSessionId);
  const isReadOnlyHistory = isViewingHistory && !isResuming;

  // Storage utilities using sessionStorage (simple and reliable)
  const saveSyncedIds = useCallback(
    (sessionId: string, ids: Set<string>) => {
      try {
        const storageKey = resolvedSessionId || sessionId;
        const key = `syncedMessageIds-${storageKey}`;
        sessionStorage.setItem(key, JSON.stringify([...ids]));
      } catch (err) {
        console.warn("Failed to save syncedMessageIds to sessionStorage:", err);
      }
    },
    [resolvedSessionId],
  );

  const loadSyncedIds = useCallback(
    (sessionId: string): Set<string> => {
      try {
        const storageKey = resolvedSessionId || sessionId;
        const key = `syncedMessageIds-${storageKey}`;
        const stored = sessionStorage.getItem(key);
        if (stored) {
          return new Set(JSON.parse(stored));
        }
      } catch (err) {
        console.warn("Failed to load syncedMessageIds from sessionStorage:", err);
      }
      return new Set();
    },
    [resolvedSessionId],
  );

  const clearSyncedIds = useCallback(
    (sessionId: string) => {
      try {
        const storageKey = resolvedSessionId || sessionId;
        const key = `syncedMessageIds-${storageKey}`;
        sessionStorage.removeItem(key);
      } catch (err) {
        console.warn("Failed to clear syncedMessageIds from sessionStorage:", err);
      }
    },
    [resolvedSessionId],
  );

  useEffect(() => {
    setSelectedVoice(selectedPersona.defaultVoice);
  }, [selectedPersona.id, selectedPersona.defaultVoice]);

  useEffect(() => {
    if (!isViewingHistory) {
      setIsResuming(false);
    }
  }, [isViewingHistory]);

  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (isDesktop) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [isDesktop]);

  const historyQuery = useQuery<LiveSessionDetailResponse>({
    queryKey: ["live-session-detail", resolvedSessionId],
    queryFn: () =>
      getLiveSessionDetailFn({
        data: { sessionId: resolvedSessionId! },
      }) as Promise<LiveSessionDetailResponse>,
    enabled: Boolean(resolvedSessionId),
  });
  const assessmentQuery = useQuery<{ assessment: LiveSessionAssessment }>({
    queryKey: ["live-session-assessment", resolvedSessionId],
    queryFn: () =>
      getLiveSessionAssessmentFn({
        data: { liveSessionId: resolvedSessionId! },
      }) as Promise<{ assessment: LiveSessionAssessment }>,
    enabled: Boolean(resolvedSessionId),
  });
  const observerOutputsQuery = useQuery<{ outputs: LiveObserverOutputRecord[] }>({
    queryKey: ["live-session-observer-outputs", resolvedSessionId],
    queryFn: () =>
      getLiveObserverOutputsFn({
        data: { liveSessionId: resolvedSessionId! },
      }) as Promise<{ outputs: LiveObserverOutputRecord[] }>,
    enabled: Boolean(resolvedSessionId),
  });
  const historyMessages = useMemo(() => {
    if (!historyQuery.data) return [];
    return historyQuery.data.messages.map((message, index) => ({
      id: message.id,
      role: (message.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: message.content,
      timestamp: new Date(message.createdAt),
      // Assign sequence numbers based on order from database
      sequenceNumber: index + 1,
      isStreaming: false,
    }));
  }, [historyQuery.data]);
  const assessmentEntries = assessmentQuery.data?.assessment ?? [];
  const observerHistoryOutputs = useMemo<LiveObserverOutput[]>(() => {
    const outputs = observerOutputsQuery.data?.outputs ?? [];
    return outputs.map((entry) => ({
      id: entry.clientOutputId ?? entry.id,
      createdAt: new Date(entry.createdAt).getTime(),
      transcript: entry.transcript,
      suggestions: entry.suggestions,
      confidence: entry.confidence,
    }));
  }, [observerOutputsQuery.data]);

  const lastHistorySequenceNumber = useMemo(() => {
    if (!historyMessages.length) return 0;
    return Math.max(...historyMessages.map((message) => message.sequenceNumber));
  }, [historyMessages]);

  const ensureLiveSessionId = useCallback(async (): Promise<string> => {
    const session = activeSessionRef.current;
    if (!session) throw new Error("No active session");
    if (session.liveSessionId) return session.liveSessionId;

    // If session creation is already in progress, wait for it
    if (sessionCreationPromiseRef.current) {
      return sessionCreationPromiseRef.current;
    }

    console.log("[LiveSync] ensureLiveSessionId: creating new live session record");

    // Create promise for session creation
    const creationPromise = (async () => {
      try {
        const { createLiveSessionFn } = await import("~/lib/dashboard/live/session");
        const { liveSessionId } = await createLiveSessionFn({
          data: { session },
        });
        activeSessionRef.current = { ...session, liveSessionId };
        queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
        return liveSessionId;
      } finally {
        sessionCreationPromiseRef.current = null;
      }
    })();

    sessionCreationPromiseRef.current = creationPromise;
    return creationPromise;
  }, [queryClient]);

  const handleResumptionHandle = useCallback((handle: string, resumable: boolean) => {
    if (!resumable) return;
    resumptionHandleRef.current = handle;
    logLiveAssessment("resumption_handle_update", {
      resumable,
      handle: formatHandleForLog(handle),
    });
  }, []);

  const {
    connect,
    disconnect,
    startRecording,
    sendText,
    sendContext,
    sendTurns,
    status,
    error,
    isRecording,
    messages,
    stopRecording: pause,
    resume,
  } = useGeminiLive({
    apiKey: "",
    voiceName: selectedVoice,
    initialSequenceNumber: lastHistorySequenceNumber,
    onResumptionHandle: handleResumptionHandle,
    onInputAudioChunk: (chunk) => {
      audioChunkHandlerRef.current?.(chunk);
    },
  });

  const handleObserverOutput = useCallback(
    async (output: LiveObserverOutput) => {
      if (isReadOnlyHistory) return;
      const session = activeSessionRef.current;
      if (!session) return;

      let liveSessionId = session.liveSessionId;
      if (!liveSessionId) {
        try {
          liveSessionId = await ensureLiveSessionId();
        } catch (persistError) {
          console.warn("[Observer] Failed to ensure live session id", persistError);
          return;
        }
      }

      try {
        await appendLiveObserverOutputFn({
          data: {
            liveSessionId,
            output: {
              clientOutputId: output.id,
              transcript: output.transcript,
              suggestions: output.suggestions,
              confidence: output.confidence,
              uiLocale,
              createdAt: new Date(output.createdAt).toISOString(),
            },
          },
        });
      } catch (persistError) {
        console.warn("[Observer] Failed to persist output", persistError);
      }
    },
    [ensureLiveSessionId, isReadOnlyHistory, uiLocale],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const historyPersona = useMemo(() => {
    const personaId = historyQuery.data?.session.metadata?.personaId;
    return personaId ? getPersonaById(personaId) : selectedPersona;
  }, [historyQuery.data?.session.metadata?.personaId, selectedPersona]);
  const activePersona = isViewingHistory ? historyPersona : selectedPersona;
  const isActiveSession = status === "connected";
  const isConnecting = status === "connecting" || isFetchingToken;
  const displayMessages = useMemo(() => {
    if (!isViewingHistory) return messages;
    if (!isResuming) return historyMessages;
    return [...historyMessages, ...messages];
  }, [historyMessages, isResuming, isViewingHistory, messages]);
  const observer = useLiveObserverSidecar({
    uiLocale,
    personaName: activePersona.name,
    personaPrompt: activePersona.systemPrompt,
    status,
    isReadOnlyHistory,
    messages: displayMessages,
    minSequenceNumber: lastHistorySequenceNumber,
    onInjectPrompt: (text) => {
      sendContext(formatSidecarInjection(text));
    },
    onOutput: handleObserverOutput,
  });
  useEffect(() => {
    audioChunkHandlerRef.current = observer.ingestAudioChunk;
  }, [observer.ingestAudioChunk]);
  const canTriggerObserver = observer.canTrigger;
  const observerPanelOutputs = useMemo(() => {
    if (!isViewingHistory) return observer.outputs;
    if (isReadOnlyHistory) return observerHistoryOutputs;

    const byId = new Map<string, LiveObserverOutput>();
    observerHistoryOutputs.forEach((entry) => {
      byId.set(entry.id, entry);
    });
    observer.outputs.forEach((entry) => {
      byId.set(entry.id, entry);
    });
    return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [isReadOnlyHistory, isViewingHistory, observer.outputs, observerHistoryOutputs]);
  const observerPanelError = isReadOnlyHistory
    ? observerOutputsQuery.error
    : observer.error;
  const isHistoryLoading = isViewingHistory && historyQuery.isLoading;
  const historyError = isViewingHistory ? historyQuery.error : null;
  const isNewSession =
    !isViewingHistory && displayMessages.length === 0 && !isActiveSession;
  const isStartDisabled =
    isConnecting ||
    (!isActiveSession && isViewingHistory && (isHistoryLoading || Boolean(historyError)));
  const trimmedInput = textInput.trim();
  const canSendText = isActiveSession && !isReadOnlyHistory && trimmedInput.length > 0;
  const failedSyncCount = useMemo(() => {
    let count = 0;
    syncStates.forEach((state) => {
      if (state.status === "failed" && state.retryCount >= 3) {
        count += 1;
      }
    });
    return count;
  }, [syncStates]);

  const buildSessionMeta = useCallback(
    (): LiveSessionMeta => ({
      sessionId: crypto.randomUUID(),
      personaId: selectedPersona.id,
      personaName: selectedPersona.name,
      voice: selectedVoice,
      uiLocale,
      startedAt: new Date().toISOString(),
    }),
    [selectedPersona.id, selectedPersona.name, selectedVoice, uiLocale],
  );

  useEffect(() => {
    if (error) setSessionError(error);
  }, [error]);

  useEffect(() => {
    if (!isViewingHistory || !historyQuery.data) return;
    const personaId = historyQuery.data.session.metadata?.personaId;
    const voice = historyQuery.data.session.metadata?.voice;
    if (personaId) {
      setSelectedPersona(getPersonaById(personaId));
    }
    if (voice) {
      setSelectedVoice(voice);
    }
  }, [historyQuery.data, isViewingHistory]);

  useEffect(() => {
    if (status === "connected" && !isRestoringHistory) {
      if (!isRecording && !isPaused) {
        startRecording();
      }
      if (!hasSentGreetingRef.current && !isResuming) {
        sendText("Hello!", true);
        hasSentGreetingRef.current = true;
      }
    } else if (status !== "connected") {
      hasSentGreetingRef.current = false;
      setIsPaused(false);
    }
  }, [
    status,
    isRecording,
    isPaused,
    isResuming,
    isRestoringHistory,
    startRecording,
    sendText,
  ]);

  useEffect(() => {
    if (status !== "connected" || !pendingSessionRef.current) return;
    activeSessionRef.current = pendingSessionRef.current;
    pendingSessionRef.current = null;
    // Note: syncedMessageIdsRef is already set in connectSession/connectResumeSession
  }, [status]);

  const syncPreviousSession = useCallback(async () => {
    console.log("[LiveSync] syncPreviousSession triggered", {
      sessionId: activeSessionRef.current?.sessionId,
      liveSessionId: activeSessionRef.current?.liveSessionId,
    });
    const session = activeSessionRef.current;
    const currentMessages = messagesRef.current;

    if (!session || currentMessages.length === 0) return;
    if (lastPersistedSessionIdRef.current === session.sessionId) return;
    if (!session.liveSessionId) {
      console.warn("Live session id missing; skipping sync.");
      return;
    }

    // Cancel any pending debounced sync
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = null;
    }

    try {
      // First, sync all remaining unsynced non-streaming messages
      const unsyncedMessages = currentMessages.filter(
        (m) => !m.isStreaming && !syncedMessageIdsRef.current.has(m.id),
      );

      if (unsyncedMessages.length > 0) {
        const messageIds = unsyncedMessages.map((m) => m.id);
        syncQueueRef.current?.markSyncing(messageIds);

        const { appendLiveSessionMessagesFn } =
          await import("~/lib/dashboard/live/session");

        // Use retry logic for final sync
        await retryWithBackoff(
          async () => {
            await appendLiveSessionMessagesFn({
              data: {
                liveSessionId: session.liveSessionId!,
                messages: unsyncedMessages.map((message) => ({
                  id: message.id,
                  role: message.role,
                  content: message.content,
                  timestamp: message.timestamp.toISOString(),
                  sequenceNumber: message.sequenceNumber,
                })),
              },
            });
          },
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt) => {
              console.log(`[LiveSync] Retrying final sync, attempt ${attempt}`);
            },
          },
        );

        unsyncedMessages.forEach((message) => {
          syncedMessageIdsRef.current.add(message.id);
        });
        syncQueueRef.current?.markSynced(messageIds);
        saveSyncedIds(session.sessionId, syncedMessageIdsRef.current);
      }

      // Then close the session
      const { closeLiveSessionFn } = await import("~/lib/dashboard/live/session");
      await closeLiveSessionFn({
        data: {
          liveSessionId: session.liveSessionId,
          session: { ...session, endedAt: new Date().toISOString() },
        },
      });
      lastPersistedSessionIdRef.current = session.sessionId;
      queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
    } catch (err) {
      console.error("Failed to store previous live session", err);
      // Don't throw - allow disconnection to proceed
    }
  }, [queryClient, saveSyncedIds]);

  const appendTurnMessages = useCallback(
    async (turnMessages: Message[]) => {
      console.log("[LiveSync] appendTurnMessages called", {
        count: turnMessages.length,
        messages: turnMessages.map((m) => ({
          id: m.id,
          role: m.role,
          isStreaming: m.isStreaming,
          sequenceNumber: m.sequenceNumber,
          contentLength: m.content.length,
        })),
      });
      const session = activeSessionRef.current;
      if (!session?.liveSessionId) return;

      // Filter out streaming messages (incomplete) and already synced ones
      const unsynced = turnMessages.filter(
        (message) => !message.isStreaming && !syncedMessageIdsRef.current.has(message.id),
      );
      if (unsynced.length === 0) return;

      const messageIds = unsynced.map((m) => m.id);
      syncQueueRef.current?.markPending(messageIds);
      syncQueueRef.current?.markSyncing(messageIds);

      try {
        const { appendLiveSessionMessagesFn } =
          await import("~/lib/dashboard/live/session");

        // Use retry logic with exponential backoff
        await retryWithBackoff(
          async () => {
            await appendLiveSessionMessagesFn({
              data: {
                liveSessionId: session.liveSessionId!,
                messages: unsynced.map((message) => ({
                  id: message.id,
                  role: message.role,
                  content: message.content,
                  timestamp: message.timestamp.toISOString(),
                  sequenceNumber: message.sequenceNumber,
                })),
              },
            });
          },
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt, error) => {
              console.log(`[LiveSync] Retry attempt ${attempt}`, error);
            },
          },
        );

        // Mark as synced on success
        unsynced.forEach((message) => {
          syncedMessageIdsRef.current.add(message.id);
        });
        syncQueueRef.current?.markSynced(messageIds);
        saveSyncedIds(session.sessionId, syncedMessageIdsRef.current);
        lastSyncedCountRef.current = syncedMessageIdsRef.current.size;
        queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
      } catch (err) {
        // Mark as failed after all retries exhausted
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("[LiveSync] Failed to append live messages after retries", err);
        syncQueueRef.current?.markFailed(messageIds, errorMessage);
      }
    },
    [queryClient, saveSyncedIds],
  );

  const connectSession = useCallback(async () => {
    setSessionError(null);
    setIsFetchingToken(true);
    observer.reset();
    try {
      const [, { token }] = await Promise.all([syncPreviousSession(), getGeminiToken()]);

      const session = buildSessionMeta();
      resumptionHandleRef.current = null;
      logLiveAssessment("session_start", {
        sessionId: session.sessionId,
        personaId: session.personaId,
        voice: session.voice,
      });
      pendingSessionRef.current = session;
      // Clear syncedMessageIds for the previous active session (if any)
      const previousSession = activeSessionRef.current;
      if (previousSession) {
        clearSyncedIds(previousSession.sessionId);
      }
      // Load syncedMessageIds for the new session
      syncedMessageIdsRef.current = loadSyncedIds(session.sessionId);

      // Gather device context
      const now = new Date();
      const deviceContext = `
System Context:
- User Time: ${now.toLocaleString(undefined, {
        dateStyle: "full",
        timeStyle: "medium",
      })}
- TimeZone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
- Language: ${getLocale()}
- User Agent: ${navigator.userAgent}
`;
      const fullSystemPrompt = `${selectedPersona.systemPrompt}\n\n${deviceContext}\n\n${buildSidecarSystemPrompt()}`;

      await connect(fullSystemPrompt, token);
    } catch (err) {
      console.error("Connection error:", err);
      setSessionError(err instanceof Error ? err.message : "Failed to connect");
      pendingSessionRef.current = null;
    } finally {
      setIsFetchingToken(false);
    }
  }, [
    buildSessionMeta,
    clearSyncedIds,
    connect,
    loadSyncedIds,
    observer.reset,
    selectedPersona.systemPrompt,
    syncPreviousSession,
  ]);

  const connectResumeSession = useCallback(async () => {
    if (!resolvedSessionId || !historyQuery.data) return;
    setSessionError(null);
    setIsFetchingToken(true);
    observer.reset();
    try {
      const [, { token }] = await Promise.all([syncPreviousSession(), getGeminiToken()]);

      const session = buildSessionMeta();
      resumptionHandleRef.current = null;
      logLiveAssessment("session_resume_start", {
        sessionId: session.sessionId,
        liveSessionId: resolvedSessionId,
      });
      pendingSessionRef.current = { ...session, liveSessionId: resolvedSessionId };
      setIsResuming(true);
      // Clear syncedMessageIds for the previous active session (if any)
      const previousSession = activeSessionRef.current;
      if (previousSession) {
        clearSyncedIds(previousSession.sessionId);
      }
      // Load syncedMessageIds for the resuming session
      syncedMessageIdsRef.current = loadSyncedIds(session.sessionId);

      const now = new Date();
      const deviceContext = `
System Context:
- User Time: ${now.toLocaleString(undefined, {
        dateStyle: "full",
        timeStyle: "medium",
      })}
- TimeZone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
- Language: ${getLocale()}
- User Agent: ${navigator.userAgent}
`;

      const historyContext = historyMessages
        .slice(-10) // Limit to last 10 turns
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const fullSystemPrompt = `${selectedPersona.systemPrompt}\n\n${deviceContext}\n\n${buildSidecarSystemPrompt()}\n\n[PREVIOUS CONVERSATION CONTEXT]\n${historyContext}`;

      // Set restoring state BEFORE connecting to prevent race condition with auto-recording
      if (historyMessages.length > 0) {
        setIsRestoringHistory(true);
      }

      await connect(fullSystemPrompt, token);

      // Send history with error handling
      if (historyMessages.length > 0) {
        try {
          console.log(
            `[LiveSync] Sending ${historyMessages.length} history messages to Gemini`,
          );
          await sendTurns(
            historyMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            true,
          );
          console.log("[LiveSync] History successfully sent to Gemini");
        } catch (historyError) {
          console.error("[LiveSync] Failed to send history to Gemini:", historyError);
          // Show warning but don't fail the connection
          setSessionError(
            "Connected, but failed to restore conversation history. Starting fresh context.",
          );
          // Clear the error after 5 seconds
          setTimeout(() => setSessionError(null), 5000);
        } finally {
          setIsRestoringHistory(false);
        }
      }
    } catch (err) {
      console.error("Resume connection error:", err);
      setSessionError(err instanceof Error ? err.message : "Failed to resume");
      pendingSessionRef.current = null;
      setIsResuming(false);
      setIsRestoringHistory(false);
    } finally {
      setIsFetchingToken(false);
    }
  }, [
    buildSessionMeta,
    clearSyncedIds,
    connect,
    loadSyncedIds,
    observer.reset,
    sendTurns,
    historyMessages,
    historyQuery.data,
    resolvedSessionId,
    selectedPersona.systemPrompt,
    syncPreviousSession,
  ]);

  const triggerAssessment = useCallback(
    async (liveSessionId: string, resumptionHandle: string) => {
      try {
        logLiveAssessment("assessment_trigger", {
          liveSessionId,
          handle: formatHandleForLog(resumptionHandle),
          uiLocale,
        });
        const result = await evaluateLiveSessionFn({
          data: {
            liveSessionId,
            resumptionHandle,
            uiLocale,
          },
        });
        const languages = result.assessment.map(
          (entry) => `${entry.language}:${entry.overall_cefr}`,
        );
        logLiveAssessment("assessment_trigger_success", {
          liveSessionId,
          formattedBy: result.formattedBy,
          languageCount: result.assessment.length,
          languages,
        });
      } catch (err) {
        console.error("[LiveAssessment] Failed to evaluate session", err);
      }
    },
    [uiLocale],
  );

  const handleToggleSession = useCallback(async () => {
    if (status === "connected" || status === "connecting") {
      await syncPreviousSession();
      const session = activeSessionRef.current;
      const resumptionHandle = resumptionHandleRef.current;
      let liveSessionId = session?.liveSessionId ?? null;
      if (!liveSessionId && session && resumptionHandle) {
        try {
          liveSessionId = await ensureLiveSessionId();
        } catch (err) {
          console.warn("[LiveAssessment] Failed to ensure session id", err);
        }
      }
      logLiveAssessment("end_call", {
        liveSessionId,
        handle: formatHandleForLog(resumptionHandle),
      });
      disconnect();
      resumptionHandleRef.current = null;
      if (liveSessionId && resumptionHandle) {
        void triggerAssessment(liveSessionId, resumptionHandle);
      }
      return;
    }
    if (isViewingHistory) {
      await connectResumeSession();
      return;
    }
    await connectSession();
  }, [
    connectResumeSession,
    connectSession,
    disconnect,
    ensureLiveSessionId,
    isViewingHistory,
    status,
    syncPreviousSession,
    triggerAssessment,
  ]);

  const handleToggleMute = useCallback(() => {
    if (isRecording) {
      pause();
      setIsPaused(true);
    } else {
      resume();
      setIsPaused(false);
    }
  }, [isRecording, pause, resume]);

  const handleSendMessage = useCallback(() => {
    if (!isActiveSession || isReadOnlyHistory || !textInput.trim()) return;
    sendText(textInput);
    setTextInput("");
  }, [isActiveSession, isReadOnlyHistory, sendText, textInput]);

  const handleTriggerObserver = useCallback(() => {
    observer.triggerNow();
  }, [observer.triggerNow]);

  const handleRetryFailedMessages = useCallback(async () => {
    const failedIds = syncQueueRef.current?.retryFailed() || [];
    if (failedIds.length === 0) return;

    const failedMessages = messages.filter((m) => failedIds.includes(m.id));
    if (failedMessages.length > 0) {
      await appendTurnMessages(failedMessages);
    }
  }, [appendTurnMessages, messages]);

  // Debounced batch sync effect - syncs all unsynced non-streaming messages
  // after 1.5 seconds of no new messages (conversation turn complete)
  useEffect(() => {
    if (!isActiveSession || isReadOnlyHistory) return;
    const session = activeSessionRef.current;
    if (!session) return;

    // Ensure session exists in DB when first model response arrives
    const hasModelMessage = messages.some((m) => m.role === "assistant");
    if (hasModelMessage && !session.liveSessionId) {
      // Wait for session creation before syncing
      void ensureLiveSessionId().catch((err) => {
        console.error("[LiveSync] Failed to ensure session ID", err);
      });
      return;
    }

    // Cancel any pending sync
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = null;
    }

    // Get non-streaming messages that haven't been synced yet
    const syncableMessages = messages.filter(
      (m) => !m.isStreaming && !syncedMessageIdsRef.current.has(m.id),
    );

    if (syncableMessages.length === 0 || !session.liveSessionId) return;

    // Schedule batch sync after 1.5s of no new messages
    console.log(
      "[LiveSync] Scheduling batch sync in 1.5s for messages:",
      syncableMessages.length,
    );
    syncDebounceRef.current = setTimeout(() => {
      console.log("[LiveSync] Executing scheduled batch sync");
      void appendTurnMessages(syncableMessages);
    }, 1500);

    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, [
    appendTurnMessages,
    ensureLiveSessionId,
    isActiveSession,
    isReadOnlyHistory,
    messages,
  ]);

  // Cleanup: sync remaining messages on disconnect
  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
      // Also try to sync when component unmounts
      void syncPreviousSession();
    };
  }, [syncPreviousSession]);

  // Handle page hide/unload events for robust sync
  const syncPreviousSessionRef = useRef(syncPreviousSession);
  useEffect(() => {
    syncPreviousSessionRef.current = syncPreviousSession;
  }, [syncPreviousSession]);

  useEffect(() => {
    const handleUnload = () => {
      // Use the latest ref to call sync
      void syncPreviousSessionRef.current();
    };
    window.addEventListener("pagehide", handleUnload);
    return () => window.removeEventListener("pagehide", handleUnload);
  }, []);

  return (
    <div className="relative flex h-screen min-h-0 flex-col">
      <a
        href="#live-main"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4",
          "focus:z-50 focus:rounded-full focus:bg-background focus:px-4",
          "focus:py-2 focus:text-sm focus:shadow",
        )}
      >
        {m.live_skip_to_content()}
      </a>
      {isActiveSession && <SessionBlocker disconnect={disconnect} />}

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        {!isDesktop && (
          <Dialog open={isInsightsOpen} onOpenChange={setIsInsightsOpen}>
            <DialogContent
              className={cn(
                "inset-0 max-w-none translate-x-0 translate-y-0",
                "h-dvh w-screen overflow-hidden rounded-none border-0 bg-background p-0 shadow-none",
              )}
            >
              <DialogTitle className="sr-only">{m.live_observer_title()}</DialogTitle>
              <ObserverPanel
                outputs={observerPanelOutputs}
                error={observerPanelError}
                canTrigger={canTriggerObserver}
                onTrigger={handleTriggerObserver}
                assessment={isViewingHistory ? assessmentEntries : null}
                assessmentLocale={uiLocale}
                className="h-full w-full"
              />
            </DialogContent>
          </Dialog>
        )}

        {isDesktop ? (
          <ResizablePanelGroup
            direction="horizontal"
            className="min-h-0 flex-1 overflow-hidden border border-border bg-background "
          >
            <ResizablePanel
              minSize={MAIN_PANEL_MIN_SIZE}
            >
              <main id="live-main" className="flex h-full min-w-0 flex-col">
                <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
                  <HistoryBanner
                    isVisible={isViewingHistory}
                    sessionTitle={historyQuery.data?.session.title ?? null}
                  />

                  <section
                    aria-label={m.live_page_title()}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
                  >
                    {isNewSession ? (
                      <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6 py-10">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-primary/10">
                            <Sparkles
                              aria-hidden="true"
                              className="h-5 w-5 text-primary"
                            />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">
                              {m.live_greeting({ name: userName })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {m.live_prompt_question()}
                            </p>
                          </div>
                        </div>

                        <div className="border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                          {m.live_status_ready()}
                        </div>
                      </div>
                    ) : (
                      <LiveTranscript
                        messages={displayMessages}
                        status={status}
                        persona={isViewingHistory ? historyPersona : selectedPersona}
                        className="h-full w-full"
                      />
                    )}
                  </section>

                  <div className="mt-auto flex flex-col gap-3">
                    <LiveStatusSection
                      isRestoringHistory={isRestoringHistory}
                      sessionError={sessionError}
                      failedSyncCount={failedSyncCount}
                      onRetryFailedMessages={handleRetryFailedMessages}
                    />
                    {!isViewingHistory && <LiveControls
                      selectedPersonaId={selectedPersona.id}
                      onSelectPersona={setSelectedPersona}
                      selectedVoice={selectedVoice}
                      onVoiceChange={setSelectedVoice}
                      isActiveSession={isActiveSession}
                      isViewingHistory={isViewingHistory}
                      isConnecting={isConnecting}
                      isReadOnlyHistory={isReadOnlyHistory}
                      isRecording={isRecording}
                      isPaused={isPaused}
                      isStartDisabled={isStartDisabled}
                      onToggleMute={handleToggleMute}
                      onToggleSession={handleToggleSession}
                      textInput={textInput}
                      onTextInputChange={setTextInput}
                      onSendMessage={handleSendMessage}
                      canSendText={canSendText}
                      className="w-full"
                    />}
                  </div>
                </div>
              </main>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border/70 hover:bg-border" />

            <ResizablePanel
              panelRef={sidebarPanelRef}
              minSize={SIDEBAR_MIN_SIZE}
              maxSize={SIDEBAR_MAX_SIZE}
              collapsible
              collapsedSize={0}
            >
              <ObserverPanel
                outputs={observerPanelOutputs}
                error={observerPanelError}
                canTrigger={canTriggerObserver}
                onTrigger={handleTriggerObserver}
                assessment={isViewingHistory ? assessmentEntries : null}
                assessmentLocale={uiLocale}
                className="h-full w-full"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <main
            id="live-main"
            className="flex min-h-0 flex-1 flex-col overflow-hidden border-y border-border bg-background"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              <HistoryBanner
                isVisible={isViewingHistory}
                sessionTitle={historyQuery.data?.session.title ?? null}
              />

              <section
                aria-label={m.live_page_title()}
                className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-background"
              >
                {isNewSession ? (
                  <div className="flex flex-1 flex-col items-start justify-center gap-4 px-5 py-10">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-primary/10">
                        <Sparkles aria-hidden="true" className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-foreground">
                          {m.live_greeting({ name: userName })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {m.live_prompt_question()}
                        </p>
                      </div>
                    </div>

                    <div className="border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      {m.live_status_ready()}
                    </div>
                  </div>
                ) : (
                  <LiveTranscript
                    messages={displayMessages}
                    status={status}
                    persona={isViewingHistory ? historyPersona : selectedPersona}
                    className="h-full w-full"
                  />
                )}
              </section>

              <div className="mt-auto flex flex-col gap-3">
                <LiveStatusSection
                  isRestoringHistory={isRestoringHistory}
                  sessionError={sessionError}
                  failedSyncCount={failedSyncCount}
                  onRetryFailedMessages={handleRetryFailedMessages}
                />

                <LiveControls
                  selectedPersonaId={selectedPersona.id}
                  onSelectPersona={setSelectedPersona}
                  selectedVoice={selectedVoice}
                  onVoiceChange={setSelectedVoice}
                  isActiveSession={isActiveSession}
                  isViewingHistory={isViewingHistory}
                  isConnecting={isConnecting}
                  isReadOnlyHistory={isReadOnlyHistory}
                  isRecording={isRecording}
                  isPaused={isPaused}
                  isStartDisabled={isStartDisabled}
                  onToggleMute={handleToggleMute}
                  onToggleSession={handleToggleSession}
                  textInput={textInput}
                  onTextInputChange={setTextInput}
                  onSendMessage={handleSendMessage}
                  canSendText={canSendText}
                  className="w-full"
                />
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
