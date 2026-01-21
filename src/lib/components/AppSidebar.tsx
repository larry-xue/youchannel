import { Link } from "@tanstack/react-router";
import { LanguageSwitcher } from "~/lib/components/LanguageSwitcher";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { UserPanel } from "~/lib/components/UserPanel";
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

export function AppSidebar({ onSignOut, className }: AppSidebarProps) {
  const navItems = getDashboardNavItems();

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
