import { useBlocker } from "@tanstack/react-router";
import { Check, ChevronDown, Loader2, Mic, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { getGeminiToken } from "~/lib/gemini/actions";
import { useGeminiLive } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";
import type { Persona } from "../constants";

const VOICES = [
  { name: "Puck", style: "Upbeat, lively" },
  { name: "Charon", style: "Informative, professional" },
  { name: "Kore", style: "Calm, composed" },
  { name: "Fenrir", style: "Excitable, energetic" },
  { name: "Aoede", style: "Breezy, easygoing" },
  { name: "Leda", style: "Youthful, playful" },
  { name: "Orus", style: "Firm, confident" },
  { name: "Zephyr", style: "Bright, inspiring" },
] as const;

interface LiveVoiceSessionProps {
  persona: Persona;
  onLevelChange?: (inputLevel: number, outputLevel: number) => void;
  className?: string;
}

export function LiveVoiceSession({
  persona,
  onLevelChange,
  className,
}: LiveVoiceSessionProps) {
  const [selectedVoice, setSelectedVoice] = useState(persona.defaultVoice);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
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
  } = useGeminiLive({
    apiKey: "",
    voiceName: selectedVoice,
  });

  // Report levels to parent
  useEffect(() => {
    onLevelChange?.(inputLevel, outputLevel);
  }, [inputLevel, outputLevel, onLevelChange]);

  // Sync error state
  useEffect(() => {
    if (error) setSessionError(error);
  }, [error]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content]);

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
      await connect(persona.systemPrompt, token);
    } catch (err) {
      console.error("Connection error:", err);
      setSessionError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsFetchingToken(false);
    }
  }, [connect, persona.systemPrompt]);

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
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Status indicator */}
      <div className="flex items-center justify-center gap-2 text-sm">
        {status === "disconnected" && (
          <span className="text-muted-foreground">Ready to chat</span>
        )}
        {isConnecting && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-primary">Connecting...</span>
          </>
        )}
        {isActiveSession && isRecording && (
          <>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <span className="text-green-600 dark:text-green-400">Listening...</span>
          </>
        )}
        {status === "error" && <span className="text-destructive">Connection error</span>}
      </div>

      {/* Transcription area */}
      <ScrollArea className="h-[40vh] min-h-[200px] rounded-2xl bg-surface/30 border border-border-soft p-4">
        <div className="flex flex-col gap-4">
          {messages.length === 0 && !isActiveSession && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Mic className="h-12 w-12 mb-4 opacity-30" />
              <p>Start a session to begin chatting</p>
            </div>
          )}
          {messages.length === 0 && isActiveSession && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="h-8 w-8 rounded-full bg-primary/20 animate-pulse flex items-center justify-center mb-4">
                <Mic className="h-4 w-4 text-primary" />
              </div>
              <p>Listening...</p>
            </div>
          )}
          {messages.map((message) => {
            const isModel = message.role === "model";
            return (
              <div
                key={message.id}
                className={cn("flex gap-3", isModel ? "" : "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                    isModel
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {isModel ? persona.emoji : "🎤"}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    isModel
                      ? "bg-surface-2 text-foreground rounded-tl-sm"
                      : "bg-primary text-primary-foreground rounded-tr-sm",
                  )}
                >
                  {message.content}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Error message */}
      {sessionError && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive text-center">
          {sessionError}
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-3">
        {/* Voice selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 justify-between rounded-full px-4 text-sm border-border-soft bg-surface/60 hover:bg-surface-2"
              disabled={isActiveSession || isConnecting}
            >
              <span className="font-medium">{selectedVoice}</span>
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            className="w-[200px] max-h-[300px] overflow-y-auto rounded-xl shadow-lll-md border-border-soft"
          >
            {VOICES.map((voice) => (
              <DropdownMenuItem
                key={voice.name}
                onClick={() => setSelectedVoice(voice.name)}
                className="flex items-center justify-between gap-4 rounded-lg cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{voice.name}</span>
                  <span className="text-xs text-muted-foreground">{voice.style}</span>
                </div>
                {selectedVoice === voice.name && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Main action button */}
        <Button
          size="lg"
          className={cn(
            "h-16 w-full rounded-full text-lg font-medium transition-all duration-300 shadow-lll-md active:scale-[0.98]",
            isActiveSession
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          onClick={handleToggleSession}
          disabled={isConnecting}
        >
          {isActiveSession ? (
            <>
              <PhoneOff className="mr-3 h-6 w-6" />
              End Call
            </>
          ) : (
            <>
              {isConnecting ? (
                <Loader2 className="mr-3 h-6 w-6 animate-spin" />
              ) : (
                <Phone className="mr-3 h-6 w-6" />
              )}
              {isConnecting ? "Connecting..." : "Start Call"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
