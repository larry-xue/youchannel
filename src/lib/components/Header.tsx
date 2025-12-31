import { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";
import { Button } from "./ui/button";

interface HeaderProps {
  user: User | null;
  onSignOut: () => Promise<void>;
}

export function Header({ user, onSignOut }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-sm font-semibold text-primary">
              YC
            </div>
            <div>
              <div className="text-sm font-semibold">YouChannel</div>
              <div className="text-xs text-muted-foreground">Studio</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard">Dashboard</Link>
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
                <Link to="/signin" search={{ error: "", redirect: "/" }}>
                  Sign in
                </Link>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
