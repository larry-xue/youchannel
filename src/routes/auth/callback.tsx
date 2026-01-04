import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

const REDIRECT_URL = "/connect-youtube";
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

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search?: Record<string, unknown>) => {
    const safeSearch = search ?? {};
    return {
      code: safeSearch.code as string | undefined,
      error: safeSearch.error as string | undefined,
      error_description: safeSearch.error_description as string | undefined,
      redirect: safeSearch.redirect as string | undefined,
    };
  },
  loader: async ({ search }) => {
    const safeSearch = search ?? {};
    const redirectTo = normalizeRedirect(safeSearch.redirect);

    if (safeSearch.error) {
      const message = safeSearch.error_description || safeSearch.error;
      throw redirect({
        to: "/signin",
        search: { error: message, redirect: redirectTo },
      });
    }
    return;
  },
  component: AuthCallback,
});

function AuthCallback() {
  const search = Route.useSearch();
  const router = useRouter();
  const hasHandledAuth = useRef(false);

  useEffect(() => {
    if (hasHandledAuth.current) return;
    hasHandledAuth.current = true;

    const redirectTo = normalizeRedirect(search.redirect);
    const hashParams =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.hash.replace(/^#/, ""));

    if (search.error) {
      const message = search.error_description || search.error;
      router.navigate({
        to: "/signin",
        search: { error: message, redirect: redirectTo },
        replace: true,
      });
      return;
    }

    const runExchange = async () => {
      const { default: supabaseClient } = await import("~/lib/auth-client");
      if (hashParams) {
        const hashError =
          hashParams.get("error_description") || hashParams.get("error");
        if (hashError) {
          router.navigate({
            to: "/signin",
            search: { error: hashError, redirect: redirectTo },
            replace: true,
          });
          return;
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error: setError } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!setError) {
            router.navigate({ to: redirectTo, replace: true });
            return;
          }
        }
      }

      if (!search.code) {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session) {
          router.navigate({ to: redirectTo, replace: true });
          return;
        }

        router.navigate({
          to: "/signin",
          search: { error: "Missing OAuth code.", redirect: redirectTo },
          replace: true,
        });
        return;
      }

      const { error } = await supabaseClient.auth.exchangeCodeForSession(search.code);
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

  return null;
}
