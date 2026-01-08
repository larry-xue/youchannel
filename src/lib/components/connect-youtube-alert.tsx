import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2, Youtube } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "~/lib/components/ui/alert";
import { Button } from "~/lib/components/ui/button";
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

    const connectMutation = useMutation({
        mutationFn: () => startYouTubeOAuthFn(),
        onSuccess: ({ url }) => {
            if (url) window.location.href = url;
        },
        onError: (err) => {
            setStatus("error");
            setErrorMessage(err instanceof Error ? err.message : "Failed to initiate connection");
        },
    });

    const callbackMutation = useMutation({
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
        if (code && state && status === "processing" && !callbackMutation.submittedAt) {
            callbackMutation.mutate({ code, state });
        }
    }, [code, state, status, callbackMutation]);

    if (status === "success") {
        return (
            <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Success!</AlertTitle>
                <AlertDescription>
                    Your YouTube account has been connected. Loading your playlists...
                </AlertDescription>
            </Alert>
        );
    }

    if (status === "processing") {
        return (
            <Alert className="border-primary/50 bg-primary/10">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <AlertTitle>Connecting...</AlertTitle>
                <AlertDescription>
                    Please wait while we link your YouTube account.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <Alert variant={status === "error" ? "destructive" : "default"} className="relative overflow-hidden">
            {status === "error" ? (
                <AlertCircle className="h-4 w-4" />
            ) : (
                <Youtube className="h-4 w-4 text-red-600" />
            )}
            <AlertTitle>
                {status === "error" ? "Connection Failed" : "Connect YouTube"}
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <p>
                        {status === "error"
                            ? errorMessage
                            : "Start learning from your favorite content. Connect your YouTube account to import your playlists."}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant={status === "error" ? "outline" : "default"}
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                >
                    {connectMutation.isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Redirecting...
                        </>
                    ) : status === "error" ? (
                        "Try Again"
                    ) : (
                        "Connect YouTube"
                    )}
                </Button>
            </AlertDescription>
        </Alert>
    );
}
