import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useMatchRoute, useRouterState } from "@tanstack/react-router";
import { Clock, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { Input } from "~/lib/components/ui/input";
import { Button } from "~/lib/components/ui/button";
import {
  deleteLiveSessionFn,
  getLiveSessionHistoryFn,
  type LiveSessionHistoryEntry,
} from "../history";

type LiveHistorySidebarProps = {
  activeSessionId?: string | null;
  className?: string;
};

function extractMetadataLabel(entry: LiveSessionHistoryEntry) {
  const metadata = entry.metadata;
  const personaName =
    metadata && typeof metadata.personaName === "string" ? metadata.personaName : null;
  const voice =
    metadata && typeof metadata.voice === "string" ? metadata.voice : null;

  if (personaName && voice) return `${personaName} • ${voice}`;
  if (personaName) return personaName;
  return entry.title;
}

function formatTimeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function LiveHistorySidebar({
  activeSessionId,
  className,
}: LiveHistorySidebarProps) {
  const matchRoute = useMatchRoute();
  const matchedSession = matchRoute({ to: "/live/$sessionId" });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pathMatch = pathname.match(/^\/live\/([^/]+)$/);
  const resolvedActiveSessionId =
    activeSessionId ?? (matchedSession ? matchedSession.sessionId : null) ?? pathMatch?.[1] ?? null;
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["live-session-history"],
    queryFn: () => getLiveSessionHistoryFn(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      deleteLiveSessionFn({ data: { sessionId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-session-history"] });
    },
  });

  const sessions = data?.sessions ?? [];
  const filtered = useMemo(() => {
    if (!query.trim()) return sessions;
    const lower = query.trim().toLowerCase();
    return sessions.filter((entry) => {
      const title = entry.title.toLowerCase();
      const label = extractMetadataLabel(entry).toLowerCase();
      const lastMessage = entry.lastMessage?.content.toLowerCase() ?? "";
      return (
        title.includes(lower) ||
        label.includes(lower) ||
        lastMessage.includes(lower)
      );
    });
  }, [query, sessions]);

  return (
    <aside
      className={cn(
        "hidden lg:flex w-[280px] xl:w-[320px] flex-col gap-4 rounded-[28px] border border-border/60 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(59,130,246,0.12),transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.06),rgba(15,23,42,0.12))] p-4 shadow-xl backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            History
          </p>
          <p className="text-lg font-semibold text-foreground">Live Sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{sessions.length}</span>
          </div>
          <Button asChild size="icon" variant="outline" className="h-8 w-8">
            <Link to="/live" aria-label="Start new session">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions..."
          className="h-10 rounded-2xl bg-background/70 pl-10"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-2">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history...
          </div>
        )}
        {!isLoading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load history.
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <span>No sessions yet.</span>
            <span className="text-xs text-muted-foreground/80">
              Start a live call to see it here.
            </span>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {filtered.map((entry) => {
            const label = extractMetadataLabel(entry);
            const lastMessage = entry.lastMessage?.content ?? "No transcript saved.";
            const timeLabel = formatTimeLabel(entry.createdAt);
            const isActive = resolvedActiveSessionId === entry.id;
            return (
              <Link
                key={entry.id}
                to="/live/$sessionId"
                params={{ sessionId: entry.id }}
                className={cn(
                  "group relative rounded-2xl border border-border/40 bg-card/70 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/90",
                  isActive && "border-primary/50 bg-card/95 shadow-md ring-1 ring-primary/10",
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-3 h-8 w-1 rounded-full bg-primary/70" />
                )}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p
                      className={cn(
                        "text-sm font-semibold text-foreground line-clamp-1",
                        isActive && "text-primary",
                      )}
                    >
                      {label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {entry.messageCount} messages
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
                      {timeLabel}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Delete session"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const confirmed = window.confirm(
                          "Delete this session? This cannot be undone.",
                        );
                        if (!confirmed) return;
                        deleteMutation.mutate(entry.id);
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                  {lastMessage}
                </p>
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
