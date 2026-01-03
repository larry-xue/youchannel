import { fetchServerSentEvents } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import { MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "~/lib/components/ui/button";
import { Input } from "~/lib/components/ui/input";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { cn } from "~/lib/utils";
import { ACTIVITY_ITEMS } from "../constants";

type ChatSidebarProps = {
  className?: string;
  analysisText?: string | null;
  chatId?: string;
};

function getMessageText(parts: Array<{ type: string; content?: string }>) {
  return parts
    .filter((part) => part.type === "text" || part.type === "thinking")
    .map((part) => part.content ?? "")
    .join("");
}

export function ChatSidebar({ className, analysisText, chatId }: ChatSidebarProps) {
  const activeTab = "chat";
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const trimmedAnalysis = analysisText?.trim() ?? "";
  const hasContext = trimmedAnalysis.length > 0;
  const connection = useMemo(() => fetchServerSentEvents("/api/chat"), []);
  const { messages, sendMessage, isLoading, error } = useChat({
    id: chatId,
    connection,
    body: {
      analysisText: trimmedAnalysis,
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, isLoading]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasContext || isLoading) return;
    const value = input.trim();
    if (!value) return;
    setInput("");
    await sendMessage(value);
  };

  return (
    <aside className={cn("flex h-full flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar rounded-r-lg">
        {/* Top Bar - Tabs */}
        <div className="flex items-center border-b border-border px-2 py-1.5">
          <div className="flex items-center gap-1">
            {ACTIVITY_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  item.key === activeTab
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                title={item.label}
                aria-label={item.label}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          {!hasContext ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground text-center">
                Video analysis is not available yet. Generate analysis to enable chat.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground text-center">
                No messages yet. Start a conversation by typing a message below.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                const text = getMessageText(message.parts);
                if (!text) return null;
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={cn("flex", isUser ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                        isUser
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {text}
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <p className="text-xs text-muted-foreground">Thinking...</p>
              )}
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error.message || "Unable to load a response right now."}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border bg-sidebar p-3">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              type="text"
              placeholder={
                hasContext ? "Type a message..." : "Analysis required to chat..."
              }
              className="h-9 flex-1 text-sm"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={!hasContext || isLoading}
            />
            <Button
              size="sm"
              className="h-9 px-3 text-xs font-medium"
              type="submit"
              aria-label="Send message"
              disabled={!hasContext || isLoading || input.trim().length === 0}
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
