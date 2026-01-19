import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { Check, ChevronDown, Loader2, Phone, PhoneOff, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { Input } from "~/lib/components/ui/input";
import { AmbientGlowBackdrop } from "~/lib/dashboard/live/components/AmbientGlowBackdrop";
import { LiveTranscript } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { PersonaSelector } from "~/lib/dashboard/live/components/PersonaSelector";
import {
  DEFAULT_PERSONA_ID,
  getPersonaById,
  type Persona,
  VOICES,
} from "~/lib/dashboard/live/constants";
import { useObserverInsights } from "~/lib/dashboard/live/useObserverInsights";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useGeminiLive } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";
import { getLocale } from "~/paraglide/runtime";

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
    uiLanguage: getLocale(),
  });
  const observer = useObserverInsights(getLocale());
  const canTriggerObserver = messages.length > 0 && !observer.isRunning;

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

  const connectSession = useCallback(async () => {
    setSessionError(null);
    setIsFetchingToken(true);
    try {
      const { token } = await getGeminiToken();
      await connect(selectedPersona.systemPrompt, token);
    } catch (err) {
      console.error("Connection error:", err);
      setSessionError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsFetchingToken(false);
    }
  }, [connect, selectedPersona.systemPrompt]);

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
    <div className="relative h-[calc(100vh-5rem)]">
      <AmbientGlowBackdrop
        inputLevel={inputLevel}
        outputLevel={outputLevel}
        className="fixed inset-0 -z-10"
      />

      <div className="relative z-10 h-full mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-foreground text-pretty">
                Live Voice Studio
              </h1>
              <p className="text-base text-muted-foreground">
                Real-time conversation, persona guidance, and side-channel Observer insights.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 xl:gap-6">
            <div className="col-span-1 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Persona
                </label>
                <div className="mt-2">
                  <PersonaSelector
                    selectedId={selectedPersona.id}
                    onSelect={setSelectedPersona}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Voice
                </label>
                <div className="mt-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-12 w-full justify-between rounded-2xl px-4 text-base font-medium bg-surface-2/80 backdrop-blur-sm shadow-sm hover:bg-surface-2 transition-colors"
                        disabled={isActiveSession || isConnecting}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold truncate">{selectedVoice}</span>
                          <span className="text-muted-foreground/60 text-sm truncate">
                            {VOICES.find((v) => v.name === selectedVoice)?.style}
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-[320px] max-h-[320px] overflow-y-auto rounded-2xl shadow-2xl bg-popover/95 backdrop-blur-xl p-2"
                    >
                      {VOICES.map((voice) => (
                        <DropdownMenuItem
                          key={voice.name}
                          onClick={() => setSelectedVoice(voice.name)}
                          className="flex items-center justify-between gap-3 rounded-xl p-3 cursor-pointer hover:bg-accent focus:bg-accent"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{voice.name}</span>
                            <span className="text-xs text-muted-foreground/80">
                              {voice.style}
                            </span>
                          </div>
                          {selectedVoice === voice.name && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            <div className="col-span-1 flex flex-col justify-between gap-3 rounded-2xl border border-border-soft bg-surface/70 px-4 py-4 shadow-lll-sm">
              {sessionError && (
                <div className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {sessionError}
                </div>
              )}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Mic status</span>
                <span
                  className={cn(
                    "flex items-center gap-2",
                    isRecording ? "text-green-500" : "text-amber-500",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full animate-pulse",
                      isRecording ? "bg-green-500" : "bg-amber-500",
                    )}
                  />
                  {isRecording ? "Recording" : "Paused"}
                </span>
              </div>

              <form onSubmit={handleSendText} className="flex gap-2">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={!isActiveSession}
                  className="bg-background/50"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!isActiveSession || !textInput.trim()}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>

              <div className="flex gap-3">
                <Button
                  size="lg"
                  className={cn(
                    "h-16 flex-1 rounded-2xl text-lg font-semibold tracking-tight transition-transform duration-300 shadow-lg hover:shadow-xl",
                    isActiveSession
                      ? "bg-destructive/90 text-destructive-foreground hover:bg-destructive"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                  onClick={handleToggleSession}
                  disabled={isConnecting}
                >
                  {isActiveSession ? (
                    <>
                      <PhoneOff className="mr-2 h-6 w-6" />
                      End Session
                    </>
                  ) : (
                    <>
                      {isConnecting ? (
                        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                      ) : (
                        <Phone className="mr-2 h-6 w-6" />
                      )}
                      {isConnecting ? "Connecting..." : "Start Call"}
                    </>
                  )}
                </Button>
                {isActiveSession && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-16 w-32 rounded-2xl text-sm font-semibold shadow-sm hover:shadow-md"
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
                    {isRecording ? "Pause Mic" : "Resume Mic"}
                  </Button>
                )}
              </div>
            </div>

          </div>
        </div>

        <div className="flex-1 min-h-0">
          <div className="grid h-full min-h-[460px] grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6">
            <div className="col-span-1 xl:col-span-2 min-h-0">
              <LiveTranscript
                messages={messages}
                status={status}
                persona={selectedPersona}
                isRecording={isRecording}
                className="h-full w-full rounded-[28px] border border-border-soft bg-surface/60 backdrop-blur-md shadow-lll-md min-w-0"
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
    <aside className="hidden lg:flex col-span-1 min-w-[320px] max-w-[420px] flex-col rounded-[28px] border border-border-soft bg-surface/60 backdrop-blur-md p-4 shadow-lll-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Observer Agent</p>
          <p className="text-xs text-muted-foreground">Tool-only insights per user turn</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onTrigger}
            disabled={!canTrigger}
          >
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
          <p className="text-xs text-muted-foreground">Observer will surface insights here.</p>
        )}
        {outputs.map((entry) => {
          const turnId =
            typeof entry.payload.output.turnId === "string"
              ? entry.payload.output.turnId
              : null;
          return (
            <div
              key={entry.id}
              className="rounded-2xl border border-border-soft bg-card/70 p-3 shadow-lll-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">{entry.toolName}</Badge>
                {turnId && (
                  <span className="text-xs text-muted-foreground">Turn {turnId}</span>
                )}
              </div>
              <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                {JSON.stringify(entry.payload.output, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
