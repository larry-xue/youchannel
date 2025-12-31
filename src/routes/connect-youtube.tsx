import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import { startYouTubeOAuthFn } from "~/lib/dashboard/data";

export const Route = createFileRoute("/connect-youtube")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: "/signin",
        search: {
          error: "unauthorized",
          redirect: location.href,
        },
      });
    }
  },
  loader: async ({ context }) => {
    const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
    const supabase = await getSupabaseServerClient();
    const user = context.user!;

    const { data: account } = await supabase
      .from("youtube_accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (account) {
      throw redirect({ to: "/dashboard/channels" });
    }

    return { email: user.email };
  },
  component: ConnectYouTube,
});

function ConnectYouTube() {
  const { email } = Route.useLoaderData();
  const [actionError, setActionError] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: () => startYouTubeOAuthFn({ data: {} }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to connect");
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-16">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Connect YouTube</CardTitle>
            <CardDescription>
              Link your YouTube account to unlock playlist sync and analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{email}</span>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>We will request read-only access to your playlists.</p>
              <p>You can revoke access anytime in your Google account settings.</p>
            </div>
            {actionError && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {actionError}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? "Opening OAuth..." : "Connect YouTube"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


