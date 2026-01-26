import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/lib/components/ui/empty";
import { Loading } from "~/lib/components/ui/loading";
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
      <Empty className="rounded-2xl border border-border/60 bg-card px-6 py-10">
        <EmptyHeader>
          <EmptyTitle className="text-base font-semibold text-foreground">
            {m.connect_success_title()}
          </EmptyTitle>
          <EmptyDescription className="text-sm text-muted-foreground">
            {m.connect_success_desc()}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Loading text={m.connect_redirecting()} />
        </EmptyContent>
      </Empty>
    );
  }

  if (status === "processing") {
    return (
      <Empty className="rounded-2xl border border-border/60 bg-card px-6 py-10">
        <EmptyHeader>
          <EmptyTitle className="text-base font-semibold text-foreground">
            {m.connect_processing_title()}
          </EmptyTitle>
          <EmptyDescription className="text-sm text-muted-foreground">
            {m.connect_processing_desc()}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (status === "error") {
    return (
      <Empty className="rounded-2xl border border-border/60 bg-card px-6 py-10">
        <EmptyHeader>
          <EmptyTitle className="text-base font-semibold text-foreground">
            {m.connect_failure_title()}
          </EmptyTitle>
          <EmptyDescription className="text-sm text-muted-foreground">
            {errorMessage}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4" />
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
    <Empty className="rounded-2xl border border-border/60 bg-card px-6 py-12">
      <EmptyHeader>
        <EmptyTitle className="text-base font-semibold text-foreground">
          {m.connect_youtube_title()}
        </EmptyTitle>
        <EmptyDescription className="text-sm leading-relaxed text-muted-foreground">
          {m.connect_youtube_desc()}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="mt-4">
        <Button
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
        >
          {connectMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4" />
              {m.connect_redirecting()}
            </>
          ) : (
            m.connect_youtube_button()
          )}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
