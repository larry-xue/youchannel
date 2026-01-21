import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { FullPageLoader } from "~/lib/components/FullPageLoader";
import { AppSidebar } from "~/lib/components/AppSidebar";
import { Header } from "~/lib/components/Header";
import { signOutFn } from "~/lib/server/auth";
import { getUserActiveQuotaFn } from "~/lib/server/quotas";
import { setAuthUser } from "~/lib/store/auth";

export const Route = createFileRoute("/_layout")({
  beforeLoad: async ({ context }) => {
    // context.user is provided by root route's beforeLoad
    if (!context.user) {
      throw redirect({ to: "/signin" });
    }
    const quotaData = await getUserActiveQuotaFn();
    return {
      quota: quotaData.summary,
    };
  },
  pendingComponent: FullPageLoader,
  component: DashboardLayout,
});

function DashboardLayout() {
  const router = useRouter();
  const handleSignOut = async () => {
    await signOutFn();
    setAuthUser(router.options.context.authStore, null);
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen">
        <AppSidebar onSignOut={handleSignOut} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header onSignOut={handleSignOut} className="md:hidden" showMenu />

          <main id="main-content" className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
