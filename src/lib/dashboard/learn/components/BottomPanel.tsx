import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type BottomPanelProps = {
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
};

export function BottomPanel({
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
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
