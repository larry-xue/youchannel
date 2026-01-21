import { Loader2 } from "lucide-react";
import { memo } from "react";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";

type HistoryBannerProps = {
  isVisible: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  sessionTitle?: string | null;
  onResume: () => void;
  onRetry: () => void;
};

export const HistoryBanner = memo(function HistoryBanner({
  isVisible,
  isConnecting,
  isLoading,
  errorMessage,
  sessionTitle,
  onResume,
  onRetry,
}: HistoryBannerProps) {
  if (!isVisible) return null;

  const title =
    sessionTitle && sessionTitle.trim().length > 0
      ? sessionTitle
      : "Untitled session";
  const isResumeDisabled = isConnecting || isLoading || Boolean(errorMessage);
  const resumeLabel = isConnecting
    ? "Resuming..."
    : isLoading
      ? "Loading..."
      : "Resume";
  const helperText = errorMessage
    ? "History failed to load. Retry or start a new session."
    : isLoading
      ? "Loading session history..."
      : "Resume to continue this conversation or start fresh.";

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
        <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
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
        <Button
          onClick={onResume}
          className="h-8 px-4 text-xs font-semibold"
          disabled={isResumeDisabled}
        >
          {isConnecting || isLoading ? (
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4" />
          ) : null}
          {resumeLabel}
        </Button>
      </div>
    </div>
  );
});
