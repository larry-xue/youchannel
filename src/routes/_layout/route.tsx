import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { FullPageLoader } from "~/lib/components/FullPageLoader";
import { Header } from "~/lib/components/Header";
import { signOutFn } from "~/lib/server/auth";
import { setAuthUser } from "~/lib/store/auth";

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

function DashboardLayout() {
  const router = useRouter();
  const handleSignOut = async () => {
    await signOutFn();
    setAuthUser(router.options.context.authStore, null);
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen">
      <Header onSignOut={handleSignOut} />

      <main className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
