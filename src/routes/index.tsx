import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Header } from "~/lib/components/Header";
import { Hero } from "~/lib/components/Hero";
import { Features } from "~/lib/components/Features";
import { Footer } from "~/lib/components/Footer";
import { User } from "@supabase/supabase-js";

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth");
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Sign out error:", error);
    return { error: true, message: error.message };
  }
  return { success: true };
});

export const Route = createFileRoute("/")({
  component: Home,
  loader: ({ context }) => {
    return { user: context.user };
  },
});

function Home() {
  const { user } = Route.useLoaderData();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOutFn();
      await router.invalidate();
      router.navigate({ to: "/signin", search: { error: "", redirect: "/" } });
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="min-h-screen">
      <Header user={user as User | null} onSignOut={handleSignOut} />
      <main className="flex-1 pt-8">
        <div className="container mx-auto max-w-7xl px-6">
          <Hero user={user} />
          <Features />
        </div>
      </main>
      <Footer />
    </div>
  );
}
