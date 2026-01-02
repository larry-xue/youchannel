import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";

type BottomPanelProps = {
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
};

export function BottomPanel({
  isCollapsed,
  onToggle,
  className,
  children,
}: BottomPanelProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/80 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Study Panel
        </p>
        <Button
          variant="outline"
          size="icon"
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand bottom panel" : "Collapse bottom panel"}
        >
          {isCollapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>
      {!isCollapsed && <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}
    </div>
  );
}
