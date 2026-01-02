import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import { resolveAuthUser } from "~/lib/auth/resolve-auth-user";
import { completeYouTubeOauthFn, startYouTubeOAuthFn } from "~/lib/dashboard/data";
import { useAuthUser } from "~/lib/store/auth";

const getYouTubeAccountStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { hasAccount: false };

  const { data: account, error: accountError } = await supabase
    .from("youtube_accounts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) throw accountError;

  return { hasAccount: Boolean(account) };
});

export const Route = createFileRoute("/connect-youtube")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      code: search.code as string | undefined,
      state: search.state as string | undefined,
      error: search.error as string | undefined,
      auto: search.auto as string | undefined,
    };
  },
  loaderDeps: ({ search }) => ({
    code: search.code,
    state: search.state,
    error: search.error,
  }),
  beforeLoad: async ({ context, location }) => {
    const user = await resolveAuthUser(context.authStore, context.user);
    if (!user) {
      throw redirect({
        to: "/signin",
        search: {
          error: "unauthorized",
          redirect: `${location.pathname}${location.search}${location.hash}`,
        },
      });
    }
  },
  loader: async ({ context, deps }) => {
    const user =
      context.authStore.state.user ??
      (await resolveAuthUser(context.authStore, context.user));
    if (!user) {
      throw redirect({ to: "/signin", search: { error: "unauthorized" } });
    }

    // 如果是 OAuth 回调，处理完成后重定向
    if (deps.code && deps.state) {
      // OAuth 回调处理将在组件中完成，这里只返回用户信息
      return { email: user.email, isOAuthCallback: true };
    }

    // 检查是否已有账户，如果有则重定向到 dashboard
    const { hasAccount } = await getYouTubeAccountStatus();
    if (hasAccount) {
      throw redirect({ to: "/dashboard/playlists" });
    }

    return { email: user.email, isOAuthCallback: false };
  },
  component: ConnectYouTube,
});

function ConnectYouTube() {
  const { email, isOAuthCallback } = Route.useLoaderData();
  const authUser = useAuthUser();
  const search = Route.useSearch();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const autoStart = search.auto === "1" || search.auto === "true";
  const hasAutoStarted = useRef(false);
  const displayEmail = authUser?.email ?? email ?? "your account";

  // 处理 OAuth 回调
  useEffect(() => {
    if (!isOAuthCallback || !search.code || !search.state) return;

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // 使用 requestAnimationFrame 来避免在 effect 中直接调用 setState
    const processOAuth = async () => {
      requestAnimationFrame(() => {
        if (!isMounted) return;
        setOauthMessage("Connecting YouTube...");
        setActionError(null);
      });

      try {
        await completeYouTubeOauthFn({
          data: { code: search.code, state: search.state },
        });
        if (!isMounted) return;
        setOauthMessage(
          'YouTube connected! Created "YouChannel AI" playlist for your video analysis.',
        );
        await router.invalidate();
        // 延迟一下让用户看到成功消息，然后重定向
        timeoutId = setTimeout(() => {
          router.navigate({ to: "/dashboard/playlists" });
        }, 1000);
      } catch (error) {
        if (!isMounted) return;
        const errorMessage =
          error instanceof Error ? error.message : "YouTube connect failed";
        requestAnimationFrame(() => {
          setActionError(errorMessage);
          setOauthMessage(null);
        });
      }
    };

    processOAuth();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOAuthCallback, search.code, search.state, router]);

  // 处理 OAuth 错误
  useEffect(() => {
    if (search.error) {
      requestAnimationFrame(() => {
        setActionError("YouTube OAuth failed. Please try again.");
      });
    }
  }, [search.error]);

  const connectMutation = useMutation({
    mutationFn: () => startYouTubeOAuthFn(),
    onSuccess: ({ url }) => {
      // 使用 window.location 进行 OAuth 重定向到 Google
      // 这是 OAuth 流程的一部分，需要完整的页面跳转
      if (url && typeof window !== "undefined") {
        window.location.assign(url);
      }
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to connect");
    },
  });

  useEffect(() => {
    if (!autoStart || isOAuthCallback || search.error) return;
    if (connectMutation.isPending || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    connectMutation.mutate();
  }, [
    autoStart,
    connectMutation,
    connectMutation.isPending,
    isOAuthCallback,
    search.error,
  ]);

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
              Signed in as <span className="text-foreground">{displayEmail}</span>
            </div>
            {oauthMessage && (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                {oauthMessage}
              </div>
            )}
            {actionError && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {actionError}
              </div>
            )}
            {!isOAuthCallback && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  We will create a private playlist called "YouChannel AI" on your YouTube
                  account. Add videos to this playlist and we will automatically analyze
                  them.
                </p>
                <p>You can revoke access anytime in your Google account settings.</p>
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
