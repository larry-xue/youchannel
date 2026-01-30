import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "~/lib/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/lib/components/ui/dialog";
import { Loading } from "~/lib/components/ui/loading";
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
import { LivePersonalization } from "~/lib/dashboard/live/components/LivePersonalization";
import { LiveStatusSection } from "~/lib/dashboard/live/components/LiveStatusSection";
import { LiveTranscript } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { ObserverPanel } from "~/lib/dashboard/live/components/ObserverPanel";
import { SessionBlocker } from "~/lib/dashboard/live/components/SessionBlocker";
import {
  DEFAULT_VOICE_NAME,
  LIVE_ASSISTANT_NAME,
  LIVE_SYSTEM_PROMPT,
  isVoiceName,
} from "~/lib/dashboard/live/constants";
import {
  getLiveSessionDetailFn,
  type LiveSessionDetailResponse,
} from "~/lib/dashboard/live/history";
import { getLiveUserProfileFn, type LiveUserProfile } from "~/lib/dashboard/live/profile";
import {
  MessageSyncQueue,
  retryWithBackoff,
  type MessageSyncState,
} from "~/lib/dashboard/live/retry";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useGeminiLive, type Message } from "~/lib/gemini/useGeminiLive";
import { useAuthUser } from "~/lib/store/auth";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import { getLocale } from "~/paraglide/runtime";

