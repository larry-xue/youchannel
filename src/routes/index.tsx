import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Features } from "~/lib/components/Features";
import { Footer } from "~/lib/components/Footer";
import { Header } from "~/lib/components/Header";
import { Hero } from "~/lib/components/Hero";
import { setAuthUser } from "~/lib/store/auth";

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Sign out error:", error);
    return { error: true, message: error.message };
  }
  return { success: true };
});

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOutFn();
      setAuthUser(router.options.context.authStore, null);
      router.navigate({ to: "/signin", search: { error: "", redirect: "/dashboard" } });
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="min-h-screen">
      <Header onSignOut={handleSignOut} />
      <main className="flex-1 pt-8">
        <div className="container mx-auto max-w-7xl px-6">
          <Hero />
          <Features />
        </div>
      </main>
      <Footer />
    </div>
  );
}
