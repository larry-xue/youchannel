import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Features } from "~/lib/components/Features";
import { FAQ } from "~/lib/components/FAQ";
import { Footer } from "~/lib/components/Footer";
import { Header } from "~/lib/components/Header";
import { Hero } from "~/lib/components/Hero";
import { signOutFn } from "~/lib/server/auth";
import { setAuthUser } from "~/lib/store/auth";

const REDIRECT_URL = "/connect-youtube";

interface IndexSearch {
  code?: string;
  error?: string;
  error_description?: string;
  redirect?: string;
}

const normalizeRedirect = (value?: string) => {
  if (!value) return REDIRECT_URL;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);
      return `${url.pathname}${url.search}${url.hash}` || REDIRECT_URL;
    } catch {
      return REDIRECT_URL;
    }
  }
  return value;
};

export const Route = createFileRoute("/")({
  validateSearch: (search?: Record<string, unknown>): IndexSearch => {
    const safeSearch = search ?? {};
    return {
      code: (safeSearch.code as string) || undefined,
      error: (safeSearch.error as string) || undefined,
      error_description: (safeSearch.error_description as string) || undefined,
      redirect: (safeSearch.redirect as string) || undefined,
    };
  },
  loaderDeps: ({ search }) => ({
    code: search.code,
    error: search.error,
    error_description: search.error_description,
    redirect: search.redirect,
  }),
  loader: async ({ deps }) => {
    if (!deps.error) return;
    const redirectTo = normalizeRedirect(deps.redirect);
    const message = deps.error_description || deps.error;
    throw redirect({
      to: "/signin",
      search: { error: message, redirect: redirectTo },
    });
  },
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const router = useRouter();
  const hasHandledAuth = useRef(false);

  useEffect(() => {
    if (hasHandledAuth.current) return;
    if (!search.code && !search.error) return;
    hasHandledAuth.current = true;

    const redirectTo = normalizeRedirect(search.redirect);

    if (search.error) {
      const message = search.error_description || search.error;
      router.navigate({
        to: "/signin",
        search: { error: message, redirect: redirectTo },
        replace: true,
      });
      return;
    }

    if (!search.code) return;

    const runExchange = async () => {
      const { default: supabaseClient } = await import("~/lib/auth-client");
      // Checked above
      const { error } = await supabaseClient.auth.exchangeCodeForSession(search.code!);
      if (error) {
        router.navigate({
          to: "/signin",
          search: { error: error.message, redirect: redirectTo },
          replace: true,
        });
        return;
      }
      router.navigate({ to: redirectTo, replace: true });
    };

    runExchange().catch((error) => {
      router.navigate({
        to: "/signin",
        search: {
          error: error instanceof Error ? error.message : "Auth failed",
          redirect: redirectTo,
        },
        replace: true,
      });
    });
  }, [
    router,
    search.code,
    search.error,
    search.error_description,
    search.redirect,
  ]);

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
    <div className="min-h-screen">
      <Header onSignOut={handleSignOut} />
      <main className="flex-1 pt-8">
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
