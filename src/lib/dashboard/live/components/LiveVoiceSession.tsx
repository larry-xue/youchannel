import { Mic } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import type { GeminiLiveStatus, Message } from "~/lib/gemini/useGeminiLive";
import { cn } from "~/lib/utils";
import type { Persona } from "../constants";

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
      <ScrollArea className="flex-1 rounded-3xl bg-surface/5 backdrop-blur-sm p-6 overflow-hidden h-full">
        <div className="flex flex-col gap-6 min-h-full justify-end">
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
                      : "bg-surface-3 text-muted-foreground",
                  )}
                >
                  {isModel ? persona.emoji : "🎤"}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-3xl px-6 py-4 text-[0.95rem] leading-relaxed shadow-sm backdrop-blur-md",
                    isModel
                      ? "bg-surface/60 text-foreground rounded-tl-sm"
                      : "bg-primary/90 text-primary-foreground rounded-tr-sm shadow-primary/20",
                  )}
                >
                  {renderMessageContent(message)}
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

function renderMessageContent(message: Message) {
  const hasCorrections = message.corrections && message.corrections.length > 0;
  const hasExplanations = message.explanations && message.explanations.length > 0;

  if (message.role === "model" && !hasExplanations) {
    return message.content;
  }
  if (message.role === "user" && !hasCorrections) {
    return message.content;
  }

  // Combine logic.
  // We can treat corrections and explanations similarly: annotations on text.
  // Type: { type: 'correction'|'explanation', original: string, text: string }
  // We align them by matching the original text.

  const annotations: Array<{
    type: 'correction' | 'explanation';
    original: string;
    text: string; // corrected text OR explanation text
  }> = [];

  if (message.corrections) {
    message.corrections.forEach(c => annotations.push({ type: 'correction', original: c.original, text: c.corrected }));
  }
  if (message.explanations) {
    message.explanations.forEach(e => annotations.push({ type: 'explanation', original: e.original, text: e.explanation }));
  }

  return (
    <span>
      {processTextWithAnnotations(message.content, annotations)}
    </span>
  );
}

function processTextWithAnnotations(text: string, annotations: Array<{ type: 'correction' | 'explanation', original: string, text: string }>) {
  let result: React.ReactNode[] = [text];

  annotations.forEach((annotation) => {
    const nextResult: React.ReactNode[] = [];
    result.forEach((part) => {
      if (typeof part === "string") {
        const regex = new RegExp(`(${escapeRegExp(annotation.original)})`, "gi");
        const split = part.split(regex);

        split.forEach((s, idx) => {
          if (s.toLowerCase() === annotation.original.toLowerCase()) {
            if (annotation.type === 'correction') {
              nextResult.push(
                <span key={`corr-${idx}`} className="group/correction relative inline-block cursor-help mx-0.5">
                  <span className="text-red-400 font-semibold decoration-red-400/30 underline decoration-wavy underline-offset-4">
                    {s}
                  </span>
                  <span className="invisible group-hover/correction:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-green-500 text-white text-xs rounded shadow-lg whitespace-nowrap z-50">
                    {annotation.text}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-green-500"></span>
                  </span>
                </span>
              );
            } else {
              // Explanation
              nextResult.push(
                <span key={`expl-${idx}`} className="group/explanation relative inline-block cursor-help mx-0.5">
                  <span className="text-blue-400 font-medium decoration-blue-400/30 underline decoration-wavy underline-offset-4">
                    {s}
                  </span>
                  <span className="invisible group-hover/explanation:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-blue-600 text-white text-xs rounded-md shadow-xl max-w-[200px] text-center z-50">
                    {annotation.text}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-blue-600"></span>
                  </span>
                </span>
              );
            }
          } else {
            nextResult.push(s);
          }
        });
      } else {
        nextResult.push(part);
      }
    });
    result = nextResult;
  });

  return result;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
