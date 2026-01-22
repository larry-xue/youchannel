import { memo } from "react";
import { cn } from "~/lib/utils";

type HistoryBannerProps = {
  isVisible: boolean;
  sessionTitle?: string | null;
};

export const HistoryBanner = memo(function HistoryBanner({
  isVisible,
  sessionTitle,
}: HistoryBannerProps) {
  if (!isVisible) return null;

  const title =
    sessionTitle && sessionTitle.trim().length > 0
      ? sessionTitle
      : "Untitled session";
  return (
    <div
      className={cn(
        "sticky top-0 w-full flex flex-wrap items-center justify-center gap-3",
        "border-b border-border/60 bg-background pb-3 pt-2 pb-2",
      )}
    >
      <div className="min-w-0">
        <p className="mt-1 truncate text-sm font-semibold text-foreground">
          {title}
        </p>
      </div>
    </div>
  );
});
