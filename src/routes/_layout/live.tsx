import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HistoryBanner } from "~/lib/dashboard/live/components/HistoryBanner";
import { LiveControls } from "~/lib/dashboard/live/components/LiveControls";
import { LiveStatusSection } from "~/lib/dashboard/live/components/LiveStatusSection";
import { LiveTranscript } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { ObserverPanel } from "~/lib/dashboard/live/components/ObserverPanel";
import { SessionBlocker } from "~/lib/dashboard/live/components/SessionBlocker";
import { StatusPill } from "~/lib/dashboard/live/components/StatusPill";
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
  const isActiveSession = status === "connected";
  const isConnecting = status === "connecting" || isFetchingToken;
  const displayMessages = useMemo(() => {
    if (!isViewingHistory) return messages;
    if (!isResuming) return historyMessages;
    return [...historyMessages, ...messages];
  }, [historyMessages, isResuming, isViewingHistory, messages]);
  const canTriggerObserver = displayMessages.length > 0 && !observer.isRunning;
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
    <div className="relative min-h-[calc(100vh-10rem)]">
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

      <div className="flex min-h-[calc(100vh-10rem)]">
        <main
          id="live-main"
          aria-labelledby="live-title"
          className="flex min-w-0 flex-1 flex-col"
        >
          <h1 id="live-title" className="sr-only">
            Live Voice Session
          </h1>

          <div className="flex flex-1 flex-col">
            <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-6 px-6 py-6 lg:px-8">
              <div className="space-y-3">
                  <HistoryBanner
                    isVisible={isViewingHistory}
                    isConnecting={isConnecting}
                    isLoading={isHistoryLoading}
                    errorMessage={historyErrorMessage}
                    sessionTitle={historyQuery.data?.session.title ?? null}
                    onNewSession={handleStartNewSession}
                    onResume={connectResumeSession}
                    onRetry={handleRetryHistory}
                  />

                {(isHistoryLoading || historyError instanceof Error) && (
                  <div className="space-y-2">
                    {isHistoryLoading && (
                      <StatusPill className="border border-border/60 text-xs text-muted-foreground">
                        Loading session history...
                      </StatusPill>
                    )}
                    {historyError instanceof Error && (
                      <StatusPill className="border border-destructive/30 text-xs text-destructive">
                        {historyError.message}
                      </StatusPill>
                    )}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1">
                <LiveTranscript
                  messages={displayMessages}
                  status={status}
                  persona={isViewingHistory ? historyPersona : selectedPersona}
                  className="w-full"
                />
              </div>

              <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-6 -mx-6 px-6 lg:-mx-8 lg:px-8 mt-auto border-t border-border/40">
                <div className="flex flex-col gap-3">
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
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </main>

        <ObserverPanel
          outputs={observer.outputs}
          error={observer.error}
          canTrigger={canTriggerObserver}
          onTrigger={handleTriggerObserver}
          className=""
        />
      </div>

    </div>
  );
}
