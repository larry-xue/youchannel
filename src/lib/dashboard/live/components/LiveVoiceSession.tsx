import { User } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
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
import * as m from "~/paraglide/messages";
import { getVoiceOptions, LIVE_ASSISTANT_NAME } from "../constants";

interface LiveTranscriptProps {
  messages: Message[];
  status: GeminiLiveStatus;
  assistantName?: string;
  className?: string;
}

export function LiveTranscript({
  messages,
  status,
  assistantName = LIVE_ASSISTANT_NAME,
  className,
}: LiveTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = lastMessage?.content;
  const lastMessageAudioUrl = lastMessage?.audioUrl;

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastMessageAudioUrl, lastMessageContent, messages.length]);
  const isActiveSession = status === "connected";

  const assistantInitial = useMemo(() => {
    const trimmed = assistantName.trim();
    const initial = trimmed.length > 0 ? trimmed.slice(0, 1).toUpperCase() : "A";
    return initial;
  }, [assistantName]);

  return (
    <ScrollArea className={cn("h-full min-h-0", className)}>
      <div className="flex flex-col gap-5 px-4 pb-6 pt-5 sm:px-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-muted/20">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isActiveSession ? "bg-[color:var(--brand-green)]" : "bg-primary",
                )}
              />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {isActiveSession ? m.live_status_listening() : m.live_empty_prompt()}
            </p>
            <p className="text-sm text-muted-foreground">{m.live_page_subtitle()}</p>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === "user";
            const trimmedContent = message.content.trim();
            const hasAudio = Boolean(message.audioUrl);
            const showBubble = trimmedContent.length > 0 || message.isStreaming === true;

            let bubbleText = message.content;
            if (trimmedContent.length > 0) {
              bubbleText = message.content;
            } else if (message.isStreaming) {
              if (isUser) {
                bubbleText = hasAudio
                  ? m.live_status_transcribing()
                  : m.live_status_listening();
              } else {
                bubbleText = "…";
              }
            } else if (hasAudio) {
              bubbleText = m.live_voice_message();
            }
            return (
              <div
                key={message.id}
                className={cn(
                  "flex items-start gap-3",
                  isUser ? "justify-end" : "justify-start",
                )}
              >
                {!isUser && (
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/20 text-xs font-semibold text-foreground">
                    <span aria-hidden="true">{assistantInitial}</span>
                    <span className="sr-only">{assistantName}</span>
                  </div>
                )}

                <div className={cn("flex min-w-0 flex-col", isUser && "items-end")}>
                  {showBubble && (
                    <div
                      className={cn(
                        "w-fit max-w-2xl whitespace-pre-wrap break-words border-l-2 px-4 py-3",
                        "text-sm leading-relaxed text-foreground",
                        isUser
                          ? "border-l-primary bg-primary/5"
                          : "border-l-muted-foreground/30 bg-muted/20",
                      )}
                    >
                      {bubbleText}
                    </div>
                  )}
                  {message.audioUrl && (
                    <audio
                      className={cn("w-full max-w-2xl", showBubble && "mt-2")}
                      controls
                      preload="metadata"
                      src={message.audioUrl}
                    />
                  )}
                </div>

                {isUser && (
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-primary/5 text-primary">
                    <User aria-hidden="true" className="h-4 w-4" />
                    <span className="sr-only">User</span>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
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
          "h-10 w-full rounded-md border-border bg-background px-3 text-sm font-medium shadow-none transition-colors hover:bg-muted/20 [&_.voice-desc]:hidden",
          className,
        )}
      >
        <SelectValue placeholder={m.live_select_voice()} />
      </SelectTrigger>
      <SelectContent align="start" className="max-h-[320px] rounded-xl bg-popover p-2">
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
