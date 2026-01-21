import { useEffect, useRef } from "react";
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

  const personaLabel =
    persona.name && persona.name.trim().length > 0
      ? persona.name
      : "Assistant";

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex-1 overflow-auto px-1 sm:px-2", className)}>
        <div className="flex min-h-full flex-col gap-6 pb-28">
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
              <div key={message.id} className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {isModel ? personaLabel : "You"}
                </span>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {message.content}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
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
