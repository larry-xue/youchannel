import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";
import { ACTIVITY_ITEMS, DEMO_CHAT } from "../constants";

type ChatSidebarProps = {
  isCollapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  className?: string;
};

export function ChatSidebar({
  isCollapsed,
  onCollapsedChange,
  className,
}: ChatSidebarProps) {
  return (
    <aside className={cn("flex h-full flex-col gap-4", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 text-slate-900 shadow-lg dark:border-slate-800/70 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            {!isCollapsed &&
              ACTIVITY_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition",
                    item.key === "chat"
                      ? "bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700/70 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100",
                  )}
                >
                  {item.label}
                </button>
              ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCollapsedChange(!isCollapsed)}
              className="rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700/70 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </div>
        </div>

        {isCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-3 px-2 py-4">
            {ACTIVITY_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={cn(
                  "flex size-10 items-center justify-center rounded-2xl text-xs font-semibold uppercase tracking-[0.2em] transition",
                  item.key === "chat"
                    ? "bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700/70 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100",
                )}
                title={item.label}
                aria-label={item.label}
              >
                {item.label.slice(0, 1)}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              {DEMO_CHAT.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    message.role === "assistant"
                      ? "bg-slate-200 text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                      : "self-end bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100",
                  )}
                >
                  {message.text}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200/80 px-4 py-3 dark:border-slate-800/80">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-slate-900 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="w-full bg-transparent text-sm placeholder:text-slate-400 focus:outline-none dark:placeholder:text-slate-500"
                />
                <Button size="sm" className="h-8 px-3">
                  Send
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Shortcuts, voice, and templates can live here later.
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
