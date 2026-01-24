import { Link } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { LanguageSwitcher } from "~/lib/components/LanguageSwitcher";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { UserPanel } from "~/lib/components/UserPanel";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

import { useAuthUser } from "~/lib/store/auth";

interface HeaderProps {
  onSignOut: () => Promise<void>;
  className?: string;
  showMenu?: boolean;
}

const getDashboardNavItems = () => [
  { label: m.library(), to: "/library" },
  { label: m.playlists(), to: "/playlists" },
  { label: m.quota_title(), to: "/quotas" },
  { label: m.live(), to: "/live" },
];

export function Header({ onSignOut, className, showMenu = false }: HeaderProps) {
  const navItems = getDashboardNavItems();
  const authUser = useAuthUser();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground ring-1 ring-border/60">
            F
          </span>
          <span className="font-display tracking-tight">
            {m.app_name_part1()}
            {m.app_name_part2()}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {showMenu && authUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                >
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                {navItems.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link
                      to={item.to}
                      activeOptions={{ exact: false }}
                      className="flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-sm"
                      activeProps={{ className: "bg-muted/70 font-semibold" }}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onSignOut}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {m.sign_out()}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <LanguageSwitcher />
          <ThemeToggle />
          <div className="mx-1 h-6 w-px bg-border/60" />
          {authUser ? (
            <UserPanel onSignOut={onSignOut} showMenuItems={false} />
          ) : (
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/signin">{m.sign_in()}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
