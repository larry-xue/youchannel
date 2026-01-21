import { memo, type ReactNode } from "react";
import { cn } from "~/lib/utils";

type StatusPillProps = {
  className?: string;
  children: ReactNode;
};

export const StatusPill = memo(function StatusPill({
  className,
  children,
}: StatusPillProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded-full px-4 py-1.5", className)}
    >
      {children}
    </div>
  );
});
