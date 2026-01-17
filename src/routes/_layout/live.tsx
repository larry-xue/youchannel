import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { Check, ChevronDown, Loader2, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { AmbientGlowBackdrop } from "~/lib/dashboard/live/components/AmbientGlowBackdrop";
import { LiveTranscript } from "~/lib/dashboard/live/components/LiveVoiceSession";
import { PersonaSelector } from "~/lib/dashboard/live/components/PersonaSelector";
import {
  DEFAULT_PERSONA_ID,
  getPersonaById,
  type Persona,
  VOICES,
} from "~/lib/dashboard/live/constants";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useGeminiLive } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";

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
  const [selectedPersona, setSelectedPersona] = useState<Persona>(
    getPersonaById(DEFAULT_PERSONA_ID),
  );

  const [selectedVoice, setSelectedVoice] = useState(selectedPersona.defaultVoice);

  // Update voice when persona changes
  useEffect(() => {
    setSelectedVoice(selectedPersona.defaultVoice);
  }, [selectedPersona.id, selectedPersona.defaultVoice]);

  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const hasSentGreetingRef = useRef(false);

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
    addCorrection,
    addExplanation,
  } = useGeminiLive({
    apiKey: "",
    voiceName: selectedVoice,
    tools: [
      {
        functionDeclarations: [
          {
            name: "og_silent_correction",
            description: "Silently corrects a mistake in the user's speech without interrupting the conversation. Use this when the user makes a grammar or vocabulary error that you want to highlight subtly.",
            parameters: {
              type: "OBJECT",
              properties: {
                original: {
                  type: "STRING",
                  description: "The exact word or phrase from the user's speech that was incorrect.",
                },
                corrected: {
                  type: "STRING",
                  description: "The correct word or phrase.",
                },
                rule_id: {
                  type: "STRING",
                  description: "Optional ID for the grammar rule violated.",
                },
              },
              required: ["original", "corrected"],
            },
          },
          {
            name: "og_explain_phrase",
            description: "Explains a complex term or phrase used by the AI model to the user. Call this when you (the AI) use a word that might be difficult for the learner, or when you want to emphasize a definition.",
            parameters: {
              type: "OBJECT",
              properties: {
                phrase: {
                  type: "STRING",
                  description: "The phrase or word to explain (must be present in your own response).",
                },
                context: {
                  type: "STRING",
                  description: "Optional context to help generate the definition.",
                },
              },
              required: ["phrase"],
            },
          },
        ],
      },
    ],
    onToolCall: async (toolCall) => {
      console.log("Tool call received:", toolCall);
      if (toolCall.name === "og_silent_correction") {
        const { original, corrected, rule_id } = toolCall.args;
        addCorrection(original, corrected, rule_id);
        return { success: true };
      }
      if (toolCall.name === "og_explain_phrase") {
        const { phrase, context } = toolCall.args;
        try {
          // We initiate the explanation fetch. 
          // Since we can't await server action easily inside this specific callback if we want non-blocking UI?
          // Actually we can await.
          const { explainTerm } = await import("~/lib/gemini/actions");
          // @ts-ignore
          const result = await explainTerm({ data: { phrase, context } });
          addExplanation(phrase, result.explanation);
          return { success: true };
        } catch (err) {
          console.error("Failed to explain term", err);
          return { error: "Failed to explain" };
        }
      }
    },
  });

  // Sync error state
  useEffect(() => {
    if (error) setSessionError(error);
  }, [error]);

  // Auto-start recording when connected
  useEffect(() => {
    if (status === "connected") {
      if (!isRecording) {
        startRecording();
      }
      // Send initial greeting to trigger AI response
      if (!hasSentGreetingRef.current) {
        sendText("Hello!", true);
        hasSentGreetingRef.current = true;
      }
    } else {
      hasSentGreetingRef.current = false;
    }
  }, [status, isRecording, startRecording, sendText]);

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

  // Prevent accidental navigation during active session
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
      // eslint-disable-next-line no-alert
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
    <div className="relative h-[calc(100vh-5rem)] overflow-hidden">
      <AmbientGlowBackdrop
        inputLevel={inputLevel}
        outputLevel={outputLevel}
        className="fixed inset-0 -z-10"
      />

      {/* NO outer card wrapper - content floats on background */}
      <div className="relative z-10 flex flex-col lg:flex-row h-full gap-8 p-6 lg:p-12 max-w-7xl mx-auto">
        {/* Left Panel - Controls */}
        <div className="lg:w-[40%] flex flex-col justify-center gap-8 lg:pr-8 shrink-0">
          {/* Title - LEFT aligned */}
          <div>
            <h1 className="font-display text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
              Live
            </h1>
            <p className="text-xl text-muted-foreground mt-3 font-light">
              Voice conversation with AI
            </p>
          </div>

          {/* Persona selector */}
          <div className="w-full">
            <label className="text-sm font-medium text-muted-foreground ml-1 mb-2 block uppercase tracking-wider">
              Persona
            </label>
            <PersonaSelector
              selectedId={selectedPersona.id}
              onSelect={setSelectedPersona}
            />
          </div>

          {/* Voice selector + Call button */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground ml-1 block uppercase tracking-wider">
                Voice
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-12 w-full justify-between rounded-xl px-4 text-base font-normal bg-surface-2/80 backdrop-blur-sm shadow-sm hover:bg-surface-2 transition-all"
                    disabled={isActiveSession || isConnecting}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{selectedVoice}</span>
                      <span className="text-muted-foreground/60 text-sm">
                        — {VOICES.find((v) => v.name === selectedVoice)?.style}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[300px] max-h-[300px] overflow-y-auto rounded-2xl shadow-2xl bg-popover/95 backdrop-blur-xl p-2"
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

            {/* Error message */}
            {sessionError && (
              <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                {sessionError}
              </div>
            )}

            {/* Big call button */}
            <Button
              size="lg"
              className={cn(
                "h-20 w-full rounded-[2rem] text-xl font-medium tracking-wide transition-all duration-500 shadow-xl hover:shadow-2xl hover:-translate-y-1 active:scale-[0.98]",
                isActiveSession
                  ? "bg-destructive/90 text-destructive-foreground hover:bg-destructive shadow-destructive/20"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25",
              )}
              onClick={handleToggleSession}
              disabled={isConnecting}
            >
              {isActiveSession ? (
                <>
                  <PhoneOff className="mr-3 h-7 w-7" />
                  End Session
                </>
              ) : (
                <>
                  {isConnecting ? (
                    <Loader2 className="mr-3 h-7 w-7 animate-spin" />
                  ) : (
                    <Phone className="mr-3 h-7 w-7" />
                  )}
                  {isConnecting ? "Connecting..." : "Start Call"}
                </>
              )}
            </Button>

            {/* Status Text */}
            <div className="flex justify-center">
              {status === "disconnected" && (
                <span className="text-sm text-muted-foreground/60 font-medium">
                  Ready to connect
                </span>
              )}
              {isConnecting && (
                <span className="text-sm text-primary font-medium animate-pulse">
                  Establishing connection...
                </span>
              )}
              {isActiveSession && (
                <span className="text-sm text-green-500 font-medium flex items-center gap-2">
                  <span className="block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Live Session Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Transcript */}
        <div className="lg:w-[60%] flex flex-col min-h-0 flex-1 overflow-hidden">
          <LiveTranscript
            messages={messages}
            status={status}
            persona={selectedPersona}
            isRecording={isRecording}
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}
