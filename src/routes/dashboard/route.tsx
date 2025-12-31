import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "~/lib/components/ui/button";
import ThemeToggle from "~/lib/components/ThemeToggle";
import { cn } from "~/lib/utils";

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return { success: true };
});

export const Route = createFileRoute("/dashboard")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: "/signin",
        search: {
          error: "unauthorized",
          redirect: location.href,
        },
      });
    }
  },
  component: DashboardLayout,
  loader: async ({ context }) => {
    const user = context.user!;

    // 检查是否有 YouTube 账户，没有则重定向到连接页面
    const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
    const supabase = await getSupabaseServerClient();
    const { data: account } = await supabase
      .from("youtube_accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      throw redirect({
        to: "/connect-youtube",
        search: {
          code: undefined,
          state: undefined,
          error: undefined,
        },
      });
    }

    return { user };
  },
});

const DASHBOARD_NAV_ITEMS = [
  { label: "Playlists", to: "/dashboard/channels" },
  { label: "Conversations", to: "/dashboard/conversations" },
];

function DashboardLayout() {
  const { user } = Route.useLoaderData();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOutFn();
    await router.invalidate();
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
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-sm font-semibold text-primary">
              YC
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">YouChannel</p>
              <p className="text-xs text-muted-foreground">Studio</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="border-b border-border/60 bg-background/80">
        <div className="container mx-auto flex flex-wrap items-center gap-2 px-6 py-4">
          {DASHBOARD_NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                "border-border/60 bg-background/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
              activeProps={{
                className:
                  "rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground shadow-sm",
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <main className="container mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}


