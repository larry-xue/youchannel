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

interface ConnectYouTubeAlertProps {
    code?: string;
    state?: string;
    error?: string;
}

export function ConnectYouTubeAlert({ code, state, error }: ConnectYouTubeAlertProps) {
    const router = useRouter();
    const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">(
        code && state ? "processing" : error ? "error" : "idle"
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
            setErrorMessage(err instanceof Error ? err.message : "Failed to initiate connection");
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
            setErrorMessage(err instanceof Error ? err.message : "Failed to complete connection");
        },
    });

    useEffect(() => {
        if (code && state && status === "processing" && !callbackSubmittedAt) {
            callbackMutate({ code, state });
        }
    }, [code, state, status, callbackMutate, callbackSubmittedAt]);

    if (status === "success") {
        return (
            <Empty className="rounded-3xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 animate-in fade-in zoom-in-95 duration-500">
                <EmptyHeader>
                    <EmptyMedia>
                        <div className="relative">
                            <div className="absolute inset-0 animate-pulse rounded-full bg-emerald-500/20 blur-xl" />
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted shadow-xl ring-1 ring-border/50">
                                <span className="text-4xl">✅</span>
                            </div>
                        </div>
                    </EmptyMedia>
                    <EmptyTitle className="text-emerald-600">Success!</EmptyTitle>
                    <EmptyDescription>
                        Your YouTube account has been connected. Loading your playlists...
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                </EmptyContent>
            </Empty>
        );
    }

    if (status === "processing") {
        return (
            <Empty className="rounded-3xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 animate-in fade-in zoom-in-95 duration-500">
                <EmptyHeader>
                    <EmptyMedia>
                        <div className="relative">
                            <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted shadow-xl ring-1 ring-border/50">
                                <span className="text-4xl">⏳</span>
                            </div>
                        </div>
                    </EmptyMedia>
                    <EmptyTitle>Connecting...</EmptyTitle>
                    <EmptyDescription>
                        Please wait while we link your YouTube account.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    if (status === "error") {
        return (
            <Empty className="rounded-3xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 animate-in fade-in zoom-in-95 duration-500">
                <EmptyHeader>
                    <EmptyMedia>
                        <div className="relative">
                            <div className="absolute inset-0 animate-pulse rounded-full bg-destructive/20 blur-xl" />
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted shadow-xl ring-1 ring-border/50">
                                <span className="text-4xl">❌</span>
                            </div>
                        </div>
                    </EmptyMedia>
                    <EmptyTitle className="text-destructive">Connection Failed</EmptyTitle>
                    <EmptyDescription>{errorMessage}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button
                        size="lg"
                        variant="outline"
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending}
                        className="h-11 rounded-full px-8 shadow-lg transition-all hover:shadow-primary/25"
                    >
                        {connectMutation.isPending ? (
                            <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Redirecting...
                            </>
                        ) : (
                            "Try Again"
                        )}
                    </Button>
                </EmptyContent>
            </Empty>
        );
    }

    return (
        <Empty className="rounded-3xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 animate-in fade-in zoom-in-95 duration-500">
            <EmptyHeader>
                <EmptyMedia>
                    <div className="relative">
                        <div className="absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-xl" />
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted shadow-xl ring-1 ring-border/50">
                            <span className="text-4xl">▶️</span>
                        </div>
                    </div>
                </EmptyMedia>
                <EmptyTitle>Connect YouTube</EmptyTitle>
                <EmptyDescription>
                    Start learning from your favorite content. Connect your YouTube account to import your playlists.
                </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button
                    size="lg"
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="h-11 rounded-full px-8 shadow-lg transition-all hover:shadow-primary/25"
                >
                    {connectMutation.isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Redirecting...
                        </>
                    ) : (
                        "Connect YouTube"
                    )}
                </Button>
            </EmptyContent>
        </Empty>
    );
}
