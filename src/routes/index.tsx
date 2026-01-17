import { createFileRoute, useRouter } from "@tanstack/react-router";
import { FAQ } from "~/lib/components/FAQ";
import { Features } from "~/lib/components/Features";
import { Footer } from "~/lib/components/Footer";
import { Header } from "~/lib/components/Header";
import { Hero } from "~/lib/components/Hero";
import { signOutFn } from "~/lib/server/auth";
import { setAuthUser } from "~/lib/store/auth";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOutFn();
      setAuthUser(router.options.context.authStore, null);
      router.navigate({ to: "/" });
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="min-h-screen app-shell">
      <Header onSignOut={handleSignOut} />
      <main className="flex-1">
        <div className="container mx-auto max-w-7xl px-6">
          <Hero />
          <Features />
          <FAQ />
        </div>
      </main>
      <Footer />
    </div>
  );
}
