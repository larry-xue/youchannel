import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import * as m from "~/paraglide/messages";
import { FullPageLoader } from "~/lib/components/FullPageLoader";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { UserPanel } from "~/lib/components/UserPanel";
import { signOutFn } from "~/lib/server/auth";
import { setAuthUser } from "~/lib/store/auth";
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

const getDashboardNavItems = () => [
  { label: m.library(), to: "/library" },
  { label: m.playlists(), to: "/playlists" },
];

function DashboardLayout() {
  const router = useRouter();
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
              {getDashboardNavItems().map((item) => (
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
            <UserPanel onSignOut={handleSignOut} showMenuItems={false} />
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
