import {
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { FullPageLoader } from "~/lib/components/FullPageLoader";
import { signOutFn } from "~/lib/server/auth";
import { setAuthUser } from "~/lib/store/auth";
import { LanguageAppCheck } from "~/lib/components/LanguageAppCheck";
import { Header } from "~/lib/components/Header";

export const Route = createFileRoute("/_layout")({
  beforeLoad: async ({ context }) => {
    // context.user is provided by root route's beforeLoad
    if (!context.user) {
      throw redirect({ to: "/signin" });
    }

    // Fetch user's target language
    const { default: supabase } = await import("~/lib/auth-client");
    const { data } = await supabase
      .from("learning_profiles")
      .select("target_language")
      .eq("user_id", context.user.id)
      .single();

    return {
      targetLanguage: data?.target_language || "en-US",
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
      <Header onSignOut={handleSignOut} />

      <main className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <LanguageAppCheck>
            <Outlet />
          </LanguageAppCheck>
        </div>
      </main>
    </div>
  );
}
