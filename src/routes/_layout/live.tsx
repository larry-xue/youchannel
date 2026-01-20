import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useBlocker,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { Loader2, Mic, MicOff, Phone, PhoneOff, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [selectedPersona, setSelectedPersona] = useState<Persona>(
    getPersonaById(DEFAULT_PERSONA_ID),
  );
  const [selectedVoice, setSelectedVoice] = useState(selectedPersona.defaultVoice);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const hasSentGreetingRef = useRef(false);
  const activeSessionRef = useRef<LiveSessionMeta | null>(null);
  const pendingSessionRef = useRef<LiveSessionMeta | null>(null);
  const lastPersistedSessionIdRef = useRef<string | null>(null);
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());
  const isCreatingSessionRef = useRef(false);

  // Persist syncedMessageIds to sessionStorage to prevent re-sync after page refresh
  const saveSyncedIds = useCallback((sessionId: string, ids: Set<string>) => {
    try {
      const key = `syncedMessageIds-${sessionId}`;
      sessionStorage.setItem(key, JSON.stringify([...ids]));
    } catch (err) {
      console.warn("Failed to save syncedMessageIds to sessionStorage:", err);
    }
  }, []);

  const loadSyncedIds = useCallback((sessionId: string): Set<string> => {
    try {
      const key = `syncedMessageIds-${sessionId}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (err) {
      console.warn("Failed to load syncedMessageIds from sessionStorage:", err);
    }
    return new Set();
  }, []);

  const clearSyncedIds = useCallback((sessionId: string) => {
    try {
      const key = `syncedMessageIds-${sessionId}`;
      sessionStorage.removeItem(key);
    } catch (err) {
      console.warn("Failed to clear syncedMessageIds from sessionStorage:", err);
    }
  }, []);
  // Debounce timer for batch message sync
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last synced message count to detect new messages
  const lastSyncedCountRef = useRef<number>(0);
  const uiLocale = getLocale();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isViewingHistory = Boolean(resolvedSessionId);
  const isReadOnlyHistory = isViewingHistory && !isResuming;

  useEffect(() => {
    setSelectedVoice(selectedPersona.defaultVoice);
  }, [selectedPersona.id, selectedPersona.defaultVoice]);

  useEffect(() => {
    if (!isViewingHistory) {
      setIsResuming(false);
    }
  }, [isViewingHistory]);

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
    uiLanguage: uiLocale,
  });
  const observer = useObserverInsights(uiLocale);
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
      role: (message.role === "user" ? "user" : "model") as "user" | "model",
      content: message.content,
      timestamp: new Date(message.createdAt),
      // Assign sequence numbers based on order from database
      sequenceNumber: index + 1,
      isStreaming: false,
    }));
  }, [historyQuery.data]);
  const historyPersona = useMemo(() => {
    const personaId = historyQuery.data?.session.metadata?.personaId;
    return personaId ? getPersonaById(personaId) : selectedPersona;
  }, [historyQuery.data?.session.metadata?.personaId, selectedPersona]);
  const displayMessages = isViewingHistory
    ? isResuming
      ? [...historyMessages, ...messages]
      : historyMessages
    : messages;
  const observerMessages = displayMessages;
  const canTriggerObserver = observerMessages.length > 0 && !observer.isRunning;

  const isActiveSession = status === "connected";
  const isConnecting = status === "connecting" || isFetchingToken;
  const isHistoryLoading = isViewingHistory && historyQuery.isLoading;
  const historyError = isViewingHistory ? historyQuery.error : null;

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
    if (status === "connected") {
      if (!isRecording && !isPaused) {
        startRecording();
      }
      if (!hasSentGreetingRef.current && !isResuming) {
        sendText("Hello!", true);
        hasSentGreetingRef.current = true;
      }
    } else {
      hasSentGreetingRef.current = false;
      setIsPaused(false);
    }
  }, [status, isRecording, isPaused, isResuming, startRecording, sendText]);

  useEffect(() => {
    if (status !== "connected" || !pendingSessionRef.current) return;
    activeSessionRef.current = pendingSessionRef.current;
    pendingSessionRef.current = null;
    // Note: syncedMessageIdsRef is already set in connectSession/connectResumeSession
    isCreatingSessionRef.current = false;
  }, [status]);

  const syncPreviousSession = useCallback(async () => {
    console.log("[LiveSync] syncPreviousSession triggered", {
      sessionId: activeSessionRef.current?.sessionId,
      liveSessionId: activeSessionRef.current?.liveSessionId,
    });
    const session = activeSessionRef.current;
    if (!session || messages.length === 0) return;
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
      const unsyncedMessages = messages.filter(
        (m) => !m.isStreaming && !syncedMessageIdsRef.current.has(m.id),
      );

      if (unsyncedMessages.length > 0) {
        const { appendLiveSessionMessagesFn } =
          await import("~/lib/dashboard/live/session");
        await appendLiveSessionMessagesFn({
          data: {
            liveSessionId: session.liveSessionId,
            messages: unsyncedMessages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp.toISOString(),
              sequenceNumber: message.sequenceNumber,
            })),
          },
        });
        unsyncedMessages.forEach((message) => {
          syncedMessageIdsRef.current.add(message.id);
        });
        // Persist to sessionStorage before closing session
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
    }
  }, [messages, queryClient, saveSyncedIds]);

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

      try {
        const { appendLiveSessionMessagesFn } =
          await import("~/lib/dashboard/live/session");
        await appendLiveSessionMessagesFn({
          data: {
            liveSessionId: session.liveSessionId,
            messages: unsynced.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp.toISOString(),
              sequenceNumber: message.sequenceNumber,
            })),
          },
        });
        unsynced.forEach((message) => {
          syncedMessageIdsRef.current.add(message.id);
        });
        // Persist to sessionStorage
        saveSyncedIds(session.sessionId, syncedMessageIdsRef.current);
        lastSyncedCountRef.current = syncedMessageIdsRef.current.size;
        queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
      } catch (err) {
        console.error("Failed to append live messages", err);
      }
    },
    [queryClient, saveSyncedIds],
  );

  const ensureLiveSessionId = useCallback(async () => {
    const session = activeSessionRef.current;
    if (!session || session.liveSessionId || isCreatingSessionRef.current) return;
    console.log("[LiveSync] ensureLiveSessionId: creating new live session record");
    isCreatingSessionRef.current = true;
    try {
      const { createLiveSessionFn } = await import("~/lib/dashboard/live/session");
      const { liveSessionId } = await createLiveSessionFn({
        data: { session },
      });
      activeSessionRef.current = { ...session, liveSessionId };
      queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
    } catch (err) {
      console.error("Failed to create live session", err);
    } finally {
      isCreatingSessionRef.current = false;
    }
  }, [queryClient]);

  const connectSession = useCallback(async () => {
    setSessionError(null);
    setIsFetchingToken(true);
    try {
      await syncPreviousSession();
      const session = buildSessionMeta();
      pendingSessionRef.current = session;
      // Clear syncedMessageIds for the previous active session (if any)
      const previousSession = activeSessionRef.current;
      if (previousSession) {
        clearSyncedIds(previousSession.sessionId);
      }
      // Load syncedMessageIds for the new session (if resuming)
      syncedMessageIdsRef.current = loadSyncedIds(session.sessionId);
      const { token } = await getGeminiToken();

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
    connect,
    queryClient,
    selectedPersona.systemPrompt,
    syncPreviousSession,
  ]);

  const connectResumeSession = useCallback(async () => {
    if (!resolvedSessionId || !historyQuery.data) return;
    setSessionError(null);
    setIsFetchingToken(true);
    try {
      await syncPreviousSession();
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
      const { token } = await getGeminiToken();

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
      if (historyMessages.length > 0) {
        await sendTurns(
          historyMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          true,
        );
      }
    } catch (err) {
      console.error("Resume connection error:", err);
      setSessionError(err instanceof Error ? err.message : "Failed to resume");
      pendingSessionRef.current = null;
      setIsResuming(false);
    } finally {
      setIsFetchingToken(false);
    }
  }, [
    buildSessionMeta,
    connect,
    sendTurns,
    historyMessages,
    historyQuery.data,
    resolvedSessionId,
    selectedPersona.systemPrompt,
    syncPreviousSession,
  ]);

  const handleToggleSession = async () => {
    if (status === "connected" || status === "connecting") {
      await syncPreviousSession();
      disconnect();
      return;
    }
    await connectSession();
  };

  const handleSendText = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isReadOnlyHistory || !textInput.trim() || status !== "connected") return;
      sendText(textInput);
      setTextInput("");
    },
    [isReadOnlyHistory, sendText, status, textInput],
  );

  // Debounced batch sync effect - syncs all unsynced non-streaming messages
  // after 1.5 seconds of no new messages (conversation turn complete)
  useEffect(() => {
    if (!isActiveSession || isReadOnlyHistory) return;
    const session = activeSessionRef.current;
    if (!session) return;

    // Ensure session exists in DB when first model response arrives
    const hasModelMessage = messages.some((m) => m.role === "model");
    if (hasModelMessage && !session.liveSessionId) {
      void ensureLiveSessionId();
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
    };
  }, []);

  return (
    <div className="relative h-[calc(100vh-10rem)]">
      {isActiveSession && <SessionBlocker disconnect={disconnect} />}
      <AmbientGlowBackdrop
        inputLevel={inputLevel}
        outputLevel={outputLevel}
        className="fixed inset-0 -z-10"
      />

      <div className="relative z-10 h-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
        <div className="flex h-full gap-4">
          <LiveHistorySidebar activeSessionId={resolvedSessionId} />

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {isViewingHistory && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/70 px-4 py-3 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Viewing saved session
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Resume to continue this conversation or start fresh.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => navigate({ to: "/live" })}
                    className="rounded-full px-5"
                    variant="outline"
                  >
                    New Session
                  </Button>
                  <Button
                    onClick={connectResumeSession}
                    className="rounded-full px-5"
                    disabled={isConnecting}
                  >
                    Resume
                  </Button>
                </div>
              </div>
            )}

            {isHistoryLoading && (
              <div className="rounded-full bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
                Loading session history...
              </div>
            )}

            {historyError instanceof Error && (
              <div className="rounded-full bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
                {historyError.message}
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
                  onTrigger={() => observer.triggerFromMessages(observerMessages)}
                />
              </div>
            </div>

            {sessionError && (
              <div className="mx-auto rounded-full bg-destructive/10 px-4 py-1.5 text-sm font-medium text-destructive backdrop-blur-sm border border-destructive/20 animate-in fade-in slide-in-from-bottom-4">
                {sessionError}
              </div>
            )}

            <Card className="shrink-0 p-3 rounded-xl bg-card/80 backdrop-blur-xl border-border/50 shadow-sm z-20 flex flex-col gap-3">
              {/* Top Row: Selectors + Controls */}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <PersonaSelector
                    selectedId={selectedPersona.id}
                    onSelect={setSelectedPersona}
                    className="w-[180px] h-9"
                  />
                  <VoiceSelector
                    value={selectedVoice}
                    onValueChange={setSelectedVoice}
                    disabled={isActiveSession || isConnecting || isReadOnlyHistory}
                    className="w-[140px] h-9"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {isActiveSession && !isReadOnlyHistory && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        "h-9 px-3 text-xs font-medium",
                        isRecording
                          ? "bg-background"
                          : "bg-amber-50 text-amber-600 border-amber-200",
                      )}
                      onClick={() => {
                        if (isRecording) {
                          pause();
                          setIsPaused(true);
                        } else {
                          resume();
                          setIsPaused(false);
                        }
                      }}
                    >
                      {isRecording ? (
                        <>
                          <Mic className="mr-2 h-3.5 w-3.5" />
                          Mute
                        </>
                      ) : (
                        <>
                          <MicOff className="mr-2 h-3.5 w-3.5" />
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
                    onClick={
                      isReadOnlyHistory
                        ? () => navigate({ to: "/live" })
                        : handleToggleSession
                    }
                    disabled={isConnecting || isReadOnlyHistory}
                  >
                    {isActiveSession ? (
                      <>
                        <PhoneOff className="mr-2 h-3.5 w-3.5" />
                        End
                      </>
                    ) : (
                      <>
                        {isConnecting ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Phone className="mr-2 h-3.5 w-3.5" />
                        )}
                        {isConnecting ? "Connecting..." : "Start Call"}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Bottom Row: Input + Send */}
              <div className="flex items-end gap-2">
                <div className="relative flex-1">
                  {isRecording && (
                    <span className="absolute top-3 left-3 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                  )}
                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (isActiveSession && !isReadOnlyHistory && textInput.trim()) {
                          sendText(textInput);
                          setTextInput("");
                        }
                      }
                    }}
                    placeholder={
                      isActiveSession
                        ? "Type a message..."
                        : "Connect to start chatting..."
                    }
                    disabled={!isActiveSession || isReadOnlyHistory}
                    className={cn(
                      "min-h-[36px] max-h-[120px] py-1.5 px-3 rounded-lg resize-none text-sm",
                      isRecording && "pl-8",
                    )}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!isActiveSession || !textInput.trim() || isReadOnlyHistory}
                  onClick={() => {
                    sendText(textInput);
                    setTextInput("");
                  }}
                  className="h-9 w-9 p-0 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

type ObserverPanelProps = {
  outputs: ReturnType<typeof useObserverInsights>["outputs"];
  error: unknown;
  canTrigger: boolean;
  onTrigger: () => void;
};

function ObserverPanel({ outputs, error, canTrigger, onTrigger }: ObserverPanelProps) {
  return (
    <aside className="hidden lg:flex col-span-1 min-w-[320px] max-w-[420px] flex-col rounded-[28px] border border-border/50 bg-card/60 backdrop-blur-md p-4 shadow-md">
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
        <div className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error.message}
        </div>
      )}

      <ScrollArea className="flex-1 mt-3 -mr-3 pr-3">
        <div className="space-y-2 pb-2">
          {outputs.map((entry) => {
            const turnId =
              typeof entry.payload.output.turnId === "string"
                ? entry.payload.output.turnId
                : null;
            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-border/50 bg-card/70 p-3 shadow-sm overflow-auto"
              >
                {entry.explanation && entry.explanation.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {entry.explanation.map((item, idx) => (
                      <div key={idx} className="bg-background/40 rounded-lg p-2 text-xs">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-primary">{item.term}</span>
                          <span className="text-muted-foreground">-</span>
                          <span className="text-foreground/90">{item.note}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground/80 italic">
                          "{item.example}"
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}

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
