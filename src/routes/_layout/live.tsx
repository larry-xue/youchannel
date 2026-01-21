import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useBlocker,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Send,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import { Card } from "~/lib/components/ui/card";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { Textarea } from "~/lib/components/ui/textarea";
import { AmbientGlowBackdrop } from "~/lib/dashboard/live/components/AmbientGlowBackdrop";
import { LiveHistorySidebar } from "~/lib/dashboard/live/components/LiveHistorySidebar";
import {
  LiveTranscript,
  VoiceSelector,
} from "~/lib/dashboard/live/components/LiveVoiceSession";
import { PersonaSelector } from "~/lib/dashboard/live/components/PersonaSelector";
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
  MessageSyncQueue,
  retryWithBackoff,
  type MessageSyncState,
} from "~/lib/dashboard/live/retry";
import { useObserverInsights } from "~/lib/dashboard/live/useObserverInsights";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useGeminiLive, type Message } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";
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

export const Route = createFileRoute("/_layout/live")({
  component: LiveRoute,
  head: () => ({
    meta: [
      {
        title: "Live Voice Chat | Fluentlyby.ai",
      },
      {
        name: "description",
        content: "Practice speaking with AI-powered conversation partners",
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
  const sessionCreationPromiseRef = useRef<Promise<string> | null>(null);
  const syncQueueRef = useRef<MessageSyncQueue | null>(null);
  const messagesRef = useRef<Message[]>([]);

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
  const navigate = useNavigate();
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

  const historyQuery = useQuery<LiveSessionDetailResponse>({
    queryKey: ["live-session-detail", resolvedSessionId],
    queryFn: () =>
      getLiveSessionDetailFn({
        data: { sessionId: resolvedSessionId! },
      }) as Promise<LiveSessionDetailResponse>,
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

  const lastHistorySequenceNumber = useMemo(() => {
    if (!historyMessages.length) return 0;
    return Math.max(...historyMessages.map((message) => message.sequenceNumber));
  }, [historyMessages]);

  const {
    connect,
    disconnect,
    startRecording,
    sendText,
    sendTurns,
    status,
    error,
    isRecording,
    messages,
    inputLevel,
    outputLevel,
    stopRecording: pause,
    resume,
  } = useGeminiLive({
    apiKey: "",
    voiceName: selectedVoice,
    initialSequenceNumber: lastHistorySequenceNumber,
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const observer = useObserverInsights(uiLocale);
  const historyPersona = useMemo(() => {
    const personaId = historyQuery.data?.session.metadata?.personaId;
    return personaId ? getPersonaById(personaId) : selectedPersona;
  }, [historyQuery.data?.session.metadata?.personaId, selectedPersona]);
  const displayMessages = useMemo(() => {
    if (!isViewingHistory) return messages;
    if (!isResuming) return historyMessages;
    return [...historyMessages, ...messages];
  }, [historyMessages, isResuming, isViewingHistory, messages]);
  const canTriggerObserver = displayMessages.length > 0 && !observer.isRunning;

  const isActiveSession = status === "connected";
  const isConnecting = status === "connecting" || isFetchingToken;
  const isHistoryLoading = isViewingHistory && historyQuery.isLoading;
  const historyError = isViewingHistory ? historyQuery.error : null;
  const historyErrorMessage =
    historyError instanceof Error ? historyError.message : null;
  const trimmedInput = textInput.trim();
  const canSendText =
    isActiveSession && !isReadOnlyHistory && trimmedInput.length > 0;
  const failedSyncCount = useMemo(() => {
    let count = 0;
    syncStates.forEach((state) => {
      if (state.status === "failed" && state.retryCount >= 3) {
        count += 1;
      }
    });
    return count;
  }, [syncStates]);
  const handleStartNewSession = useCallback(() => {
    navigate({ to: "/live" });
  }, [navigate]);
  const handleRetryHistory = useCallback(() => {
    void historyQuery.refetch();
  }, [historyQuery]);

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

  const connectSession = useCallback(async () => {
    setSessionError(null);
    setIsFetchingToken(true);
    try {
      const [, { token }] = await Promise.all([
        syncPreviousSession(),
        getGeminiToken(),
      ]);

      const session = buildSessionMeta();
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
      const fullSystemPrompt = `${selectedPersona.systemPrompt}\n\n${deviceContext}`;

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
    selectedPersona.systemPrompt,
    syncPreviousSession,
  ]);

  const connectResumeSession = useCallback(async () => {
    if (!resolvedSessionId || !historyQuery.data) return;
    setSessionError(null);
    setIsFetchingToken(true);
    try {
      const [, { token }] = await Promise.all([
        syncPreviousSession(),
        getGeminiToken(),
      ]);

      const session = buildSessionMeta();
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

      const fullSystemPrompt = `${selectedPersona.systemPrompt}\n\n${deviceContext}\n\n[PREVIOUS CONVERSATION CONTEXT]\n${historyContext}`;

      // Set restoring state BEFORE connecting to prevent race condition with auto-recording
      if (historyMessages.length > 0) {
        setIsRestoringHistory(true);
      }

      await connect(fullSystemPrompt, token);

      // Send history with error handling
      if (historyMessages.length > 0) {
        try {
          console.log(`[LiveSync] Sending ${historyMessages.length} history messages to Gemini`);
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
    sendTurns,
    historyMessages,
    historyQuery.data,
    resolvedSessionId,
    selectedPersona.systemPrompt,
    syncPreviousSession,
  ]);

  const handleToggleSession = useCallback(async () => {
    if (status === "connected" || status === "connecting") {
      await syncPreviousSession();
      disconnect();
      return;
    }
    await connectSession();
  }, [connectSession, disconnect, status, syncPreviousSession]);

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
    observer.triggerFromMessages(displayMessages);
  }, [displayMessages, observer]);

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
    <div className="relative h-[calc(100vh-10rem)]">
      <a
        href="#live-main"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4",
          "focus:z-50 focus:rounded-full focus:bg-background focus:px-4",
          "focus:py-2 focus:text-sm focus:shadow",
        )}
      >
        Skip to content
      </a>
      {isActiveSession && <SessionBlocker disconnect={disconnect} />}
      <AmbientGlowBackdrop
        inputLevel={inputLevel}
        outputLevel={outputLevel}
        className="fixed inset-0 -z-10"
      />

      <div className="relative z-10 h-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
        <div className="flex h-full gap-4">
          <LiveHistorySidebar activeSessionId={resolvedSessionId} />

          <main
            id="live-main"
            aria-labelledby="live-title"
            className="flex min-w-0 flex-1 flex-col gap-4"
          >
            <h1 id="live-title" className="sr-only">
              Live Voice Session
            </h1>
            <HistoryBanner
              isVisible={isViewingHistory}
              isConnecting={isConnecting}
              isLoading={isHistoryLoading}
              errorMessage={historyErrorMessage}
              onNewSession={handleStartNewSession}
              onResume={connectResumeSession}
              onRetry={handleRetryHistory}
            />

            {(isHistoryLoading || historyError instanceof Error) && (
              <div className="space-y-2">
                {isHistoryLoading && (
                  <StatusPill className="bg-muted/40 text-xs text-muted-foreground">
                    Loading session history...
                  </StatusPill>
                )}
                {historyError instanceof Error && (
                  <StatusPill className="bg-destructive/10 text-xs text-destructive">
                    {historyError.message}
                  </StatusPill>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0">
              <div className="grid h-full grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                <div className="col-span-1 lg:col-span-2 h-full min-h-0">
                  <LiveTranscript
                    messages={displayMessages}
                    status={status}
                    persona={isViewingHistory ? historyPersona : selectedPersona}
                    isRecording={isRecording}
                    className="h-full w-full rounded-[24px] border border-border/50 bg-card/60 backdrop-blur-md shadow-md"
                  />
                </div>
                <ObserverPanel
                  outputs={observer.outputs}
                  error={observer.error}
                  canTrigger={canTriggerObserver}
                  onTrigger={handleTriggerObserver}
                />
              </div>
            </div>

            {(isRestoringHistory || sessionError || failedSyncCount > 0) && (
              <div className="flex flex-col items-center gap-2">
                {isRestoringHistory && (
                  <StatusPill
                    className={cn(
                      "mx-auto flex items-center gap-2 bg-blue-500/10 text-sm",
                      "font-medium text-blue-600 backdrop-blur-sm border",
                      "border-blue-500/20 animate-in fade-in slide-in-from-bottom-4",
                    )}
                  >
                    <Loader2
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin"
                    />
                    Restoring conversation memory...
                  </StatusPill>
                )}

                {sessionError && (
                  <StatusPill
                    className={cn(
                      "mx-auto bg-destructive/10 text-sm font-medium text-destructive",
                      "backdrop-blur-sm border border-destructive/20 animate-in",
                      "fade-in slide-in-from-bottom-4",
                    )}
                  >
                    {sessionError}
                  </StatusPill>
                )}

                {failedSyncCount > 0 && (
                  <StatusPill
                    className={cn(
                      "mx-auto flex items-center gap-2 bg-amber-50/90 text-sm",
                      "font-medium text-amber-900 backdrop-blur-sm border",
                      "border-amber-200/50 animate-in fade-in slide-in-from-bottom-4",
                    )}
                  >
                    <AlertCircle aria-hidden="true" className="h-4 w-4" />
                    <span>{failedSyncCount} message(s) failed to sync</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRetryFailedMessages}
                      className="h-6 px-2 text-xs hover:bg-amber-100"
                    >
                      <RefreshCw aria-hidden="true" className="mr-1 h-3 w-3" />
                      Retry
                    </Button>
                  </StatusPill>
                )}
              </div>
            )}

            <LiveControls
              selectedPersonaId={selectedPersona.id}
              onSelectPersona={setSelectedPersona}
              selectedVoice={selectedVoice}
              onVoiceChange={setSelectedVoice}
              isActiveSession={isActiveSession}
              isConnecting={isConnecting}
              isReadOnlyHistory={isReadOnlyHistory}
              isRecording={isRecording}
              isPaused={isPaused}
              onToggleMute={handleToggleMute}
              onToggleSession={handleToggleSession}
              textInput={textInput}
              onTextInputChange={setTextInput}
              onSendMessage={handleSendMessage}
              canSendText={canSendText}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

type HistoryBannerProps = {
  isVisible: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onNewSession: () => void;
  onResume: () => void;
  onRetry: () => void;
};

const HistoryBanner = memo(function HistoryBanner({
  isVisible,
  isConnecting,
  isLoading,
  errorMessage,
  onNewSession,
  onResume,
  onRetry,
}: HistoryBannerProps) {
  if (!isVisible) return null;

  const isResumeDisabled = isConnecting || isLoading || Boolean(errorMessage);
  const resumeLabel = isConnecting
    ? "Resuming..."
    : isLoading
      ? "Loading..."
      : "Resume";
  const helperText = errorMessage
    ? "History failed to load. Retry or start a new session."
    : isLoading
      ? "Loading session history..."
      : "Resume to continue this conversation or start fresh.";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border",
        "border-border/50 bg-card/70 px-4 py-3 shadow-sm",
      )}
    >
      <div>
        <p className="text-sm font-semibold text-foreground">Viewing saved session</p>
        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onNewSession} className="rounded-full px-5" variant="outline">
          New Session
        </Button>
        {errorMessage && (
          <Button
            onClick={onRetry}
            className="rounded-full px-4"
            variant="ghost"
            size="sm"
            disabled={isLoading}
          >
            Retry
          </Button>
        )}
        <Button
          onClick={onResume}
          className="rounded-full px-5"
          disabled={isResumeDisabled}
        >
          {isConnecting || isLoading ? (
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {resumeLabel}
        </Button>
      </div>
    </div>
  );
});

type StatusPillProps = {
  className?: string;
  children: React.ReactNode;
};

const StatusPill = memo(function StatusPill({ className, children }: StatusPillProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded-full px-4 py-1.5", className)}
    >
      {children}
    </div>
  );
});

type LiveControlsProps = {
  selectedPersonaId: string;
  onSelectPersona: (persona: Persona) => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  isActiveSession: boolean;
  isConnecting: boolean;
  isReadOnlyHistory: boolean;
  isRecording: boolean;
  isPaused: boolean;
  onToggleMute: () => void;
  onToggleSession: () => void;
  textInput: string;
  onTextInputChange: (value: string) => void;
  onSendMessage: () => void;
  canSendText: boolean;
};

const LiveControls = memo(function LiveControls({
  selectedPersonaId,
  onSelectPersona,
  selectedVoice,
  onVoiceChange,
  isActiveSession,
  isConnecting,
  isReadOnlyHistory,
  isRecording,
  isPaused,
  onToggleMute,
  onToggleSession,
  textInput,
  onTextInputChange,
  onSendMessage,
  canSendText,
}: LiveControlsProps) {
  const statusLabel = isConnecting
    ? "Connecting"
    : isActiveSession
      ? isPaused
        ? "Paused"
        : "Live"
      : "Offline";
  const statusTone = isConnecting || isPaused
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : isActiveSession
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-muted text-muted-foreground border-border/50";
  const messagePlaceholder = isActiveSession
    ? "Type a message..."
    : "Connect to start chatting...";

  return (
    <Card
      className={cn(
        "shrink-0 p-3 rounded-xl bg-card/80 backdrop-blur-xl border-border/50",
        "shadow-sm z-20 flex flex-col gap-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <PersonaSelector
            selectedId={selectedPersonaId}
            onSelect={onSelectPersona}
            className="w-[180px] h-9"
          />
          <VoiceSelector
            value={selectedVoice}
            onValueChange={onVoiceChange}
            disabled={isActiveSession || isConnecting || isReadOnlyHistory}
            className="w-[140px] h-9"
          />
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold uppercase",
              "tracking-wide",
              statusTone,
            )}
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isActiveSession && !isReadOnlyHistory && (
            <Button
              size="sm"
              variant="outline"
              aria-pressed={isRecording}
              className={cn(
                "h-9 px-3 text-xs font-medium",
                isRecording
                  ? "bg-background"
                  : "bg-amber-50 text-amber-600 border-amber-200",
              )}
              onClick={onToggleMute}
            >
              {isRecording ? (
                <>
                  <Mic aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                  Mute
                </>
              ) : (
                <>
                  <MicOff aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                  Unmute
                </>
              )}
            </Button>
          )}

          <Button
            size="sm"
            className={cn(
              "h-9 px-4 text-sm font-medium transition-all shadow-sm",
              isActiveSession
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-primary hover:bg-primary/90",
            )}
            onClick={onToggleSession}
            disabled={isConnecting || isReadOnlyHistory}
          >
            {isActiveSession ? (
              <>
                <PhoneOff aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                End
              </>
            ) : (
              <>
                {isConnecting ? (
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 h-3.5 w-3.5 animate-spin"
                  />
                ) : (
                  <Phone aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                )}
                {isConnecting ? "Connecting..." : "Start Call"}
              </>
            )}
          </Button>
        </div>
      </div>

      <MessageComposer
        value={textInput}
        onValueChange={onTextInputChange}
        onSend={onSendMessage}
        canSend={canSendText}
        isRecording={isRecording}
        isDisabled={!isActiveSession || isReadOnlyHistory}
        placeholder={messagePlaceholder}
      />
    </Card>
  );
});

type MessageComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  isRecording: boolean;
  isDisabled: boolean;
  placeholder: string;
};

const MessageComposer = memo(function MessageComposer({
  value,
  onValueChange,
  onSend,
  canSend,
  isRecording,
  isDisabled,
  placeholder,
}: MessageComposerProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (canSend) onSend();
      }
    },
    [canSend, onSend],
  );

  return (
    <div className="flex items-end gap-2">
      <div className="relative flex-1">
        {isRecording && (
          <span className="absolute top-3 left-3 flex h-2 w-2" aria-hidden="true">
            <span
              className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full",
                "bg-green-400 opacity-75",
              )}
            ></span>
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2 bg-green-500",
              )}
            ></span>
          </span>
        )}
        <Textarea
          value={value}
          name="live_message"
          autoComplete="off"
          aria-label="Message input"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          className={cn(
            "min-h-[36px] max-h-[120px] py-1.5 px-3 rounded-lg resize-none text-sm",
            isRecording && "pl-8",
          )}
        />
      </div>
      <Button
        size="sm"
        type="button"
        aria-label="Send message"
        disabled={!canSend}
        onClick={onSend}
        className="h-9 w-9 p-0 shrink-0"
      >
        <Send aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );
});

type ObserverPanelProps = {
  outputs: ReturnType<typeof useObserverInsights>["outputs"];
  error: unknown;
  canTrigger: boolean;
  onTrigger: () => void;
};

const ObserverPanel = memo(function ObserverPanel({
  outputs,
  error,
  canTrigger,
  onTrigger,
}: ObserverPanelProps) {
  const hasOutputs = outputs.length > 0;

  return (
    <aside
      className={cn(
        "hidden lg:flex col-span-1 min-w-[320px] max-w-[420px] flex-col",
        "rounded-[28px] border border-border/50 bg-card/60 backdrop-blur-md",
        "p-4 shadow-md",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Observer Agent</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onTrigger} disabled={!canTrigger}>
            Run
          </Button>
        </div>
      </div>

      {error instanceof Error && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive",
          )}
        >
          {error.message}
        </div>
      )}

      <ScrollArea className="flex-1 mt-3 -mr-3 pr-3">
        <div className="space-y-2 pb-2">
          {!hasOutputs && (
            <div
              className={cn(
                "rounded-2xl border border-border/40 bg-background/40 p-3 text-xs",
                "text-muted-foreground",
              )}
            >
              No insights yet. Run the observer to generate notes.
            </div>
          )}
          {outputs.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "rounded-2xl border border-border/50 bg-card/70 p-3 shadow-sm",
                "overflow-auto break-words",
              )}
            >
              {entry.explanation && entry.explanation.length > 0 && (
                <div className="mt-3 space-y-2">
                  {entry.explanation.map((item) => {
                    const itemKey = `${entry.id}-${item.term}-${item.example}`;
                    return (
                      <div
                        key={itemKey}
                        className="bg-background/40 rounded-lg p-2 text-xs"
                      >
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-primary">
                            {item.term}
                          </span>
                          <span className="text-muted-foreground">-</span>
                          <span className="text-foreground/90">{item.note}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground/80 italic break-words">
                          "{item.example}"
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
});

function SessionBlocker({ disconnect }: { disconnect: () => void }) {
  useBlocker({
    shouldBlockFn: () => {
      const shouldLeave = window.confirm(
        "You have an active call. Do you want to end it?",
      );
      if (shouldLeave) {
        disconnect();
        return false;
      }
      return true;
    },
  });

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return null;
}
