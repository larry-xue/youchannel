import { MessageSquare } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import { Input } from "~/lib/components/ui/input";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { cn } from "~/lib/utils";
import { ACTIVITY_ITEMS } from "../constants";

type ChatSidebarProps = {
  className?: string;
};

export function ChatSidebar({ className }: ChatSidebarProps) {
  const activeTab = "chat";

  return (
    <aside className={cn("flex h-full flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar">
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
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              No messages yet. Start a conversation by typing a message below.
            </p>
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border bg-sidebar p-3">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Type a message..."
              className="h-9 flex-1 text-sm"
            />
            <Button
              size="sm"
              className="h-9 px-3 text-xs font-medium"
              aria-label="Send message"
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
