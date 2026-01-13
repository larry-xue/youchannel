import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type BottomPanelProps = {
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
};

export function BottomPanel({ className, children }: BottomPanelProps) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
