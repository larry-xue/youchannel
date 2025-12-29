import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "~/lib/components/ui/button";
import { Input } from "~/lib/components/ui/input";
import { Label } from "~/lib/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";

const REDIRECT_URL = "/dashboard";

type AuthMode = "signin" | "signup";

interface AuthCredentials {
  email: string;
  password: string;
}

interface AuthResult {
  error?: boolean;
  message?: string;
  success?: boolean;
}

export const signInFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: AuthCredentials }) => {
    const { getSupabaseServerClient } = await import("~/lib/server/auth");
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return { error: true, message: error.message } as AuthResult;
    }

    return { success: true } as AuthResult;
  },
);

export const signUpFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: AuthCredentials }) => {
    const { getSupabaseServerClient } = await import("~/lib/server/auth");
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return { error: true, message: error.message } as AuthResult;
    }

    return {
      success: true,
      message: "Account created. Check your email to confirm.",
    } as AuthResult;
  },
);

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
        to: search.redirect || REDIRECT_URL,
      });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const result =
        mode === "signin"
          ? await signInFn({ data: { email, password } })
          : await signUpFn({ data: { email, password } });

      if (result?.error) {
        setError(result.message || "Authentication failed");
      } else if (mode === "signin") {
        await router.invalidate();
        router.navigate({ to: search.redirect || REDIRECT_URL });
      } else {
        setMessage(result?.message || "Check your email to confirm.");
      }
    } catch (authError) {
      console.error("Auth error:", authError);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to manage your YouTube analysis workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="inline-flex w-full rounded-full bg-muted/50 p-1">
            <Button
              type="button"
              variant={mode === "signin" ? "secondary" : "ghost"}
              className="flex-1 rounded-full"
              onClick={() => setMode("signin")}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant={mode === "signup" ? "secondary" : "ghost"}
              className="flex-1 rounded-full"
              onClick={() => setMode("signup")}
            >
              Create account
            </Button>
          </div>

          {search.error && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {search.error === "unauthorized"
                ? "Please sign in to access this page"
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter a secure password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading
                ? mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
