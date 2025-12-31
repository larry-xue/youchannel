import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import {
  PLAYLISTS_QUERY_KEY,
  getPlaylistsFn,
  getVideosFn,
  syncPlaylistFn,
} from "~/lib/dashboard/data";
import { formatDate, truncate } from "~/lib/dashboard/utils";
import { Video } from "~/schema";

export const Route = createFileRoute("/dashboard/playlists")({
  component: DashboardPlaylists,
});

const EMPTY_VIDEOS: Video[] = [];

function DashboardPlaylists() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const playlistsQuery = useQuery({
    queryKey: PLAYLISTS_QUERY_KEY,
    queryFn: () => getPlaylistsFn(),
  });

  const playlists = playlistsQuery.data || [];
  const activePlaylist =
    playlists.find((playlist) => playlist.is_active) || null;
  const activePlaylistId = activePlaylist?.id;

  const videosQuery = useQuery({
    queryKey: ["videos", activePlaylistId],
    queryFn: () =>
      getVideosFn({
        data: { playlistIds: activePlaylistId ? [activePlaylistId] : [] },
      }),
    enabled: Boolean(activePlaylistId),
  });

  const videos = videosQuery.data ?? EMPTY_VIDEOS;

  const syncMutation = useMutation({
    mutationFn: (playlistId: string) =>
      syncPlaylistFn({ data: { playlistId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Sync failed");
    },
  });

  const isLoading = playlistsQuery.isLoading || videosQuery.isLoading;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Your Videos
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Videos from your YouChannel AI playlist. Add videos to the playlist
            on YouTube for AI analysis.
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            activePlaylist && syncMutation.mutate(activePlaylist.id)
          }
          disabled={!activePlaylist || syncMutation.isPending || isLoading}
        >
          {syncMutation.isPending ? "Syncing..." : "Sync now"}
        </Button>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {activePlaylist?.title || "YouChannel AI"} playlist
          </CardTitle>
          <CardDescription>
            {activePlaylist?.last_synced_at
              ? `Last synced ${formatDate(activePlaylist.last_synced_at)}`
              : "Not synced yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading videos...</p>
          ) : !activePlaylist ? (
            <p className="text-sm text-muted-foreground">
              No playlist found. Please connect your YouTube account first.
            </p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No videos yet. Add videos to your YouChannel AI playlist on
              YouTube, then click "Sync now" to fetch them.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,280px))] sm:justify-start">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="w-full overflow-hidden rounded-3xl border border-border/60 bg-background/80"
                >
                  <div className="relative w-full overflow-hidden bg-muted/40 pb-[56.25%]">
                    {video.thumbnail_url ? (
                      <img
                        src={video.thumbnail_url}
                        alt={video.title || "Video thumbnail"}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                        No thumbnail
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 px-3 pb-3 pt-2">
                    <p className="text-sm font-semibold leading-snug text-foreground">
                      {truncate(video.title || "Video", 52)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(video.published_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
