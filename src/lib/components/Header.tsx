import { Link } from "@tanstack/react-router";
import {
  Menu,
  LogOut,
  MoonIcon,
  SunIcon,
  Languages,
  User as UserIcon
} from "lucide-react";
import * as m from "~/paraglide/messages";
import { cn } from "~/lib/utils";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { UserPanel } from "~/lib/components/UserPanel";
import { LanguageSwitcher } from "~/lib/components/LanguageSwitcher";
import { Button } from "~/lib/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "~/lib/components/ui/dropdown-menu";

import { useAuthUser } from "~/lib/store/auth";
import { getLocale, locales, setLocale } from "~/paraglide/runtime";

interface HeaderProps {
  onSignOut: () => Promise<void>;
}

const getDashboardNavItems = () => [
  { label: m.library(), to: "/library" },
  { label: m.playlists(), to: "/playlists" },
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
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full items-center gap-6 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-3xl">🎓</span>
              <div className="flex items-baseline text-lg font-bold">
                <span className="bg-linear-to-r from-amber-500 via-orange-400 to-rose-500 bg-clip-text text-transparent">
                  {m.app_name_part1()}
                </span>
                <span className="bg-linear-to-r from-cyan-500 via-sky-500 to-blue-600 bg-clip-text text-transparent">
                  {m.app_name_part2()}
                </span>
                <span className="text-foreground">.ai</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            {authUser && (
              <nav className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: false }}
                    className={cn(
                      "rounded-2xl border px-4 py-2 text-sm font-medium transition",
                      "border-border/60 bg-background/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                    activeProps={{
                      className:
                        "rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground shadow-sm",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[240px]">
                  {authUser ? (
                    <>
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex items-center gap-2">
                          {userAvatar ? (
                            <img
                              src={userAvatar}
                              alt="Avatar"
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                              {userInitial}
                            </div>
                          )}
                          <div className="flex flex-col space-y-1 overflow-hidden">
                            <p className="truncate text-sm font-medium">{userName}</p>
                            <p className="truncate text-xs text-muted-foreground">{authUser?.email}</p>
                          </div>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {navItems.map((item) => (
                        <DropdownMenuItem key={item.to} asChild>
                          <Link
                            to={item.to}
                            activeOptions={{ exact: false }}
                            className="w-full cursor-pointer"
                          >
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}

                    </>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link to="/signin" className="w-full cursor-pointer">
                        <UserIcon className="mr-2 h-4 w-4" />
                        {m.sign_in()}
                      </Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Languages className="mr-2 h-4 w-4" />
                      <span>{m.language()}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {locales.map((locale) => (
                        <DropdownMenuItem
                          key={locale}
                          onClick={() => setLocale(locale)}
                          className={currentLocale === locale ? "bg-accent" : ""}
                        >
                          {localeNames[locale] || locale}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuItem onSelect={(e) => {
                    e.preventDefault();
                    toggleTheme();
                  }}>
                    <SunIcon className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <MoonIcon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="ml-2">Theme</span>
                    {/* Simplified Theme Toggle in menu */}
                  </DropdownMenuItem>

                  {authUser && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onSignOut} variant="destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        {m.sign_out()}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Desktop Actions */}
            <div className="hidden max-w-fit items-center gap-3 md:flex">
              {authUser ? (
                <UserPanel onSignOut={onSignOut} showMenuItems={false} />
              ) : (
                <Button asChild variant="ghost">
                  <Link to="/signin">{m.sign_in()}</Link>
                </Button>
              )}
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
