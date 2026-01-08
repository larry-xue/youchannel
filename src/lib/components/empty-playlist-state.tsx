import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Youtube } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import { PLAYLISTS_QUERY_KEY, syncPlaylistsFn } from "~/lib/dashboard/data";
import { toast } from "sonner";

export function EmptyPlaylistState() {
    const queryClient = useQueryClient();

    const syncMutation = useMutation({
        mutationFn: () => syncPlaylistsFn(),
        onSuccess: (data) => {
            toast.success(`Found ${data.total} playlists from YouTube`);
            queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY });
        },
        onError: (error) => {
            toast.error("Failed to sync playlists", {
                description: error instanceof Error ? error.message : "Unknown error",
            });
        },
    });

    return (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-6">
                <div className="absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-xl" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted shadow-xl ring-1 ring-border/50">
                    <Youtube className="h-10 w-10 text-red-600" />
                </div>
                <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background">
                    <RefreshCw className="h-4 w-4" />
                </div>
            </div>

            <h3 className="mb-2 font-display text-xl font-semibold text-foreground">
                Your library is waiting
            </h3>
            <p className="mb-8 max-w-sm text-sm text-muted-foreground">
                We've connected to YouTube, but we haven't imported your playlists yet.
                Sync your account to start learning from your own content.
            </p>

            <Button
                size="lg"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="h-11 rounded-full px-8 shadow-lg transition-all hover:shadow-primary/25"
            >
                {syncMutation.isPending ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing Library...
                    </>
                ) : (
                    <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Initialize Library
                    </>
                )}
            </Button>
        </div>
    );
}
