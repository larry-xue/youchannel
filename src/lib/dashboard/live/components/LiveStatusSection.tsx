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
            "mx-auto flex items-center gap-2 bg-blue-500/10 text-sm",
            "font-medium text-blue-600 backdrop-blur-sm border",
            "border-blue-500/20 animate-in fade-in slide-in-from-bottom-4",
          )}
        >
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          Restoring conversation memory...
        </StatusPill>
      )}

      {sessionError && (
        <StatusPill
          className={cn(
            "mx-auto bg-destructive/10 text-sm font-medium text-destructive",
            "backdrop-blur-sm border border-destructive/20 animate-in",
            "fade-in slide-in-from-bottom-4",
          )}
        >
          {sessionError}
        </StatusPill>
      )}

      {failedSyncCount > 0 && (
        <StatusPill
          className={cn(
            "mx-auto flex items-center gap-2 bg-amber-50/90 text-sm",
            "font-medium text-amber-900 backdrop-blur-sm border",
            "border-amber-200/50 animate-in fade-in slide-in-from-bottom-4",
          )}
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          <span>{failedSyncCount} message(s) failed to sync</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRetryFailedMessages}
            className="h-6 px-2 text-xs hover:bg-amber-100"
          >
            <RefreshCw aria-hidden="true" className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </StatusPill>
      )}
    </div>
  );
});
