import { memo } from "react";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";

type HistoryBannerProps = {
  isVisible: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  sessionTitle?: string | null;
  onRetry: () => void;
};

export const HistoryBanner = memo(function HistoryBanner({
  isVisible,
  isLoading,
  errorMessage,
  sessionTitle,
  onRetry,
}: HistoryBannerProps) {
  if (!isVisible) return null;

  const title =
    sessionTitle && sessionTitle.trim().length > 0
      ? sessionTitle
      : "Untitled session";
  return (
    <div
      className={cn(
        "sticky top-14 z-30 flex flex-wrap items-center justify-between gap-3",
        "border-b border-border/60 bg-background pb-3 pt-2 md:top-6",
      )}
    >
      <div className="min-w-0">
        <p className="mt-1 truncate text-sm font-semibold text-foreground">
          {title}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {errorMessage && (
          <Button
            onClick={onRetry}
            className="h-8 px-3 text-xs"
            variant="ghost"
            size="sm"
            disabled={isLoading}
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
});
