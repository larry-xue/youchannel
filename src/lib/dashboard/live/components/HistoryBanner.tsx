import { Loader2 } from "lucide-react";
import { memo } from "react";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";

type HistoryBannerProps = {
  isVisible: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onNewSession: () => void;
  onResume: () => void;
  onRetry: () => void;
};

export const HistoryBanner = memo(function HistoryBanner({
  isVisible,
  isConnecting,
  isLoading,
  errorMessage,
  onNewSession,
  onResume,
  onRetry,
}: HistoryBannerProps) {
  if (!isVisible) return null;

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
        "flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3",
      )}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Saved Session
        </p>
        <p className="mt-1 text-sm text-foreground">{helperText}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onNewSession} className="h-8 px-3 text-xs" variant="ghost">
          New Session
        </Button>
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
