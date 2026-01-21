import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { memo } from "react";
import { Button } from "~/lib/components/ui/button";
import { StatusPill } from "~/lib/dashboard/live/components/StatusPill";
import { cn } from "~/lib/utils";

type LiveStatusSectionProps = {
  isRestoringHistory: boolean;
  sessionError: string | null;
  failedSyncCount: number;
  onRetryFailedMessages: () => void;
};

export const LiveStatusSection = memo(function LiveStatusSection({
  isRestoringHistory,
  sessionError,
  failedSyncCount,
  onRetryFailedMessages,
}: LiveStatusSectionProps) {
  const shouldRender = isRestoringHistory || sessionError || failedSyncCount > 0;
  if (!shouldRender) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      {isRestoringHistory && (
        <StatusPill
          className={cn(
            "mx-auto flex items-center gap-2 bg-muted/70 text-sm",
            "font-medium text-muted-foreground border border-border/60",
          )}
        >
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5" />
          Restoring conversation memory...
        </StatusPill>
      )}

      {sessionError && (
        <StatusPill
          className={cn(
            "mx-auto bg-destructive/5 text-sm font-medium text-destructive",
            "border border-destructive/20",
          )}
        >
          {sessionError}
        </StatusPill>
      )}

      {failedSyncCount > 0 && (
        <StatusPill
          className={cn(
            "mx-auto flex items-center gap-2 bg-muted/70 text-sm",
            "font-medium text-foreground border border-border/60",
          )}
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          <span>{failedSyncCount} message(s) failed to sync</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRetryFailedMessages}
            className="h-6 px-2 text-xs"
          >
            <RefreshCw aria-hidden="true" className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </StatusPill>
      )}
    </div>
  );
});
