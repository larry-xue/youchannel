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
  setActivePlaylistFn,
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
  const activePlaylist = playlists.find((playlist) => playlist.is_active) || null;
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
    mutationFn: (playlistId: string) => syncPlaylistFn({ data: { playlistId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Sync failed");
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (playlistId: string) => setActivePlaylistFn({ data: { playlistId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to set active playlist",
      );
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Dashboard
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Playlist control
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage your YouTube connection, sync cadence, and the playlist you want to
          track.
        </p>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="playlist-select"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Playlist
            </label>
            <div className="min-w-[220px] flex-1">
              <select
                id="playlist-select"
                value={activePlaylistId ?? ""}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId) setActiveMutation.mutate(nextId);
                }}
                disabled={
                  playlistsQuery.isLoading ||
                  playlists.length === 0 ||
                  setActiveMutation.isPending
                }
                className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="" disabled>
                  {playlistsQuery.isLoading
                    ? "Loading playlists..."
                    : playlists.length === 0
                      ? "No playlists available"
                      : "Select a playlist"}
                </option>
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.title || "Untitled playlist"}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              onClick={() => activePlaylist && syncMutation.mutate(activePlaylist.id)}
              disabled={!activePlaylist || syncMutation.isPending}
            >
              {syncMutation.isPending ? "Syncing..." : "Sync now"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active videos</CardTitle>
            <CardDescription>Browse uploads for the active playlist.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!activePlaylist ? (
              <p className="text-sm text-muted-foreground">
                Select a playlist above to load its videos.
              </p>
            ) : videosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading videos...</p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No videos yet. Sync the playlist to fetch recent uploads.
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
    </div>
  );
}
