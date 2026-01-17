import { Link } from "@tanstack/react-router";
import {
  Languages,
  LogOut,
  Menu,
  MoonIcon,
  SunIcon,
  User as UserIcon,
} from "lucide-react";
import { LanguageSwitcher } from "~/lib/components/LanguageSwitcher";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { UserPanel } from "~/lib/components/UserPanel";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

import { useAuthUser } from "~/lib/store/auth";
import { getLocale, locales, setLocale } from "~/paraglide/runtime";

interface HeaderProps {
  onSignOut: () => Promise<void>;
}

const getDashboardNavItems = () => [
  { label: m.library(), to: "/library" },
  { label: m.playlists(), to: "/playlists" },
  { label: m.quota_title(), to: "/quotas" },
];

const localeNames: Record<string, string> = {
  en: "English",
  de: "Deutsch",
  ja: "日本語",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  es: "Español",
};

export function Header({ onSignOut }: HeaderProps) {
  const navItems = getDashboardNavItems();
  const authUser = useAuthUser();

  const currentLocale = getLocale();

  const userAvatar = authUser?.user_metadata?.avatar_url as string | undefined;
  const userName =
    (authUser?.user_metadata?.full_name as string | undefined) ||
    authUser?.email?.split("@")[0] ||
    "User";
  const userInitial = userName[0]?.toUpperCase() || "U";

  function toggleTheme() {
    if (
      document.documentElement.classList.contains("dark") ||
      (!("theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.remove("dark");
      localStorage.theme = "light";
    } else {
      document.documentElement.classList.add("dark");
      localStorage.theme = "dark";
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="group flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-105 group-hover:bg-primary/15">
                <span className="text-2xl">🎓</span>
              </div>
              <div className="hidden flex-col leading-none sm:flex">
                <div className="flex items-baseline font-display text-xl font-bold tracking-tight">
                  <span className="bg-linear-to-r from-amber-500 via-orange-400 to-rose-500 bg-clip-text text-transparent">
                    {m.app_name_part1()}
                  </span>
                  <span className="bg-linear-to-r from-cyan-500 via-sky-500 to-blue-600 bg-clip-text text-transparent">
                    {m.app_name_part2()}
                  </span>
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            {authUser && (
              <nav className="hidden items-center gap-1 md:flex">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: false }}
                    className={cn(
                      "group relative rounded-full px-5 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
                      "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    activeProps={{
                      className:
                        "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90 hover:text-secondary-foreground font-semibold rounded-full px-5 py-2 text-sm",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Desktop Actions */}
            <div className="hidden items-center gap-2 md:flex">
              <LanguageSwitcher />
              <ThemeToggle />
              <div className="ml-1 h-8 w-px bg-border/40" />
              {authUser ? (
                <UserPanel onSignOut={onSignOut} showMenuItems={false} />
              ) : (
                <Button
                  asChild
                  variant="ghost"
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Link to="/signin">{m.sign_in()}</Link>
                </Button>
              )}
            </div>

            {/* Mobile Menu Trigger */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-10 w-10 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-[280px] rounded-3xl p-2 shadow-xl border-border/50 bg-background/95 backdrop-blur-2xl"
                >
                  {authUser ? (
                    <>
                      <DropdownMenuLabel className="px-4 py-3 font-normal">
                        <div className="flex items-center gap-3">
                          {userAvatar ? (
                            <img
                              src={userAvatar}
                              alt="Avatar"
                              className="h-10 w-10 rounded-full object-cover ring-2 ring-border/50"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-2 ring-border/50">
                              {userInitial}
                            </div>
                          )}
                          <div className="flex flex-col space-y-0.5 overflow-hidden">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {userName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {authUser?.email}
                            </p>
                          </div>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-border/50" />
                      <div className="flex flex-col gap-1 p-1">
                        {navItems.map((item) => (
                          <DropdownMenuItem
                            key={item.to}
                            asChild
                            className="rounded-2xl focus:bg-muted"
                          >
                            <Link
                              to={item.to}
                              activeOptions={{ exact: false }}
                              className="flex w-full cursor-pointer items-center py-2.5 px-3 text-base font-medium"
                              activeProps={{
                                className:
                                  "bg-secondary/15 text-secondary-foreground font-semibold",
                              }}
                            >
                              {item.label}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </>
                  ) : (
                    <DropdownMenuItem asChild className="rounded-2xl p-1">
                      <Link
                        to="/signin"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted"
                      >
                        <UserIcon className="h-4 w-4" />
                        {m.sign_in()}
                      </Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator className="bg-border/50" />

                  <div className="flex items-center justify-between p-2">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="rounded-2xl px-4 py-2 text-sm font-medium hover:bg-muted w-full justify-start">
                        <Languages className="mr-2 h-4 w-4" />
                        <span>{m.language()}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="rounded-2xl p-1 shadow-lg border-border/50">
                        {locales.map((locale) => (
                          <DropdownMenuItem
                            key={locale}
                            onClick={() => setLocale(locale)}
                            className={cn(
                              "rounded-xl px-3 py-2 cursor-pointer",
                              currentLocale === locale &&
                                "bg-secondary text-secondary-foreground font-medium",
                            )}
                          >
                            {localeNames[locale] || locale}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </div>

                  <div className="p-2 pt-0">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        toggleTheme();
                      }}
                      className="rounded-2xl px-4 py-2 text-sm font-medium hover:bg-muted cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <SunIcon className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                        <MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                        <span>Theme</span>
                      </div>
                    </DropdownMenuItem>
                  </div>

                  {authUser && (
                    <>
                      <DropdownMenuSeparator className="bg-border/50" />
                      <div className="p-2">
                        <DropdownMenuItem
                          onClick={onSignOut}
                          className="rounded-2xl px-4 py-2 text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/30 dark:focus:text-red-400 cursor-pointer"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          {m.sign_out()}
                        </DropdownMenuItem>
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
