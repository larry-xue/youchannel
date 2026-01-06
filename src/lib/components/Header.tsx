import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Button } from "./ui/button";
import { useAuthUser } from "~/lib/store/auth";

interface HeaderProps {
  onSignOut: () => Promise<void>;
}

export function Header({ onSignOut }: HeaderProps) {
  const authUser = useAuthUser();
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
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/library">Library</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSignOut}
                  className="text-muted-foreground"
                >
                  Sign out
                </Button>
              </>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to="/signin" search={{ error: "", redirect: "/library" }}>
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
