import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { Loader2, Phone, PhoneOff, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import { Card } from "~/lib/components/ui/card";
import { Input } from "~/lib/components/ui/input";
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
import { useObserverInsights } from "~/lib/dashboard/live/useObserverInsights";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useGeminiLive } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";
import { getLocale } from "~/paraglide/runtime";

type LiveSessionMeta = {
  sessionId: string;
  personaId: string;
  personaName: string;
  voice: string;
  uiLocale: string;
  startedAt: string;
};

export const Route = createFileRoute("/_layout/live")({
  component: LivePage,
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

function LivePage() {
  const [textInput, setTextInput] = useState("");
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
  const uiLocale = getLocale();
  const queryClient = useQueryClient();

  useEffect(() => {
    setSelectedVoice(selectedPersona.defaultVoice);
  }, [selectedPersona.id, selectedPersona.defaultVoice]);

  const {
    connect,
    disconnect,
    startRecording,
    sendText,
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
  const canTriggerObserver = messages.length > 0 && !observer.isRunning;

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
    if (status === "connected") {
      if (!isRecording && !isPaused) {
        startRecording();
      }
      if (!hasSentGreetingRef.current) {
        sendText("Hello!", true);
        hasSentGreetingRef.current = true;
      }
    } else {
      hasSentGreetingRef.current = false;
      setIsPaused(false);
    }
  }, [status, isRecording, isPaused, startRecording, sendText]);

  useEffect(() => {
    if (status !== "connected" || !pendingSessionRef.current) return;
    activeSessionRef.current = pendingSessionRef.current;
    pendingSessionRef.current = null;
  }, [status]);

  const syncPreviousSession = useCallback(async () => {
    const session = activeSessionRef.current;
    if (!session || messages.length === 0) return;
    if (lastPersistedSessionIdRef.current === session.sessionId) return;

    try {
      const { storeLiveSessionFn } = await import("~/lib/dashboard/live/session");
      await storeLiveSessionFn({
        data: {
          session: { ...session, endedAt: new Date().toISOString() },
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp.toISOString(),
          })),
        },
      });
      lastPersistedSessionIdRef.current = session.sessionId;
      queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
    } catch (err) {
      console.error("Failed to store previous live session", err);
    }
  }, [messages, queryClient]);

  const connectSession = useCallback(async () => {
    setSessionError(null);
    setIsFetchingToken(true);
    try {
      await syncPreviousSession();
      pendingSessionRef.current = buildSessionMeta();
      const { token } = await getGeminiToken();
      await connect(selectedPersona.systemPrompt, token);
    } catch (err) {
      console.error("Connection error:", err);
      setSessionError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsFetchingToken(false);
    }
  }, [buildSessionMeta, connect, selectedPersona.systemPrompt, syncPreviousSession]);

  const handleToggleSession = async () => {
    if (status === "connected" || status === "connecting") {
      disconnect();
      return;
    }
    await connectSession();
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || status !== "connected") return;
    sendText(textInput);
    setTextInput("");
  };

  useEffect(() => {
    if (status !== "connected") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [status]);

  useBlocker({
    shouldBlockFn: () => {
      if (status !== "connected") return false;
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

  const isActiveSession = status === "connected";
  const isConnecting = status === "connecting" || isFetchingToken;

  return (
    <div className="relative h-[calc(100vh-10rem)]">
      <AmbientGlowBackdrop
        inputLevel={inputLevel}
        outputLevel={outputLevel}
        className="fixed inset-0 -z-10"
      />

      <div className="relative z-10 h-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
        <div className="flex h-full gap-4">
          <LiveHistorySidebar />

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex-1 min-h-0">
              <div className="grid h-full grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                <div className="col-span-1 lg:col-span-2 h-full min-h-0">
                  <LiveTranscript
                    messages={messages}
                    status={status}
                    persona={selectedPersona}
                    isRecording={isRecording}
                    className="h-full w-full rounded-[24px] border border-border/50 bg-card/60 backdrop-blur-md shadow-md"
                  />
                </div>
                <ObserverPanel
                  isRunning={observer.isRunning}
                  outputs={observer.outputs}
                  error={observer.error}
                  canTrigger={canTriggerObserver}
                  onTrigger={() => observer.triggerFromMessages(messages)}
                />
              </div>
            </div>

            {sessionError && (
              <div className="mx-auto rounded-full bg-destructive/10 px-4 py-1.5 text-sm font-medium text-destructive backdrop-blur-sm border border-destructive/20 animate-in fade-in slide-in-from-bottom-4">
                {sessionError}
              </div>
            )}

            <Card className="shrink-0 p-3 sm:p-4 rounded-[28px] bg-card/80 backdrop-blur-xl border-border/50 shadow-xl z-20">
              <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-4 justify-between">
                <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto pb-1 xl:pb-0 scrollbar-none">
                  <PersonaSelector
                    selectedId={selectedPersona.id}
                    onSelect={setSelectedPersona}
                  />
                  <div className="h-10 w-px bg-border/50 hidden sm:block" />

                  <VoiceSelector
                    value={selectedVoice}
                    onValueChange={setSelectedVoice}
                    disabled={isActiveSession || isConnecting}
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 flex-1 xl:justify-end min-w-0">
                  <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 max-w-2xl bg-muted/30 p-1 rounded-[20px] border border-border/30">
                    <div className="pl-3 pr-2 py-2 flex items-center gap-3 shrink-0 border-r border-border/30">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]",
                          isRecording ? "bg-green-500" : "bg-amber-500"
                        )}
                      />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:inline-block">
                        {isRecording ? "Live" : "Paused"}
                      </span>
                    </div>

                    <form onSubmit={handleSendText} className="flex-1 flex gap-2 w-full min-w-0">
                      <Input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Type a message..."
                        disabled={!isActiveSession}
                        className="h-10 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 shadow-none placeholder:text-muted-foreground/50"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        disabled={!isActiveSession || !textInput.trim()}
                        className="h-10 w-10 text-primary hover:text-primary hover:bg-primary/10 rounded-xl shrink-0 transition-all"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    </form>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                    {isActiveSession && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14 w-14 p-0 rounded-2xl border-border/50 bg-background/50 hover:bg-background/80 shadow-sm"
                        onClick={() => {
                          if (isRecording) {
                            setIsPaused(true);
                            pause();
                          } else {
                            setIsPaused(false);
                            resume();
                          }
                        }}
                      >
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {isRecording ? "Mute" : "Speak"}
                        </span>
                      </Button>
                    )}

                    <Button
                      size="lg"
                      className={cn(
                        "h-14 px-8 rounded-2xl text-lg font-bold tracking-tight shadow-lg hover:shadow-xl transition-all w-full sm:w-auto min-w-[160px]",
                        isActiveSession
                          ? "bg-red-500/90 hover:bg-red-500 text-white shadow-red-500/20"
                          : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20",
                      )}
                      onClick={handleToggleSession}
                      disabled={isConnecting}
                    >
                      {isActiveSession ? (
                        <>
                          <PhoneOff className="mr-2 h-5 w-5" />
                          End Call
                        </>
                      ) : (
                        <>
                          {isConnecting ? (
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          ) : (
                            <Phone className="mr-2 h-5 w-5" />
                          )}
                          {isConnecting ? "Connecting..." : "Start Call"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

type ObserverPanelProps = {
  isRunning: boolean;
  outputs: ReturnType<typeof useObserverInsights>["outputs"];
  error: unknown;
  canTrigger: boolean;
  onTrigger: () => void;
};

function ObserverPanel({
  isRunning,
  outputs,
  error,
  canTrigger,
  onTrigger,
}: ObserverPanelProps) {
  return (
    <aside className="hidden lg:flex col-span-1 min-w-[320px] max-w-[420px] flex-col rounded-[28px] border border-border/50 bg-card/60 backdrop-blur-md p-4 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Observer Agent</p>
          <p className="text-xs text-muted-foreground">
            Tool-only insights per user turn
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onTrigger} disabled={!canTrigger}>
            Run
          </Button>
          <span
            className={cn(
              "flex h-2 w-2 rounded-full",
              isRunning ? "animate-pulse bg-primary" : "bg-muted-foreground/50",
            )}
            aria-label={isRunning ? "Running" : "Idle"}
          />
        </div>
      </div>

      {error instanceof Error && (
        <div className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error.message}
        </div>
      )}

      <div className="mt-3 space-y-2 overflow-y-auto pr-1">
        {outputs.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Observer will surface insights here.
          </p>
        )}
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
    </aside>
  );
}
