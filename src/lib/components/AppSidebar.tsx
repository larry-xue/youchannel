import { Link, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { LanguageSwitcher } from "~/lib/components/LanguageSwitcher";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { UserPanel } from "~/lib/components/UserPanel";
import { LiveHistorySidebar } from "~/lib/dashboard/live/components/LiveHistorySidebar";
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
  { label: m.progress(), to: "/learn/progress" },
  { label: m.practice(), to: "/learn/practice" },
];

const LIVE_SESSION_LIMIT = 6;

export function AppSidebar({ onSignOut, className }: AppSidebarProps) {
  const navItems = getDashboardNavItems();
  const routerState = useRouterState();

  // Extract sessionId from current route matches
  const activeSessionId =
    routerState.matches.find((match) => match.routeId === "/_layout/live/$sessionId")
      ?.params?.sessionId ?? null;

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen w-64 flex-col border-r border-border/60 bg-sidebar/70 px-4 py-6 backdrop-blur md:flex supports-[backdrop-filter]:bg-sidebar/60",
        className,
      )}
    >
      <Link
        to="/"
        className="flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-semibold text-foreground"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground ring-1 ring-border/60">
          F
        </span>
        <span className="font-display tracking-tight">
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
            className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            activeProps={{
              className:
                "rounded-xl bg-sidebar-accent px-3 py-2 text-sm font-semibold text-foreground",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-muted-foreground pl-2">Live Sessions</p>
          <Link
            to="/live"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Start</span>
          </Link>
        </div>
        <LiveHistorySidebar activeSessionId={activeSessionId} pageSize={LIVE_SESSION_LIMIT} />
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
