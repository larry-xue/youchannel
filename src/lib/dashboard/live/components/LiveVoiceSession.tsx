import { Mic, Sparkles } from "lucide-react";
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
      <ScrollArea className="flex-1 rounded-3xl bg-surface/5 backdrop-blur-sm p-6 overflow-hidden h-124">
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
                      : "bg-surface-3 text-muted-foreground",
                  )}
                >
                  {isModel ? persona.emoji : "🎤"}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-3xl px-6 py-4 text-[0.95rem] leading-relaxed shadow-sm backdrop-blur-md relative", // Added relative for absolute positioning of badge
                    isModel
                      ? "bg-surface/60 text-foreground rounded-tl-sm"
                      : "bg-primary/90 text-primary-foreground rounded-tr-sm shadow-primary/20",
                  )}
                >
                  {renderMessageContent(message)}

                  {/* Grammar Checks Indicator - Appended to message body */}
                  {message.role === "user" && message.grammarChecks && message.grammarChecks.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-primary-foreground/20 flex flex-wrap gap-2 justify-end">
                      {message.grammarChecks.map((check, idx) => (
                        <div key={`gc-${idx}`} className="group/grammar relative">
                          <div className="bg-white/10 hover:bg-white/20 text-primary-foreground text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full flex items-center gap-1.5 cursor-help transition-colors backdrop-blur-sm">
                            <Sparkles className="h-3 w-3 text-yellow-300" />
                            <span>Grammar</span>
                          </div>
                          {/* Tooltip */}
                          <div className="invisible group-hover/grammar:visible absolute bottom-full right-0 mb-2 p-3 bg-popover text-popover-foreground text-sm rounded-lg shadow-xl border border-border w-64 z-50 text-left">
                            <div className="font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5 pb-2 border-b border-border">
                              <Sparkles className="h-3.5 w-3.5" />
                              Suggested Improvement
                            </div>
                            <div className="space-y-2">
                              <div>
                                <div className="text-xs text-muted-foreground mb-0.5">Original</div>
                                <div className="font-medium line-through opacity-70 text-red-500 decoration-red-500/50 decoration-2">{check.original}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-0.5">Corrected</div>
                                <div className="font-bold text-green-600 dark:text-green-400">{check.corrected}</div>
                              </div>
                              <div className="bg-muted/50 p-2 rounded text-xs text-muted-foreground italic border border-border/50">
                                {check.explanation}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div >
      </ScrollArea >
    </div >
  );
}

function renderMessageContent(msg: Message) {
  const annotations: Array<{ type: 'correction' | 'explanation' | 'grammarCheck', original: string, text: string, explanation?: string }> = [];

  if (msg.corrections) {
    msg.corrections.forEach(c => annotations.push({ type: 'correction', original: c.original, text: c.corrected }));
  }
  if (msg.explanations) {
    msg.explanations.forEach(e => annotations.push({ type: 'explanation', original: e.original, text: e.explanation }));
  }
  if (msg.grammarChecks) {
    msg.grammarChecks.forEach(g => annotations.push({
      type: 'grammarCheck',
      original: g.original,
      text: g.corrected,
      explanation: g.explanation
    }));
  }

  return processTextWithAnnotations(msg.content, annotations);
}

/**
 * Normalize text for fuzzy matching:
 * - Remove all whitespace
 * - Remove common punctuation
 * - Convert to lowercase
 */
function normalizeForMatch(text: string): string {
  return text
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/[.,!?;:，。！？；：、·''""「」『』【】（）()[\]]/g, '') // Remove punctuation
    .toLowerCase();
}

/**
 * Find the best matching range in content for the given original text.
 * Returns the actual substring from content that matches, or null if no match.
 */
function findFuzzyMatch(content: string, original: string): string | null {
  // 1. Try exact match first (case-insensitive)
  const lowerContent = content.toLowerCase();
  const lowerOriginal = original.toLowerCase();
  if (lowerContent.includes(lowerOriginal)) {
    // Find the actual case-preserving match
    const idx = lowerContent.indexOf(lowerOriginal);
    return content.substring(idx, idx + original.length);
  }

  // 2. Normalize both and try to find match
  const normalizedOriginal = normalizeForMatch(original);
  if (normalizedOriginal.length === 0) return null;

  // Build a mapping from normalized position to original content positions
  const normalizedContent = normalizeForMatch(content);

  // Find where normalized original appears in normalized content
  const normalizedIdx = normalizedContent.indexOf(normalizedOriginal);
  if (normalizedIdx === -1) return null;

  // Map back to original content:
  // We need to find which characters in content correspond to
  // normalizedContent[normalizedIdx..normalizedIdx+normalizedOriginal.length]
  let normalizedPos = 0;
  let startContentPos = -1;
  let endContentPos = -1;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const normalizedChar = normalizeForMatch(char);

    // If this character contributes to normalized content
    if (normalizedChar.length > 0) {
      if (normalizedPos === normalizedIdx && startContentPos === -1) {
        startContentPos = i;
      }
      normalizedPos += normalizedChar.length;
      if (normalizedPos >= normalizedIdx + normalizedOriginal.length && endContentPos === -1) {
        endContentPos = i + 1;
        break;
      }
    }
  }

  if (startContentPos !== -1 && endContentPos !== -1) {
    return content.substring(startContentPos, endContentPos);
  }

  return null;
}

function processTextWithAnnotations(
  text: string,
  annotations: Array<{ type: 'correction' | 'explanation' | 'grammarCheck', original: string, text: string, explanation?: string }>
) {
  let result: React.ReactNode[] = [text];

  annotations.forEach((annotation) => {
    const nextResult: React.ReactNode[] = [];
    result.forEach((part) => {
      if (typeof part === "string") {
        // Try fuzzy match to find the actual text in content
        const matchedText = findFuzzyMatch(part, annotation.original);

        if (!matchedText) {
          // No match found, keep the text as-is
          nextResult.push(part);
          return;
        }

        // Split by the matched text (case-insensitive)
        const regex = new RegExp(`(${escapeRegExp(matchedText)})`, "gi");
        const split = part.split(regex);

        split.forEach((s, idx) => {
          if (s.toLowerCase() === matchedText.toLowerCase()) {
            if (annotation.type === 'correction') {
              nextResult.push(
                <span key={`corr-${idx}`} className="group/correction relative inline-block cursor-help mx-0.5">
                  <span className="text-red-400 font-medium decoration-red-400/50 underline decoration-wavy underline-offset-4">
                    {s}
                  </span>
                  <span className="invisible group-hover/correction:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-red-600 text-white text-xs rounded-md shadow-xl whitespace-nowrap z-50">
                    {annotation.text}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-red-600"></span>
                  </span>
                </span>
              );
            } else if (annotation.type === 'explanation') {
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
            } else if (annotation.type === 'grammarCheck') {
              nextResult.push(
                <span key={`gram-${idx}`} className="group/grammar relative inline-block cursor-help mx-0.5">
                  <span className="text-amber-400 font-medium decoration-amber-400/50 underline decoration-wavy underline-offset-4">
                    {s}
                  </span>
                  <span className="invisible group-hover/grammar:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-amber-600 text-white text-xs rounded-md shadow-xl max-w-[250px] text-center z-50">
                    <div className="font-bold mb-1">Corrected: {annotation.text}</div>
                    <div className="font-light opacity-90">{annotation.explanation}</div>
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-amber-600"></span>
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
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
