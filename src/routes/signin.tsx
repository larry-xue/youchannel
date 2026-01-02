import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import { Footer } from "~/lib/components/Footer";
import { Header } from "~/lib/components/Header";

const REDIRECT_URL = "/connect-youtube?auto=1";
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

export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      error: search.error as string | undefined,
      redirect: search.redirect as string | undefined,
    };
  },
  beforeLoad: async ({ context, search }) => {
    if (context.user) {
      throw redirect({
        to: normalizeRedirect(search.redirect),
      });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const handleSignOut = async () => {};

  const handleGoogleSignIn = async () => {
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const redirectPath = normalizeRedirect(search.redirect);
      const redirectUrl = new URL("/auth/callback", window.location.origin);
      redirectUrl.searchParams.set("redirect", redirectPath);
      const { default: supabaseClient } = await import("~/lib/auth-client");
      const { data: authData, error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl.toString(),
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setError(error.message || "Unable to start Google sign-in");
        return;
      }

      if (!authData?.url) {
        setError("Unable to start Google sign-in");
        return;
      }

      window.location.assign(authData.url);
    } catch (authError) {
      console.error("Auth error:", authError);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header onSignOut={handleSignOut} />
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome to YouChannel</CardTitle>
            <CardDescription>
              Sign in with Google to start learning with your playlists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {search.error && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {search.error === "unauthorized"
                  ? "Please sign in to access this page."
                  : search.error}
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                {message}
              </div>
            )}

            <div className="space-y-3">
              <Button
                type="button"
                className="w-full"
                disabled={isLoading}
                onClick={handleGoogleSignIn}
              >
                {isLoading ? "Redirecting to Google..." : "Continue with Google"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Use Google to sign in securely and keep your learning library synced.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
