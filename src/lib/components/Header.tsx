import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";
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
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
