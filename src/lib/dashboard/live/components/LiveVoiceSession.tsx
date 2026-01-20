import { Check, Mic } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/lib/components/ui/select";
import type { GeminiLiveStatus, Message } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";
import { type Persona, VOICES } from "../constants";

interface LiveTranscriptProps {
  messages: Message[];
  status: GeminiLiveStatus;
  persona: Persona;
  isRecording: boolean;
  className?: string;
}

export function LiveTranscript({
  messages,
  status,
  persona,
  isRecording,
  className,
}: LiveTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  const isActiveSession = status === "connected";

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <ScrollArea className="flex-1 rounded-3xl bg-muted/5 backdrop-blur-sm p-6 overflow-hidden h-124">
        <div className="flex flex-col gap-6 min-h-full justify-end h-full">
          {messages.length === 0 && !isActiveSession && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground/50">
              <Mic className="h-16 w-16 mb-6 opacity-20" />
              <p className="text-lg">Start a session to begin chatting</p>
            </div>
          )}
          {messages.length === 0 && isActiveSession && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <div className="h-12 w-12 rounded-full bg-primary/10 animate-pulse flex items-center justify-center mb-6">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <p className="text-lg font-medium">Listening...</p>
            </div>
          )}
          {messages.map((message) => {
            const isModel = message.role === "model";
            return (
              <div
                key={message.id}
                className={cn("flex gap-4 group", isModel ? "" : "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-medium shadow-sm transition-transform group-hover:scale-110",
                    isModel
                      ? "bg-gradient-to-br from-primary/20 to-primary/5 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isModel ? persona.emoji : "🎤"}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-3xl px-6 py-4 text-[0.95rem] leading-relaxed shadow-sm backdrop-blur-md relative whitespace-pre-wrap", // Added whitespace-pre-wrap for multiline support
                    isModel
                      ? "bg-card/60 text-foreground rounded-tl-sm"
                      : "bg-primary/90 text-primary-foreground rounded-tr-sm shadow-primary/20",
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
    </div>
  );
}

interface VoiceSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceSelector({
  value,
  onValueChange,
  disabled,
  className,
}: VoiceSelectorProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "h-12 w-[160px] rounded-2xl border-border/30 bg-background/30 px-3 text-sm font-medium hover:bg-muted/50 transition-colors [&_.voice-desc]:hidden",
          className,
        )}
      >
        <SelectValue placeholder="Select Voice" />
      </SelectTrigger>
      <SelectContent
        align="start"
        className="max-h-[320px] rounded-2xl bg-popover/95 backdrop-blur-xl p-2"
      >
        {VOICES.map((voice) => (
          <SelectItem
            key={voice.name}
            value={voice.name}
            className="rounded-xl p-2 cursor-pointer focus:bg-accent focus:text-accent-foreground"
          >
            <div className="flex flex-col text-left">
              <span className="font-medium">{voice.name}</span>
              <span className="voice-desc text-xs text-muted-foreground/80 font-normal">
                {voice.style}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
