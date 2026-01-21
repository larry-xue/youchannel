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
  className?: string;
}

export function LiveTranscript({
  messages,
  status,
  persona,
  className,
}: LiveTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  const isActiveSession = status === "connected";

  const personaInitial = persona.name ? persona.name.charAt(0).toUpperCase() : "A";

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <ScrollArea className="flex-1 rounded-2xl border border-border/60 bg-card p-6 overflow-hidden h-124">
        <div className="flex flex-col gap-6 min-h-full justify-end h-full">
          {messages.length === 0 && !isActiveSession && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <p className="text-sm">Start a session to begin chatting.</p>
            </div>
          )}
          {messages.length === 0 && isActiveSession && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <p className="text-sm">Listening...</p>
            </div>
          )}
          {messages.map((message) => {
            const isModel = message.role === "assistant";
            return (
              <div
                key={message.id}
                className={cn("flex gap-4", isModel ? "" : "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    isModel
                      ? "bg-muted text-foreground"
                      : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {isModel ? personaInitial : "You"}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                    isModel ? "bg-background text-foreground" : "bg-muted/40 text-foreground",
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
          "h-9 w-[160px] rounded-xl border-border/60 bg-card px-3 text-sm font-medium hover:bg-muted/50 transition-colors [&_.voice-desc]:hidden",
          className,
        )}
      >
        <SelectValue placeholder="Select Voice" />
      </SelectTrigger>
      <SelectContent
        align="start"
        className="max-h-[320px] rounded-xl bg-popover p-2"
      >
        {VOICES.map((voice) => (
          <SelectItem
            key={voice.name}
            value={voice.name}
            className="rounded-lg p-2 cursor-pointer focus:bg-muted/70 focus:text-foreground"
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
