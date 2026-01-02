import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { Button } from "~/lib/components/ui/button";
import { resolveAuthUser } from "~/lib/auth/resolve-auth-user";
import { getYouTubeAccountStatusFn } from "~/lib/dashboard/data";
import { setAuthUser, useAuthUser } from "~/lib/store/auth";
import { cn } from "~/lib/utils";

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return { success: true };
});

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ context, location }) => {
    const user = await resolveAuthUser(context.authStore, context.user);
    if (!user) {
      throw redirect({
        to: "/signin",
        search: {
          error: "unauthorized",
          redirect: `${location.pathname}${location.search}${location.hash}`,
        },
      });
    }
  },
  component: DashboardLayout,
  loader: async () => {
    // 检查是否有 YouTube 账户，没有则重定向到连接页面
    const { hasAccount } = await getYouTubeAccountStatusFn();
    if (!hasAccount) {
      throw redirect({
        to: "/connect-youtube",
        search: {
          code: undefined,
          state: undefined,
          error: undefined,
          auto: "1",
        },
      });
    }

    return {};
  },
});

const DASHBOARD_NAV_ITEMS = [{ label: "Playlist", to: "/dashboard/playlists" }];

function DashboardLayout() {
  const router = useRouter();
  const authUser = useAuthUser();

  const handleSignOut = async () => {
    await signOutFn();
    setAuthUser(router.options.context.authStore, null);
    router.navigate({
      to: "/signin",
      search: {
        error: undefined,
        redirect: undefined,
      },
    });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full items-center gap-6 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-sm font-semibold text-primary">
                YC
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">YouChannel</p>
                <p className="text-xs text-muted-foreground">Studio</p>
              </div>
            </Link>
            <nav className="flex min-w-0 flex-wrap items-center gap-2">
              {DASHBOARD_NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
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
            <span className="text-xs text-muted-foreground">
              {authUser?.email}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
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
