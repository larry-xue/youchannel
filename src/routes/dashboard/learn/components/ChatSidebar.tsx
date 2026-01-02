import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";
import {
  ACTIVITY_ITEMS,
  DEMO_CHAT,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "../constants";
import { clamp } from "../utils";
import { QuickActions } from "./QuickActions";

type ChatSidebarProps = {
  isCollapsed: boolean;
  width: number;
  onWidthChange: (value: number) => void;
  onCollapsedChange: (value: boolean) => void;
};

export function ChatSidebar({
  isCollapsed,
  width,
  onWidthChange,
  onCollapsedChange,
}: ChatSidebarProps) {
  const resizeState = useRef({
    startX: 0,
    startWidth: width,
    isResizing: false,
  });

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isCollapsed) {
      onCollapsedChange(false);
    }
    resizeState.current = {
      startX: event.clientX,
      startWidth: width,
      isResizing: true,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeState.current.isResizing) return;
    const delta = resizeState.current.startX - event.clientX;
    const nextWidth = clamp(
      resizeState.current.startWidth + delta,
      SIDEBAR_MIN_WIDTH,
      SIDEBAR_MAX_WIDTH,
    );
    onWidthChange(nextWidth);
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeState.current.isResizing) return;
    resizeState.current.isResizing = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <aside className="relative flex flex-col gap-4">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize sidebar"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        className="absolute left-0 top-0 h-full w-2 cursor-col-resize touch-none"
      >
        <span className="absolute left-0 top-1/2 h-16 w-0.5 -translate-y-1/2 rounded-full bg-slate-300/80 dark:bg-slate-700/80" />
      </div>

      <div className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 text-slate-900 shadow-lg dark:border-slate-800/70 dark:bg-slate-950 dark:text-slate-100">
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
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
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

      {!isCollapsed && <QuickActions />}
    </aside>
  );
}
