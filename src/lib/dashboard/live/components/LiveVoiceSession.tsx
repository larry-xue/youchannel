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
import * as m from "~/paraglide/messages";
import { getVoiceOptions, type Persona } from "../constants";

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

  return (
    <div className={cn("flex flex-col gap-6 px-1 pb-6 sm:px-2", className)}>
      {messages.length === 0 && isActiveSession && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <p>{m.live_status_listening()}</p>
        </div>
      )}
      {messages.map((message) => {
        const isUser = message.role === "user";
        return (
          <div
            key={message.id}
            className={cn(
              "flex flex-col gap-3",
              isUser ? "items-end" : "items-start",
            )}
          >
            <div
              className={cn(
                "max-w-[720px] whitespace-pre-wrap leading-[1.75] text-foreground",
                isUser && "rounded-2xl bg-foreground/20 px-4 py-3",
              )}
            >
              {message.content}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
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
        <SelectValue placeholder={m.live_select_voice()} />
      </SelectTrigger>
      <SelectContent
        align="start"
        className="max-h-[320px] rounded-xl bg-popover p-2"
      >
        {getVoiceOptions().map((voice) => (
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
