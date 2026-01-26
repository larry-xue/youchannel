import { Link } from "@tanstack/react-router";
import { History, Loader2, Plus } from "lucide-react";
import { memo } from "react";
import { Button } from "~/lib/components/ui/button";
import * as m from "~/paraglide/messages";

type HistoryBannerProps = {
  isVisible: boolean;
  isLoading?: boolean;
  sessionTitle?: string | null;
};

export const HistoryBanner = memo(function HistoryBanner({
  isVisible,
  isLoading = false,
  sessionTitle,
}: HistoryBannerProps) {
  if (!isVisible) return null;

  const title =
    sessionTitle && sessionTitle.trim().length > 0
      ? sessionTitle
      : m.live_session_untitled();

  return (
    <div className="sticky top-0 z-10 bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground">
            <History aria-hidden="true" className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {m.live_history_title()}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {isLoading ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none"
                  />
                  {m.live_history_loading()}
                </span>
              ) : (
                title
              )}
            </p>
          </div>
        </div>

        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-9 rounded-md border-border bg-background"
        >
          <Link
            to="/live"
            aria-label={m.live_history_new_session_aria()}
            title={m.live_history_new_session_aria()}
            className="flex items-center gap-2"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span className="text-sm font-semibold">{m.live_history_new_session_aria()}</span>
          </Link>
        </Button>
      </div>
    </div>
  );
});
