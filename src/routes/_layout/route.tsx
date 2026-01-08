import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { FullPageLoader } from "~/lib/components/FullPageLoader";
import ThemeToggle from "~/lib/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/lib/components/ui/dropdown-menu";
import { signOutFn } from "~/lib/server/auth";
import { setAuthUser, useAuthUser } from "~/lib/store/auth";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_layout")({
  beforeLoad: async ({ context }) => {
    // context.user is provided by root route's beforeLoad
    if (!context.user) {
      throw redirect({ to: "/signin" });
    }
  },
  pendingComponent: FullPageLoader,
  component: DashboardLayout,
});

const DASHBOARD_NAV_ITEMS = [
  { label: "Library", to: "/library" },
  { label: "Playlists", to: "/playlists" },
];

function DashboardLayout() {
  const router = useRouter();
  const authUser = useAuthUser();

  // Extract user info from metadata
  const userAvatar = authUser?.user_metadata?.avatar_url as string | undefined;
  const userName = (authUser?.user_metadata?.full_name as string | undefined) ||
    authUser?.email?.split("@")[0] ||
    "User";
  const userInitial = userName[0]?.toUpperCase() || "U";

  const handleSignOut = async () => {
    await signOutFn();
    setAuthUser(router.options.context.authStore, null);
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full items-center gap-6 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-3xl">🎓</span>
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
            <nav className="flex min-w-0 flex-wrap items-center gap-2">
              {DASHBOARD_NAV_ITEMS.map((item) => (
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
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-full p-1 transition hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                    <p className="text-sm font-medium">
                      {userName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {authUser?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} variant="destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
