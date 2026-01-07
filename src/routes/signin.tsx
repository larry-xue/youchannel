import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import { Footer } from "~/lib/components/Footer";
import { Header } from "~/lib/components/Header";

const REDIRECT_URL = "/connect-youtube";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;

export const Route = createFileRoute("/signin")({
  beforeLoad: async ({ context }) => {
    if (context.user) {
      throw redirect({ to: REDIRECT_URL });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const handleSignOut = async () => { };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      setError("No credential received from Google");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const { default: supabaseClient } = await import("~/lib/auth-client");
      const { error: authError } = await supabaseClient.auth.signInWithIdToken({
        provider: "google",
        token: credentialResponse.credential,
      });

      if (authError) {
        setError(authError.message || "Unable to sign in with Google");
        return;
      }

      router.navigate({ to: REDIRECT_URL, replace: true });
    } catch (err) {
      console.error("Auth error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google sign-in was cancelled or failed. Please try again.");
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
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
              {error && (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {isLoading && (
                <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                  Signing in...
                </div>
              )}

              <div className="flex flex-col items-center space-y-3">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  size="large"
                  theme="outline"
                  shape="circle"
                  text="continue_with"
                  width="360"
                  use_fedcm_for_prompt
                />
                <p className="text-xs text-muted-foreground">
                  Use Google to sign in securely and keep your learning library synced.
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    </GoogleOAuthProvider>
  );
}
