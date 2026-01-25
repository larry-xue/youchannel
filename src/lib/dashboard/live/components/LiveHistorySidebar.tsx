import { useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/lib/components/ui/button";
import * as m from "~/paraglide/messages";
import {
  deleteLiveSessionFn,
  getLiveSessionHistoryPageFn,
  type LiveSessionHistoryPageEntry,
} from "../history";

type LiveHistorySidebarProps = {
  activeSessionId?: string | null;
  pageSize?: number;
  showDelete?: boolean;
  className?: string;
};

function extractMetadataLabel(entry: LiveSessionHistoryPageEntry) {
  return entry.title;
}

export function LiveHistorySidebar({
  activeSessionId,
  pageSize = 6,
  showDelete = false,
  className,
}: LiveHistorySidebarProps) {
  const matchRoute = useMatchRoute();
  const matchedSession = matchRoute({ to: "/live/$sessionId" });
  const resolvedActiveSessionId =
    activeSessionId ?? (matchedSession ? matchedSession.sessionId : null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const historyQuery = useInfiniteQuery({
    queryKey: ["live-session-history-page", pageSize],
    queryFn: ({ pageParam }) =>
      getLiveSessionHistoryPageFn({
        data: { offset: pageParam, limit: pageSize },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      deleteLiveSessionFn({ data: { sessionId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
      queryClient.invalidateQueries({ queryKey: ["live-session-history-page"] });
    },
  });

  const sessions = historyQuery.data?.pages.flatMap((page) => page.sessions) ?? [];

  useEffect(() => {
    const viewport = scrollContainerRef.current;
    if (!viewport) return;

    const maybeLoadMore = () => {
      if (!historyQuery.hasNextPage || historyQuery.isFetchingNextPage) return;
      const distanceToBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (distanceToBottom <= 200) {
        void historyQuery.fetchNextPage();
      }
    };

    const handleScroll = () => {
      maybeLoadMore();
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    maybeLoadMore();

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [
    historyQuery.fetchNextPage,
    historyQuery.hasNextPage,
    historyQuery.isFetchingNextPage,
    sessions.length,
  ]);

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1",
        className,
      )}
    >
      {historyQuery.isLoading && (
        <span className="pl-2 text-xs text-muted-foreground">
          {m.live_history_loading()}
        </span>
      )}
      {!historyQuery.isLoading && historyQuery.error && (
        <span className="pl-2 text-xs text-muted-foreground">
          {m.live_history_error()}
        </span>
      )}
      {!historyQuery.isLoading && !historyQuery.error && sessions.length === 0 && (
        <span className="pl-2 text-xs text-muted-foreground">
          {m.live_history_empty_title()}
        </span>
      )}

      {sessions.map((entry) => {
        const label = extractMetadataLabel(entry);
        const isActive = resolvedActiveSessionId === entry.id;
        return (
          <Link
            key={entry.id}
            to="/live/$sessionId"
            params={{ sessionId: entry.id }}
            className={cn(
              "group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5",
              "text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              isActive && "bg-sidebar-accent text-foreground font-semibold",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {showDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                aria-label={m.live_history_delete_aria()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const confirmed = window.confirm(m.live_history_delete_confirm());
                  if (!confirmed) return;
                  deleteMutation.mutate(entry.id);
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </Link>
        );
      })}

      {historyQuery.isFetchingNextPage && (
        <div className="flex items-center gap-2 pl-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {m.live_history_loading()}
        </div>
      )}
    </div>
  );
}
