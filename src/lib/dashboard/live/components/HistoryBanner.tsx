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
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border",
        "border-border/50 bg-card/70 px-4 py-3 shadow-sm",
      )}
    >
      <div>
        <p className="text-sm font-semibold text-foreground">Viewing saved session</p>
        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onNewSession} className="rounded-full px-5" variant="outline">
          New Session
        </Button>
        {errorMessage && (
          <Button
            onClick={onRetry}
            className="rounded-full px-4"
            variant="ghost"
            size="sm"
            disabled={isLoading}
          >
            Retry
          </Button>
        )}
        <Button
          onClick={onResume}
          className="rounded-full px-5"
          disabled={isResumeDisabled}
        >
          {isConnecting || isLoading ? (
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {resumeLabel}
        </Button>
      </div>
    </div>
  );
});
