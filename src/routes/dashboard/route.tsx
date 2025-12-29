import { Link, Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import ThemeToggle from "~/lib/components/ThemeToggle";

interface OAuthPayload {
  code: string;
  state: string;
}

// Create a server function to check authentication
const checkAuth = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getSupabaseServerClient } = await import("~/lib/server/auth");
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { authenticated: false };
    }

    const { id, email, user_metadata, app_metadata } = user;
    return {
      authenticated: true,
      user: { id, email, user_metadata, app_metadata },
    };
  } catch (error) {
    console.error(error);
    return { authenticated: false };
  }
});

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth");
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return { success: true };
});

export const completeYouTubeOauthFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: OAuthPayload }) => {
    if (!data?.code || !data?.state) {
      throw new Error("Missing OAuth payload");
    }

    const { getSupabaseServerClient } = await import("~/lib/server/auth");
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) throw new Error("User not authenticated");

    const { data: stateRow, error: stateError } = await supabase
      .from("youtube_oauth_states")
      .select("*")
      .eq("state", data.state)
      .eq("user_id", user.id)
      .maybeSingle();

    if (stateError || !stateRow) throw new Error("Invalid OAuth state");

    const expiresAt = new Date(stateRow.expires_at).getTime();
    if (Date.now() > expiresAt) {
      throw new Error("OAuth state expired. Please connect again.");
    }

    await supabase.from("youtube_oauth_states").delete().eq("id", stateRow.id);

    const { exchangeCodeForTokens, fetchChannelSummaries } = await import(
      "~/lib/server/youtube",
    );
    const token = await exchangeCodeForTokens(data.code);
    const tokenExpiresAt = new Date(
      Date.now() + token.expires_in * 1000,
    ).toISOString();

    const { data: existingAccount } = await supabase
      .from("youtube_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

    let accountId = existingAccount?.id;

    if (existingAccount) {
      const refreshToken = token.refresh_token || existingAccount.refresh_token;
      if (!refreshToken) throw new Error("Missing refresh token");

      const { error: updateError } = await supabase
        .from("youtube_accounts")
        .update({
          access_token: token.access_token,
          refresh_token: refreshToken,
          expires_at: tokenExpiresAt,
          scope: token.scope || existingAccount.scope,
          token_type: token.token_type || existingAccount.token_type,
        })
        .eq("id", existingAccount.id);

      if (updateError) throw updateError;
    } else {
      if (!token.refresh_token) throw new Error("Missing refresh token");

      const { data: inserted, error: insertError } = await supabase
        .from("youtube_accounts")
        .insert({
          user_id: user.id,
          provider: "google",
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: tokenExpiresAt,
          scope: token.scope,
          token_type: token.token_type,
        })
        .select()
        .single();

      if (insertError || !inserted) throw insertError || new Error("Account save failed");
      accountId = inserted.id;
    }

    const channelSummaries = await fetchChannelSummaries(token.access_token);
    if (channelSummaries.length === 0) {
      throw new Error("No YouTube channels found for this account");
    }

    const { data: existingChannels } = await supabase
      .from("channels")
      .select("channel_id, is_active")
      .eq("user_id", user.id);

    const activeByChannel = new Map(
      (existingChannels || []).map((channel) => [channel.channel_id, channel.is_active]),
    );
    const hasActive = (existingChannels || []).some((channel) => channel.is_active);

    const upsertPayload = channelSummaries.map((summary, index) => ({
      user_id: user.id,
      youtube_account_id: accountId,
      channel_id: summary.channelId,
      title: summary.title,
      description: summary.description,
      thumbnail_url: summary.thumbnailUrl,
      custom_url: summary.customUrl,
      is_active: activeByChannel.get(summary.channelId) ?? (!hasActive && index === 0),
    }));

    const { error: upsertError } = await supabase
      .from("channels")
      .upsert(upsertPayload, { onConflict: "user_id,channel_id" });

    if (upsertError) throw upsertError;

    return { success: true };
  },
);

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      code: search.code as string | undefined,
      state: search.state as string | undefined,
      error: search.error as string | undefined,
    };
  },
  component: DashboardLayout,
  loader: async ({ context }) => {
    await context.queryClient.invalidateQueries({ queryKey: ["dashboard-auth"] });

    const result = await context.queryClient.fetchQuery({
      queryKey: ["dashboard-auth"],
      queryFn: () => checkAuth(),
      staleTime: 0,
    });

    if (!result.authenticated) {
      throw redirect({
        to: "/signin",
        search: {
          error: "unauthorized",
          redirect: "/dashboard",
        },
      });
    }

    return { user: result.user };
  },
});

function DashboardLayout() {
  const { user } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  useEffect(() => {
    if (search.error) {
      setOauthMessage("YouTube OAuth failed. Please try again.");
    }
  }, [search.error]);

  useEffect(() => {
    if (!search.code || !search.state) return;

    let isMounted = true;
    setOauthMessage("Connecting YouTube...");

    completeYouTubeOauthFn({ data: { code: search.code, state: search.state } })
      .then(async () => {
        if (!isMounted) return;
        setOauthMessage("YouTube connected.");
        await router.invalidate();
        router.navigate({ to: "/dashboard" });
      })
      .catch((error) => {
        if (!isMounted) return;
        setOauthMessage(
          error instanceof Error ? error.message : "YouTube connect failed",
        );
      });

    return () => {
      isMounted = false;
    };
  }, [search.code, search.state, router]);

  const handleSignOut = async () => {
    await signOutFn();
    await router.invalidate();
    router.navigate({ to: "/signin" });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-sm font-semibold text-primary">
              YC
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">YouChannel</p>
              <p className="text-xs text-muted-foreground">Studio</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {oauthMessage && (
        <div className="border-b border-border/60 bg-muted/50">
          <div className="container mx-auto px-6 py-2 text-xs text-muted-foreground">
            {oauthMessage}
          </div>
        </div>
      )}

      <Outlet />
    </div>
  );
}
