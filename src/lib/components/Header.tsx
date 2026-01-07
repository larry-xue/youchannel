import { Link } from "@tanstack/react-router";
import { LogOut, Library } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAuthUser } from "~/lib/store/auth";

interface HeaderProps {
  onSignOut: () => Promise<void>;
}

export function Header({ onSignOut }: HeaderProps) {
  const authUser = useAuthUser();

  // Extract user info from metadata
  const userAvatar = authUser?.user_metadata?.avatar_url as string | undefined;
  const userName = (authUser?.user_metadata?.full_name as string | undefined) ||
    authUser?.email?.split("@")[0] ||
    "User";
  const userInitial = userName[0]?.toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-1">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl">
              <img src="/logo.png" alt="FluentBy.ai Logo" className="h-full w-full object-cover" />
            </div>
            <div className="flex items-baseline text-lg font-bold">
              <span className="bg-linear-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Fluent
              </span>
              <span className="bg-linear-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
                By
              </span>
              <span className="text-foreground">.ai</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {authUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 transition hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                  <span className="hidden text-sm font-medium text-foreground sm:inline">
                    {userName}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{userName}</p>
                      <p className="text-xs text-muted-foreground">{authUser?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/library" className="flex w-full cursor-pointer items-center">
                      <Library className="mr-2 h-4 w-4" />
                      Library
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSignOut} variant="destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to="/signin">
                  Sign in
                </Link>
              </Button>
            )}
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
