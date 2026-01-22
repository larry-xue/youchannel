import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { LanguageSwitcher } from "~/lib/components/LanguageSwitcher";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { UserPanel } from "~/lib/components/UserPanel";
import {
  getLiveSessionHistoryFn,
  type LiveSessionHistoryEntry,
} from "~/lib/dashboard/live/history";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

interface AppSidebarProps {
  onSignOut: () => Promise<void>;
  className?: string;
}

const getDashboardNavItems = () => [
  { label: m.library(), to: "/library" },
  { label: m.playlists(), to: "/playlists" },
  { label: m.quota_title(), to: "/quotas" },
  { label: m.live(), to: "/live" },
];

const LIVE_SESSION_LIMIT = 6;

function formatLiveSessionLabel(entry: LiveSessionHistoryEntry) {
  const metadata = entry.metadata;
  const personaName =
    metadata && typeof metadata.personaName === "string"
      ? metadata.personaName
      : null;
  const voice =
    metadata && typeof metadata.voice === "string" ? metadata.voice : null;

  if (personaName && voice) return `${personaName} - ${voice}`;
  if (personaName) return personaName;
  return entry.title;
}

function formatLiveSessionDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function AppSidebar({ onSignOut, className }: AppSidebarProps) {
  const navItems = getDashboardNavItems();
  const routerState = useRouterState();

  // Extract sessionId from current route matches
  const activeSessionId = routerState.matches.find(
    (match) => match.routeId === "/_layout/live/$sessionId"
  )?.params?.sessionId ?? null;
  const { data, isLoading, error } = useQuery({
    queryKey: ["live-session-history"],
    queryFn: () => getLiveSessionHistoryFn(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
  const liveSessions = (data?.sessions ?? []).slice(0, LIVE_SESSION_LIMIT);

  return (
    <aside
      className={cn(
        "hidden md:flex h-screen w-64 flex-col border-r border-border/60 bg-background px-4 py-6 sticky top-0",
        className,
      )}
    >
      <Link
        to="/"
        className="flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-semibold text-foreground"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-xs font-semibold text-background">
          F
        </span>
        <span>
          {m.app_name_part1()}
          {m.app_name_part2()}
        </span>
      </Link>

      <nav className="mt-8 flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: false }}
            className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            activeProps={{
              className:
                "rounded-xl bg-muted/70 px-3 py-2 text-sm font-semibold text-foreground",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-muted-foreground pl-2">
            Live Sessions
          </p>
          <Link
            to="/live"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Start</span>
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
          {isLoading && (
            <span className="text-xs text-muted-foreground">Loading sessions...</span>
          )}
          {!isLoading && error && (
            <span className="text-xs text-muted-foreground">
              Failed to load sessions.
            </span>
          )}
          {!isLoading && !error && liveSessions.length === 0 && (
            <span className="text-xs text-muted-foreground">No sessions yet.</span>
          )}
          {liveSessions.map((entry) => {
            const label = formatLiveSessionLabel(entry);
            const timeLabel = formatLiveSessionDate(entry.createdAt);
            const isActive = activeSessionId === entry.id;
            const lastMessage = entry.lastMessage?.content ?? "No transcript saved.";
            return (
              <Link
                key={entry.id}
                to="/live/$sessionId"
                params={{ sessionId: entry.id }}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-sm text-muted-foreground",
                  "transition-colors hover:bg-muted/90 hover:text-foreground",
                  isActive && "bg-muted/90 text-foreground font-semibold",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{label}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    {timeLabel}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
                  {lastMessage}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-4 pt-6">
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
        <UserPanel onSignOut={onSignOut} showMenuItems={false} />
      </div>
    </aside>
  );
}