type LiveSessionMeta = {
  sessionId: string;
  liveSessionId?: string;
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

const SIDEBAR_MIN_SIZE = "320px";
const SIDEBAR_MAX_SIZE = "40%";
const MAIN_PANEL_MIN_SIZE = "55%";

const liveUserProfileDataSchema = z
  .object({
    practice_language: z.string().nullable().optional(),
    practice_language_proficiency: z.string().nullable().optional(),
    ui_locale: z.string().optional(),
    device_time_zone: z.string().optional(),
    geo: z
      .object({
        country: z.string().nullable().optional(),
        region: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        time_zone: z.string().optional(),
        captured_at: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

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
  const navigate = Route.useNavigate();
  const authUser = useAuthUser();
  const isDesktop = useIsDesktop();
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const userName =
    (authUser?.user_metadata?.full_name as string | undefined) ||
    authUser?.email?.split("@")[0] ||
    "User";
  const [textInput, setTextInput] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_VOICE_NAME);
  const hasLoadedVoiceRef = useRef(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState<number | null>(null);
  const [sessionTimerKey, setSessionTimerKey] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [syncStates, setSyncStates] = useState<Map<string, MessageSyncState>>(new Map());
  const hasSentGreetingRef = useRef(false);
  const shouldAutoReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoReconnectingRef = useRef(false);
  const liveSystemPromptRef = useRef<string | null>(null);
  const liveAuthTokenRef = useRef<string | null>(null);
  const activeSessionRef = useRef<LiveSessionMeta | null>(null);
  const pendingSessionRef = useRef<LiveSessionMeta | null>(null);
  const lastPersistedSessionIdRef = useRef<string | null>(null);
  const generatedTitleSessionIdsRef = useRef<Set<string>>(new Set());
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());
  const resumptionHandleRef = useRef<string | null>(null);
  const isResumableRef = useRef(false);
  const sessionCreationPromiseRef = useRef<Promise<string> | null>(null);
  const syncQueueRef = useRef<MessageSyncQueue | null>(null);
  const messagesRef = useRef<Message[]>([]);
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
  const liveUserProfileQuery = useQuery<{ profile: LiveUserProfile | null }>({
    queryKey: ["live-user-profile"],
    queryFn: () => getLiveUserProfileFn() as Promise<{ profile: LiveUserProfile | null }>,
    enabled: Boolean(authUser),
    staleTime: 1000 * 60 * 5,
  });
  const liveUserProfileRef = useRef<LiveUserProfile | null>(null);

  useEffect(() => {
    liveUserProfileRef.current = liveUserProfileQuery.data?.profile ?? null;
  }, [liveUserProfileQuery.data]);

  useEffect(() => {
    if (!authUser) return;
    if (liveUserProfileQuery.isLoading) return;
    if (liveUserProfileQuery.data?.profile) return;

    try {
      const key = "live.personalization_hint_seen";
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch (err) {
      console.warn("[LivePersonalization] Failed to persist hint flag", err);
    }

    toast.message(m.live_personalize_hint());
  }, [authUser, liveUserProfileQuery.data, liveUserProfileQuery.isLoading]);
  const getSyncedIdsStorageKey = useCallback(
    (sessionId: string) => {
      const activeLiveSessionId =
        activeSessionRef.current?.liveSessionId ??
        pendingSessionRef.current?.liveSessionId ??
        null;

      if (resolvedSessionId && activeLiveSessionId === resolvedSessionId) {
        return resolvedSessionId;
      }

      return sessionId;
    },
    [resolvedSessionId],
  );

  // Storage utilities using sessionStorage (simple and reliable)
  const saveSyncedIds = useCallback(
    (sessionId: string, ids: Set<string>) => {
      try {
        const storageKey = getSyncedIdsStorageKey(sessionId);
        const key = `syncedMessageIds-${storageKey}`;
        sessionStorage.setItem(key, JSON.stringify([...ids]));
      } catch (err) {
        console.warn("Failed to save syncedMessageIds to sessionStorage:", err);
      }
    },
    [getSyncedIdsStorageKey],
  );

  const loadSyncedIds = useCallback(
    (sessionId: string): Set<string> => {
      try {
        const storageKey = getSyncedIdsStorageKey(sessionId);
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
    [getSyncedIdsStorageKey],
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("live.selectedVoice");
      if (stored && isVoiceName(stored)) {
        setSelectedVoice(stored);
      }
    } catch (err) {
      console.warn("Failed to load live voice from localStorage:", err);
    } finally {
      hasLoadedVoiceRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedVoiceRef.current) return;
    try {
      window.localStorage.setItem("live.selectedVoice", selectedVoice);
    } catch (err) {
      console.warn("Failed to save live voice to localStorage:", err);
    }
  }, [selectedVoice]);

  const clearSyncedIds = useCallback(
    (sessionId: string) => {
      try {
        const storageKey = getSyncedIdsStorageKey(sessionId);
        const key = `syncedMessageIds-${storageKey}`;
        sessionStorage.removeItem(key);
      } catch (err) {
        console.warn("Failed to clear syncedMessageIds from sessionStorage:", err);
      }
    },
    [getSyncedIdsStorageKey],
  );

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
         queryClient.invalidateQueries({ queryKey: ["live-session-history-page"] });
         if (!resolvedSessionId || resolvedSessionId !== liveSessionId) {
           navigate({
             to: "/live/$sessionId",
             params: { sessionId: liveSessionId },
             replace: true,
           });
         }
         return liveSessionId;
       } finally {
         sessionCreationPromiseRef.current = null;
       }
     })();

    sessionCreationPromiseRef.current = creationPromise;
    return creationPromise;
  }, [navigate, queryClient, resolvedSessionId]);

  const handleResumptionHandle = useCallback((handle: string, resumable: boolean) => {
    isResumableRef.current = resumable;
    resumptionHandleRef.current = resumable ? handle : null;
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
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const assistantName = LIVE_ASSISTANT_NAME;
  const isActiveSession = status === "connected";
  const isConnecting = status === "connecting" || isFetchingToken;
  const currentLiveSessionId =
    activeSessionRef.current?.liveSessionId ?? pendingSessionRef.current?.liveSessionId;
  const isViewingHistory =
    Boolean(resolvedSessionId) &&
    !isActiveSession &&
    !isConnecting &&
    resolvedSessionId !== (currentLiveSessionId ?? null);
  const isReadOnlyHistory = isViewingHistory;
  const displayMessages = useMemo(() => {
    if (!resolvedSessionId) return messages;
    return isViewingHistory ? historyMessages : messages;
  }, [historyMessages, isViewingHistory, messages, resolvedSessionId]);
  const isHistoryLoading = Boolean(resolvedSessionId) && historyQuery.isLoading;
  const historyError = resolvedSessionId ? historyQuery.error : null;
  const isNewSession =
    !isViewingHistory && displayMessages.length === 0 && !isActiveSession;
  const isHistoryBannerVisible =
    Boolean(resolvedSessionId) && !isActiveSession && !isConnecting;
  const isObserverDebugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (!import.meta.env.DEV) return false;
    return new URLSearchParams(window.location.search).has("debugObserver");
  }, []);
  const isInsightsPanelVisible = isHistoryBannerVisible || isObserverDebugEnabled;
  const isInsightsPanelLoading =
    isInsightsPanelVisible && (isHistoryLoading || assessmentQuery.isLoading);
  const isStartDisabled =
    isConnecting ||
    (!isActiveSession &&
      Boolean(resolvedSessionId) &&
      (isHistoryLoading || Boolean(historyError)));
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
      uiLocale,
      startedAt: new Date().toISOString(),
    }),
    [uiLocale],
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const attemptAutoReconnect = useCallback(async () => {
    if (isAutoReconnectingRef.current) return;
    if (!shouldAutoReconnectRef.current) return;
    if (isReadOnlyHistory) return;

    const systemPrompt = liveSystemPromptRef.current;
    if (!systemPrompt) return;

    const resumptionHandle = resumptionHandleRef.current;
    if (!resumptionHandle) {
      shouldAutoReconnectRef.current = false;
      setReconnectAttempt(null);
      return;
    }

    isAutoReconnectingRef.current = true;
    clearReconnectTimer();

    try {
      setSessionError(null);

      const attempt = reconnectAttemptRef.current + 1;
      setReconnectAttempt(attempt);

      const token =
        liveAuthTokenRef.current ?? (await getGeminiToken()).token ?? null;
      if (!token) {
        throw new Error("Failed to fetch Gemini token");
      }
      liveAuthTokenRef.current = token;

      await connect(systemPrompt, token, {
        sessionResumptionHandle: resumptionHandle,
        preserveMessages: true,
      });

      reconnectAttemptRef.current = 0;
      setReconnectAttempt(null);
    } catch (err) {
      reconnectAttemptRef.current += 1;
      const attempt = reconnectAttemptRef.current;

      const message = err instanceof Error ? err.message : "Failed to reconnect";
      const normalizedMessage = message.toLowerCase();
      const isResumptionHandleError =
        normalizedMessage.includes("resumption") &&
        (normalizedMessage.includes("invalid") ||
          normalizedMessage.includes("expired") ||
          normalizedMessage.includes("not resumable") ||
          normalizedMessage.includes("not found"));
      console.warn("[GeminiLive] Auto-reconnect attempt failed", {
        attempt,
        message,
      });

      liveAuthTokenRef.current = null;

      if (isResumptionHandleError) {
        shouldAutoReconnectRef.current = false;
        resumptionHandleRef.current = null;
        isResumableRef.current = false;
        setReconnectAttempt(null);
        setSessionError(message);
        return;
      }

      if (attempt >= 5) {
        shouldAutoReconnectRef.current = false;
        setReconnectAttempt(null);
        setSessionError(message);
        return;
      }

      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 15000);
      reconnectTimerRef.current = setTimeout(() => {
        isAutoReconnectingRef.current = false;
        void attemptAutoReconnect();
      }, delayMs);
    } finally {
      isAutoReconnectingRef.current = false;
    }
  }, [clearReconnectTimer, connect, isReadOnlyHistory]);

  useEffect(() => {
    if (!error) return;
    if (reconnectAttempt !== null) return;
    setSessionError(error);
  }, [error, reconnectAttempt]);

  useEffect(() => {
    if (status === "connected") {
      if (!isRecording && !isPaused) {
        startRecording();
      }
      if (!hasSentGreetingRef.current) {
        sendText("Hello!", true);
        hasSentGreetingRef.current = true;
      }
    } else if (status === "disconnected" || status === "error") {
      setIsPaused(false);
    }
  }, [status, isRecording, isPaused, startRecording, sendText]);

  useEffect(() => {
    if (!shouldAutoReconnectRef.current) return;
    if (isReadOnlyHistory) return;
    if (status !== "disconnected" && status !== "error") return;
    if (isAutoReconnectingRef.current) return;
    if (reconnectTimerRef.current) return;
    void attemptAutoReconnect();
  }, [attemptAutoReconnect, isReadOnlyHistory, status]);

  useEffect(() => {
    if (status !== "connected" || !pendingSessionRef.current) return;
    activeSessionRef.current = pendingSessionRef.current;
    pendingSessionRef.current = null;
    // Note: syncedMessageIdsRef is already set in connectSession
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
      queryClient.invalidateQueries({ queryKey: ["live-session-history-page"] });
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
        (message) =>
          !message.isStreaming &&
          message.content.trim().length > 0 &&
          !syncedMessageIdsRef.current.has(message.id),
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
    setReconnectAttempt(null);
    setIsFetchingToken(true);

    const session = buildSessionMeta();
    setSessionTimerKey(session.sessionId);
    try {
      const [, { token }] = await Promise.all([syncPreviousSession(), getGeminiToken()]);

      resumptionHandleRef.current = null;
      isResumableRef.current = false;
      hasSentGreetingRef.current = false;
      shouldAutoReconnectRef.current = true;
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      logLiveAssessment("session_start", {
        sessionId: session.sessionId,
        voice: selectedVoice,
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
- User Name: ${userName}
- TimeZone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
- Language: ${getLocale()}
`;

      const liveProfile = liveUserProfileRef.current;
      let profileContext = "";
      if (liveProfile) {
        const parsed = liveUserProfileDataSchema.safeParse(liveProfile.data);
        const profileData = parsed.success ? parsed.data : null;
        const geo = profileData?.geo;
        const approxRegion = [geo?.city, geo?.region, geo?.country]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join(", ");

        profileContext = `
User Profile Context (High Priority):
- Use this to personalize tone, pacing, corrections, and topic choices.
- Do NOT mention or quote this profile to the user.
- If it conflicts with the user's explicit request, follow the user.

Profile Summary:
- Profile Version: ${liveProfile.currentVersion}
- Profile Created At: ${liveProfile.createdAt}
${profileData?.practice_language ? `- Practice Language: ${profileData.practice_language}` : ""}
${profileData?.practice_language_proficiency ? `- Practice Language Proficiency: ${profileData.practice_language_proficiency}` : ""}
${profileData?.ui_locale ? `- Profile UI Locale: ${profileData.ui_locale}` : ""}
${geo?.time_zone ? `- Profile TimeZone: ${geo.time_zone}` : ""}
${approxRegion ? `- Approx Region: ${approxRegion}` : ""}

User Manual (preferences/inferences):
${liveProfile.manualText}
`;
      }

      const fullSystemPrompt = `${LIVE_SYSTEM_PROMPT}\n\n${deviceContext}${profileContext}`;
      liveSystemPromptRef.current = fullSystemPrompt;
      liveAuthTokenRef.current = token;

      await connect(fullSystemPrompt, token);
    } catch (err) {
      console.error("Connection error:", err);
      setSessionError(err instanceof Error ? err.message : "Failed to connect");
      pendingSessionRef.current = null;
      setSessionTimerKey(null);
    } finally {
      setIsFetchingToken(false);
    }
  }, [
    buildSessionMeta,
    clearReconnectTimer,
    clearSyncedIds,
    connect,
    loadSyncedIds,
    selectedVoice,
    syncPreviousSession,
    userName,
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
      shouldAutoReconnectRef.current = false;
      isAutoReconnectingRef.current = false;
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(null);
      setSessionTimerKey(null);
      clearReconnectTimer();
      liveSystemPromptRef.current = null;
      liveAuthTokenRef.current = null;
      setSessionError(null);
      const session = activeSessionRef.current;
      const titleLiveSessionId = session?.liveSessionId ?? null;
      await syncPreviousSession();
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
      isResumableRef.current = false;
      if (liveSessionId && resumptionHandle) {
        void triggerAssessment(liveSessionId, resumptionHandle);
      }

      if (
        titleLiveSessionId &&
        !generatedTitleSessionIdsRef.current.has(titleLiveSessionId)
      ) {
        generatedTitleSessionIdsRef.current.add(titleLiveSessionId);
        void (async () => {
          try {
            const { generateLiveSessionTitleFn } =
              await import("~/lib/dashboard/live/title");
            await generateLiveSessionTitleFn({
              data: { liveSessionId: titleLiveSessionId, uiLocale },
            });
            queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
            queryClient.invalidateQueries({ queryKey: ["live-session-history-page"] });
          } catch (titleError) {
            console.warn("[LiveTitle] Failed to generate title", titleError);
          }
        })();
      }
      return;
    }
    if (resolvedSessionId) {
      navigate({ to: "/live", replace: true });
    }
    await connectSession();
  }, [
    connectSession,
    disconnect,
    clearReconnectTimer,
    ensureLiveSessionId,
    navigate,
    queryClient,
    resolvedSessionId,
    status,
    syncPreviousSession,
    triggerAssessment,
    uiLocale,
  ]);

  const handleManualDisconnect = useCallback(() => {
    shouldAutoReconnectRef.current = false;
    isAutoReconnectingRef.current = false;
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(null);
    setSessionTimerKey(null);
    clearReconnectTimer();
    liveSystemPromptRef.current = null;
    liveAuthTokenRef.current = null;
    setSessionError(null);
    resumptionHandleRef.current = null;
    isResumableRef.current = false;
    disconnect();
  }, [clearReconnectTimer, disconnect]);

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

  useEffect(() => {
    return () => {
      shouldAutoReconnectRef.current = false;
      isAutoReconnectingRef.current = false;
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

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

  const getActiveLiveSessionId = useCallback(
    () => activeSessionRef.current?.liveSessionId ?? null,
    [],
  );

  const handleLiveProfileSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["live-user-profile"] });
  }, [queryClient]);

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
      {isActiveSession && (
        <SessionBlocker
          disconnect={handleManualDisconnect}
          getActiveLiveSessionId={getActiveLiveSessionId}
        />
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        {!isDesktop && isInsightsPanelVisible && (
          <Dialog open={isInsightsOpen} onOpenChange={setIsInsightsOpen}>
            <DialogContent
              className={cn(
                "inset-0 max-w-none translate-x-0 translate-y-0",
                "h-dvh w-screen overflow-hidden rounded-none border-0 bg-background p-0 shadow-none",
              )}
            >
              <DialogTitle className="sr-only">
                {m.live_assessment_title()}
              </DialogTitle>
              <ObserverPanel
                isLoading={isInsightsPanelLoading}
                assessment={assessmentEntries}
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
            <ResizablePanel minSize={MAIN_PANEL_MIN_SIZE}>
              <main id="live-main" className="flex h-full min-w-0 flex-col">
                <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
                  <HistoryBanner
                    isVisible={isHistoryBannerVisible}
                    isLoading={isHistoryLoading}
                    sessionTitle={historyQuery.data?.session.title ?? null}
                  />

                  <section
                    aria-label={m.live_page_title()}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
                  >
                    {isReadOnlyHistory ? (
                      isHistoryLoading ? (
                        <Loading
                          text={m.live_history_loading()}
                          className="flex-1 py-0"
                        />
                      ) : historyError ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                          <p className="text-sm font-semibold text-foreground">
                            {m.live_history_error()}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => historyQuery.refetch()}
                            className="h-9 rounded-md border-border bg-background px-4"
                          >
                            {m.live_retry()}
                          </Button>
                        </div>
                      ) : historyMessages.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-muted/20">
                            <Sparkles
                              aria-hidden="true"
                              className="h-5 w-5 text-primary"
                            />
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            {m.live_history_no_transcript()}
                          </p>
                        </div>
                      ) : (
                        <LiveTranscript
                          messages={displayMessages}
                          status={status}
                          assistantName={assistantName}
                          className="h-full w-full"
                        />
                      )
                    ) : isNewSession ? (
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
                      </div>
                    ) : (
                      <LiveTranscript
                        messages={displayMessages}
                        status={status}
                        assistantName={assistantName}
                        className="h-full w-full"
                      />
                    )}
                  </section>

                    <div className="mt-auto flex flex-col gap-3">
                      <LiveStatusSection
                        reconnectAttempt={reconnectAttempt}
                        sessionError={sessionError}
                        failedSyncCount={failedSyncCount}
                        onRetryFailedMessages={handleRetryFailedMessages}
                      />
                    {!isReadOnlyHistory && (
                      <LiveControls
                        selectedVoice={selectedVoice}
                        onVoiceChange={setSelectedVoice}
                        personalizationControl={
                          <LivePersonalization
                            disabled={!authUser || isActiveSession || isConnecting}
                            profileVersion={
                              liveUserProfileQuery.data?.profile?.currentVersion ?? null
                            }
                            onSaved={handleLiveProfileSaved}
                          />
                        }
                        isActiveSession={isActiveSession}
                        isViewingHistory={isViewingHistory}
                        isConnecting={isConnecting}
                        isReadOnlyHistory={isReadOnlyHistory}
                        sessionTimerKey={sessionTimerKey}
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
                    )}
                  </div>
                </div>
              </main>
            </ResizablePanel>

            {isInsightsPanelVisible && (
              <>
                <ResizableHandle
                  withHandle
                  className="bg-border/70 hover:bg-border"
                />

                <ResizablePanel
                  panelRef={sidebarPanelRef}
                  minSize={SIDEBAR_MIN_SIZE}
                  maxSize={SIDEBAR_MAX_SIZE}
                  collapsible
                  collapsedSize={0}
                >
                  <ObserverPanel
                    isLoading={isInsightsPanelLoading}
                    assessment={assessmentEntries}
                    assessmentLocale={uiLocale}
                    className="h-full w-full"
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : (
          <main
            id="live-main"
            className="flex min-h-0 flex-1 flex-col overflow-hidden border-y border-border bg-background"
          >
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              <HistoryBanner
                isVisible={isHistoryBannerVisible}
                isLoading={isHistoryLoading}
                sessionTitle={historyQuery.data?.session.title ?? null}
              />

              <section
                aria-label={m.live_page_title()}
                className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-background"
              >
                {isReadOnlyHistory ? (
                  isHistoryLoading ? (
                    <Loading text={m.live_history_loading()} className="flex-1 py-0" />
                  ) : historyError ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        {m.live_history_error()}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => historyQuery.refetch()}
                        className="h-9 rounded-md border-border bg-background px-4"
                      >
                        {m.live_retry()}
                      </Button>
                    </div>
                  ) : historyMessages.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-muted/20">
                        <Sparkles aria-hidden="true" className="h-5 w-5 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {m.live_history_no_transcript()}
                      </p>
                    </div>
                  ) : (
                    <LiveTranscript
                      messages={displayMessages}
                      status={status}
                      assistantName={assistantName}
                      className="h-full w-full"
                    />
                  )
                ) : isNewSession ? (
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
                  </div>
                ) : (
                  <LiveTranscript
                    messages={displayMessages}
                    status={status}
                    assistantName={assistantName}
                    className="h-full w-full"
                  />
                )}
              </section>

                <div className="mt-auto flex flex-col gap-3">
                  <LiveStatusSection
                    reconnectAttempt={reconnectAttempt}
                    sessionError={sessionError}
                    failedSyncCount={failedSyncCount}
                    onRetryFailedMessages={handleRetryFailedMessages}
                  />

                  {!isReadOnlyHistory && (
                    <LiveControls
                      selectedVoice={selectedVoice}
                      onVoiceChange={setSelectedVoice}
                      personalizationControl={
                        <LivePersonalization
                          disabled={!authUser || isActiveSession || isConnecting}
                          profileVersion={
                            liveUserProfileQuery.data?.profile?.currentVersion ?? null
                          }
                          onSaved={handleLiveProfileSaved}
                        />
                      }
                      isActiveSession={isActiveSession}
                      isViewingHistory={isViewingHistory}
                      isConnecting={isConnecting}
                      isReadOnlyHistory={isReadOnlyHistory}
                      sessionTimerKey={sessionTimerKey}
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
                  )}
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
