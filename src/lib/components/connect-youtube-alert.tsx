import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/lib/components/ui/empty";
import { completeYouTubeOauthFn, startYouTubeOAuthFn } from "~/lib/dashboard/data";
import * as m from "~/paraglide/messages";

interface ConnectYouTubeAlertProps {
  code?: string;
  state?: string;
  error?: string;
}

export function ConnectYouTubeAlert({ code, state, error }: ConnectYouTubeAlertProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">(
    code && state ? "processing" : error ? "error" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(error || null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: () => startYouTubeOAuthFn(),
    onSuccess: ({ url }) => {
      if (url) setRedirectUrl(url);
    },
    onError: (err) => {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : m.connect_error_init_failed());
    },
  });

  useEffect(() => {
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  }, [redirectUrl]);

  const { mutate: callbackMutate, submittedAt: callbackSubmittedAt } = useMutation({
    mutationFn: (data: { code: string; state: string }) =>
      completeYouTubeOauthFn({ data }),
    onSuccess: async () => {
      setStatus("success");
      // Short delay to show success state before clearing params
      setTimeout(async () => {
        await router.invalidate();
        await router.navigate({ to: "/playlists", search: {} });
      }, 1500);
    },
    onError: (err) => {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : m.connect_error_complete_failed(),
      );
    },
  });

  useEffect(() => {
    if (code && state && status === "processing" && !callbackSubmittedAt) {
      callbackMutate({ code, state });
    }
  }, [code, state, status, callbackMutate, callbackSubmittedAt]);

  if (status === "success") {
    return (
      <Empty className="rounded-3xl border-none bg-emerald-500/5 px-4 py-12 shadow-sm animate-in fade-in zoom-in-95 duration-500">
        <EmptyHeader>
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-emerald-500/20 blur-xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] bg-surface shadow-sm ring-1 ring-emerald-500/20">
                <span className="text-4xl">✅</span>
              </div>
            </div>
          </EmptyMedia>
          <EmptyTitle className="font-display text-2xl text-emerald-700 dark:text-emerald-400">
            {m.connect_success_title()}
          </EmptyTitle>
          <EmptyDescription className="text-base text-emerald-600/80 dark:text-emerald-300/80">
            {m.connect_success_desc()}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </EmptyContent>
      </Empty>
    );
  }

  if (status === "processing") {
    return (
      <Empty className="rounded-3xl border-none bg-surface-container px-4 py-12 shadow-sm animate-in fade-in zoom-in-95 duration-500">
        <EmptyHeader>
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] bg-surface shadow-sm ring-1 ring-primary/20">
                <span className="text-4xl">⏳</span>
              </div>
            </div>
          </EmptyMedia>
          <EmptyTitle className="font-display text-2xl">
            {m.connect_processing_title()}
          </EmptyTitle>
          <EmptyDescription className="text-base">
            {m.connect_processing_desc()}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (status === "error") {
    return (
      <Empty className="rounded-3xl border-none bg-destructive/5 px-4 py-12 shadow-sm animate-in fade-in zoom-in-95 duration-500">
        <EmptyHeader>
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-destructive/20 blur-xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] bg-surface shadow-sm ring-1 ring-destructive/20">
                <span className="text-4xl">❌</span>
              </div>
            </div>
          </EmptyMedia>
          <EmptyTitle className="font-display text-2xl text-destructive">
            {m.connect_failure_title()}
          </EmptyTitle>
          <EmptyDescription className="text-base text-destructive/80">
            {errorMessage}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="lg"
            variant="outline"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className="h-12 rounded-full border-destructive/20 bg-surface px-8 text-destructive hover:bg-destructive/10 hover:text-destructive shadow-sm"
          >
            {connectMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {m.connect_redirecting()}
              </>
            ) : (
              m.connect_try_again()
            )}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty className="group relative overflow-hidden rounded-3xl border border-border/40 bg-surface-container px-6 py-16 shadow-md transition-shadow hover:shadow-lg animate-in fade-in zoom-in-95 duration-500">
      {/* Decorative gradient blob */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl transition-colors group-hover:bg-primary/10" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-secondary/5 blur-3xl transition-colors group-hover:bg-secondary/10" />

      <EmptyHeader className="relative z-10">
        <EmptyMedia>
          <div className="relative mb-4">
            <div className="absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-2xl" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-[32px] bg-linear-to-br from-surface to-surface-container-high shadow-lg ring-1 ring-border/50">
              <span className="text-5xl drop-shadow-md">▶️</span>
            </div>
          </div>
        </EmptyMedia>
        <EmptyTitle className="font-display text-3xl font-bold tracking-tight text-foreground">
          {m.connect_youtube_title()}
        </EmptyTitle>
        <EmptyDescription className="mx-auto max-w-lg text-lg text-muted-foreground/90 leading-relaxed">
          {m.connect_youtube_desc()}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="relative z-10 mt-8">
        <Button
          size="lg"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          className="h-14 rounded-full px-10 text-lg font-medium shadow-xl shadow-primary/20 transition-[scale,box-shadow] hover:scale-105 hover:shadow-2xl hover:shadow-primary/30"
        >
          {connectMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {m.connect_redirecting()}
            </>
          ) : (
            <div className="flex items-center gap-2">{m.connect_youtube_button()}</div>
          )}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
