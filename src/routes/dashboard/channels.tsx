import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import { Separator } from "~/lib/components/ui/separator";
import {
  CHANNELS_QUERY_KEY,
  CONVERSATIONS_QUERY_KEY,
  createConversationFn,
  getChannelsFn,
  getVideoAnalysesFn,
  getVideosFn,
  setActiveChannelFn,
  startYouTubeOAuthFn,
  syncChannelsFn,
  syncChannelFn,
} from "~/lib/dashboard/data";
import { formatDate, formatDateTime, truncate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/channels")({
  component: DashboardChannels,
});

function DashboardChannels() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<{
    created: number;
    skipped: number;
    total: number;
  } | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);

  const channelsQuery = useQuery({
    queryKey: CHANNELS_QUERY_KEY,
    queryFn: () => getChannelsFn(),
  });

  const channels = channelsQuery.data || [];
  const activeChannel = channels.find((channel) => channel.is_active) || null;
  const activeChannelId = activeChannel?.id;

  const connectMutation = useMutation({
    mutationFn: () => startYouTubeOAuthFn({ data: {} }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to start OAuth",
      );
    },
  });

  const videosQuery = useQuery({
    queryKey: ["videos", activeChannelId],
    queryFn: () =>
      getVideosFn({
        data: { channelIds: activeChannelId ? [activeChannelId] : [] },
      }),
    enabled: Boolean(activeChannelId),
  });

  const videos = videosQuery.data || [];
  const selectedVideo =
    videos.find((video) => video.id === selectedVideoId) || videos[0] || null;

  useEffect(() => {
    if (videos.length === 0) {
      setSelectedVideoId(null);
      return;
    }
    if (!selectedVideoId || !videos.some((video) => video.id === selectedVideoId)) {
      setSelectedVideoId(videos[0].id);
    }
  }, [selectedVideoId, videos]);

  const analysesQuery = useQuery({
    queryKey: ["analyses", selectedVideo?.id],
    queryFn: () =>
      getVideoAnalysesFn({ data: { videoId: selectedVideo?.id || "" } }),
    enabled: Boolean(selectedVideo?.id),
  });

  const analysisRecords = analysesQuery.data || [];
  const latestAnalysis = analysisRecords[0] || null;

  const createConversationMutation = useMutation({
    mutationFn: (payload: {
      channelId?: string | null;
      title?: string;
      selections: Array<{ videoId: string; analysisId?: string | null }>;
    }) => createConversationFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      router.navigate({ to: "/dashboard/conversations" });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to create conversation",
      );
    },
  });

  const syncMutation = useMutation({
    mutationFn: (channelId: string) => syncChannelFn({ data: { channelId } }),
    onSuccess: (result) => {
      setSyncSummary(result);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Sync failed");
    },
  });

  const syncChannelsMutation = useMutation({
    mutationFn: () => syncChannelsFn({ data: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Channel sync failed",
      );
    },
  });

  useEffect(() => {
    if (!autoSyncEnabled || !activeChannel) return;
    const interval = setInterval(() => {
      if (syncMutation.isPending) return;
      syncMutation.mutate(activeChannel.id);
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoSyncEnabled, activeChannel, syncMutation]);

  const setActiveMutation = useMutation({
    mutationFn: (channelId: string) => setActiveChannelFn({ data: { channelId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to set active channel",
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
          Manage your YouTube connection, sync cadence, and the playlist you
          want to track.
        </p>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Playlists</CardTitle>
            <CardDescription>
              Connect and pick the playlist you want to track.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {channelsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading playlists...</p>
            ) : (
              <>
                {activeChannel ? (
                  <>
                    <div className="flex items-center gap-3">
                      {activeChannel.thumbnail_url ? (
                        <img
                          src={activeChannel.thumbnail_url}
                          alt={activeChannel.title || "Playlist thumbnail"}
                          className="h-12 w-12 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                          {activeChannel.title?.slice(0, 1) || "C"}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {activeChannel.title || "Untitled playlist"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeChannel.custom_url || activeChannel.channel_id}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => syncMutation.mutate(activeChannel.id)}
                        disabled={syncMutation.isPending}
                      >
                        {syncMutation.isPending ? "Syncing..." : "Sync now"}
                      </Button>
                      <Button
                        type="button"
                        variant={autoSyncEnabled ? "secondary" : "outline"}
                        onClick={() => setAutoSyncEnabled((prev) => !prev)}
                      >
                        {autoSyncEnabled ? "Auto-sync on" : "Auto-sync off"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => connectMutation.mutate()}
                      >
                        Reconnect
                      </Button>
                    </div>

                    <div className="rounded-2xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Last sync: {formatDateTime(activeChannel.last_synced_at)}
                      {syncSummary && (
                        <span className="block text-[11px] text-muted-foreground/80">
                          {syncSummary.created} created, {syncSummary.skipped} skipped
                        </span>
                      )}
                      {autoSyncEnabled && (
                        <span className="mt-1 block text-[11px] text-muted-foreground/80">
                          Auto-sync runs every 30 minutes while this page is open.
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                      No playlists found yet. Sync your YouTube account to load
                      them, then pick one to start tracking.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => syncChannelsMutation.mutate()}
                        disabled={syncChannelsMutation.isPending}
                      >
                        {syncChannelsMutation.isPending
                          ? "Syncing..."
                          : "Sync playlists"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending}
                      >
                        {connectMutation.isPending ? "Reconnecting..." : "Reconnect"}
                      </Button>
                    </div>
                  </>
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Playlists
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => syncChannelsMutation.mutate()}
                      disabled={syncChannelsMutation.isPending}
                    >
                        {syncChannelsMutation.isPending
                        ? "Syncing..."
                        : "Sync playlists"}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition",
                          channel.is_active
                            ? "border-primary/40 bg-primary/10"
                            : "border-border/60 bg-background/70 hover:border-primary/30",
                        )}
                        onClick={() => setActiveMutation.mutate(channel.id)}
                      >
                        <span className="font-medium">
                          {channel.title || "Untitled playlist"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {channel.is_active ? "Tracking" : "Track"}
                        </span>
                      </button>
                    ))}
                    {channels.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                        No playlists synced yet.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active videos</CardTitle>
            <CardDescription>
              Browse uploads for the active playlist and review analyses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!activeChannel ? (
              <p className="text-sm text-muted-foreground">
                Pick a playlist on the left to load its videos.
              </p>
            ) : videosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading videos...</p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No videos yet. Sync the playlist to fetch recent uploads.
              </p>
            ) : (
              <div className="space-y-2">
                {videos.map((video) => (
                  <button
                    key={video.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition",
                      video.id === selectedVideo?.id
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/60 bg-background/70 hover:border-primary/30",
                    )}
                    onClick={() => setSelectedVideoId(video.id)}
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {truncate(video.title || "Video", 26)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(video.published_at)}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {video.analysis_count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <Separator />

            {!selectedVideo ? (
              <p className="text-sm text-muted-foreground">
                Select a video to review its analyses.
              </p>
            ) : analysesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading analyses...</p>
            ) : analysisRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No analyses yet for this video.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Analyses
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      latestAnalysis &&
                      createConversationMutation.mutate({
                        title: `Chat: ${selectedVideo?.title || "Video"}`,
                        selections: [
                          {
                            videoId: latestAnalysis.video_id,
                            analysisId: latestAnalysis.id,
                          },
                        ],
                      })
                    }
                    disabled={!latestAnalysis || createConversationMutation.isPending}
                  >
                    Chat latest
                  </Button>
                </div>
                {analysisRecords.map((analysis) => (
                  <div
                    key={analysis.id}
                    className="rounded-3xl border border-border/60 bg-background/70 px-3 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(analysis.created_at)}
                      </p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[11px]",
                          analysis.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-secondary/15 text-secondary-foreground",
                        )}
                      >
                        {analysis.status}
                      </span>
                    </div>
                    {analysis.status === "failed" ? (
                      <p className="mt-2 text-xs text-destructive">
                        {analysis.error || "Analysis failed"}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-foreground">
                        {truncate(analysis.analysis_text, 180)}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          createConversationMutation.mutate({
                            title: `Chat: ${selectedVideo?.title || "Video"}`,
                            selections: [
                              {
                                videoId: analysis.video_id,
                                analysisId: analysis.id,
                              },
                            ],
                          })
                        }
                        disabled={createConversationMutation.isPending}
                      >
                        Chat from analysis
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        {truncate(analysis.model || "Model", 18)}
                      </span>
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
