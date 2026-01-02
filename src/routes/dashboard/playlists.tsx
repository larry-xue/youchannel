import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/lib/components/ui/dialog";
import {
  PLAYLISTS_QUERY_KEY,
  USER_QUOTA_QUERY_KEY,
  getPlaylistsFn,
  getUserQuotaFn,
  getVideoAnalysesFn,
  getVideosFn,
  restorePlaylistFn,
  startYouTubeOAuthFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import { formatDate, formatDateTime, truncate } from "~/lib/dashboard/utils";
import type { PlaylistEntryStatus, VideoAnalysis, VideoAnalysisSkipReason } from "~/schema";

export const Route = createFileRoute("/dashboard/playlists")({
  component: DashboardPlaylists,
});

const EMPTY_VIDEOS: VideoWithStatus[] = [];

function DashboardPlaylists() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoWithStatus | null>(null);
  const [analyses, setAnalyses] = useState<VideoAnalysis[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingAnalyses, setIsLoadingAnalyses] = useState(false);
  const [showRemovedVideos, setShowRemovedVideos] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const playlistsQuery = useQuery({
    queryKey: PLAYLISTS_QUERY_KEY,
    queryFn: () => getPlaylistsFn(),
  });

  const quotaQuery = useQuery({
    queryKey: USER_QUOTA_QUERY_KEY,
    queryFn: () => getUserQuotaFn(),
  });

  const playlists = playlistsQuery.data || [];
  const activePlaylist = playlists.find((playlist) => playlist.is_active) || null;
  const activePlaylistId = activePlaylist?.id;
  const quota = quotaQuery.data;

  const videosQuery = useQuery({
    queryKey: ["videos", activePlaylistId, showRemovedVideos],
    queryFn: () =>
      getVideosFn({
        data: {
          playlistIds: activePlaylistId ? [activePlaylistId] : [],
          includeSyncStatus: showRemovedVideos
            ? ["synced", "removed", "unavailable"]
            : ["synced"],
        },
      }),
    enabled: Boolean(activePlaylistId),
  });

  const videos = videosQuery.data ?? EMPTY_VIDEOS;

  const restoreMutation = useMutation({
    mutationFn: (playlistId: string) => restorePlaylistFn({ data: { playlistId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY });
      setActionError(null);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Restore failed");
    },
  });

  const reAuthMutation = useMutation({
    mutationFn: () => startYouTubeOAuthFn(),
    onSuccess: (result) => {
      if (result.url) {
        window.location.href = result.url;
      }
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Re-authorization failed");
    },
  });

  const isLoading = playlistsQuery.isLoading || videosQuery.isLoading;

  const handleViewAnalysis = async (video: VideoWithStatus) => {
    setSelectedVideo(video);
    setIsDialogOpen(true);
    setIsLoadingAnalyses(true);

    try {
      const data = await getVideoAnalysesFn({ data: { videoId: video.id } });
      setAnalyses(data);
    } catch {
      setAnalyses([]);
    } finally {
      setIsLoadingAnalyses(false);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedVideo(null);
    setAnalyses([]);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setActionError(null);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: USER_QUOTA_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  };

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
            Videos from your YouChannel AI playlist. Add videos to the playlist on YouTube
            for AI analysis.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quota && <QuotaDisplay quota={quota} />}
          <Button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>{activePlaylist?.title || "YouChannel AI"} playlist</CardTitle>
                {activePlaylist && (
                  <PlaylistStatusBadge status={activePlaylist.entry_status} />
                )}
              </div>
              <CardDescription>
                {activePlaylist?.updated_at
                  ? `Updated ${formatDateTime(activePlaylist.updated_at)}`
                  : "No updates yet"}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRemovedVideos(!showRemovedVideos)}
              className="text-xs"
            >
              {showRemovedVideos ? "Hide removed" : "Show removed"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading videos...</p>
          ) : !activePlaylist ? (
            <p className="text-sm text-muted-foreground">
              No playlist found. Please connect your YouTube account first.
            </p>
          ) : activePlaylist.entry_status === "lost" ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="text-sm">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    Playlist not found on YouTube
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    The playlist may have been deleted. You can restore it to continue analysis.
                  </p>
                </div>
                <Button
                  onClick={() => restoreMutation.mutate(activePlaylist.id)}
                  disabled={restoreMutation.isPending}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  {restoreMutation.isPending ? "Restoring..." : "Restore Playlist"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {activePlaylist.entry_status === "auth_invalid" && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="text-sm">
                      <p className="font-medium text-red-600 dark:text-red-400">
                        Authorization expired
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Re-authorize your YouTube account to resume syncing playlist videos.
                      </p>
                    </div>
                    <Button
                      onClick={() => reAuthMutation.mutate()}
                      disabled={reAuthMutation.isPending}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      {reAuthMutation.isPending
                        ? "Redirecting..."
                        : "Re-authorize YouTube"}
                    </Button>
                  </div>
                </div>
              )}
              {videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No videos yet. Add videos to your YouChannel AI playlist on YouTube, then
                  click "Refresh" to check for updates.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,280px))] sm:justify-start">
                  {videos.map((video) => (
                    <div
                      key={video.id}
                      className={`group flex w-full flex-col overflow-hidden rounded-3xl border bg-background/80 transition-shadow hover:shadow-md ${
                        video.sync_status === "removed"
                          ? "border-amber-500/30 opacity-70"
                          : video.sync_status === "unavailable"
                            ? "border-red-500/30 opacity-70"
                            : "border-border/60"
                      }`}
                    >
                      <div className="relative w-full overflow-hidden bg-muted/40 pb-[56.25%]">
                        {video.thumbnail_url ? (
                          <img
                            src={video.thumbnail_url}
                            alt={video.title || "Video thumbnail"}
                            className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                            No thumbnail
                          </div>
                        )}
                        {video.sync_status !== "synced" && (
                          <div className="absolute right-2 top-2">
                            <VideoSyncStatusBadge status={video.sync_status} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col space-y-2 px-3 pb-3 pt-2">
                        <p
                          className="text-sm font-semibold leading-snug text-foreground"
                          title={video.title || "Video"}
                        >
                          {truncate(video.title || "Video", 48)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(video.published_at)}
                        </p>
                        <div className="!mt-auto flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                          <AnalysisStatusBadge
                            count={video.analysis_count}
                            latestAt={video.latest_analysis_at}
                            status={video.latest_analysis_status}
                            skipReason={video.latest_skip_reason}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleViewAnalysis(video)}
                            disabled={video.analysis_count === 0}
                          >
                            {video.analysis_count > 0 ? "View" : "No analysis"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-normal">
              {truncate(selectedVideo?.title || "Video Analysis", 60)}
            </DialogTitle>
            <DialogDescription>
              {selectedVideo?.analysis_count || 0} analysis
              {(selectedVideo?.analysis_count || 0) !== 1 ? "es" : ""} generated
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
            {isLoadingAnalyses ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading analyses...
              </p>
            ) : analyses.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No analyses found for this video.
              </p>
            ) : (
              analyses.map((analysis, index) => (
                <div
                  key={analysis.id}
                  className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Analysis #{analyses.length - index}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(analysis.created_at)} · {analysis.model}
                      </p>
                    </div>
                    <Badge
                      variant={
                        analysis.status === "completed" ? "default" : "destructive"
                      }
                      className="text-xs"
                    >
                      {analysis.status}
                    </Badge>
                  </div>
                  {analysis.prompt && (
                    <div className="rounded-xl bg-background/60 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                      <p className="mt-1 text-sm text-foreground/80">{analysis.prompt}</p>
                    </div>
                  )}
                  {analysis.status === "completed" && analysis.analysis_text ? (
                    <div className="prose prose-sm max-w-none text-foreground/90">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {analysis.analysis_text}
                      </div>
                    </div>
                  ) : analysis.error ? (
                    <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {analysis.error}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnalysisStatusBadge({
  count,
  latestAt,
  status,
  skipReason,
}: {
  count: number;
  latestAt: string | null;
  status: string | null;
  skipReason: VideoAnalysisSkipReason | null;
}) {
  if (status === "processing") {
    return (
      <Badge
        variant="outline"
        className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400"
      >
        Analyzing...
      </Badge>
    );
  }

  if (status === "skipped" && skipReason) {
    const reasonText =
      skipReason === "quota_exceeded"
        ? "Quota exceeded"
        : skipReason === "duration_exceeded"
          ? "Video too long"
          : "Unavailable";

    return (
      <Badge
        variant="outline"
        className="border-slate-500/30 bg-slate-500/10 text-xs text-slate-600 dark:text-slate-400"
        title={`Skipped: ${reasonText}`}
      >
        Skipped
      </Badge>
    );
  }

  if (count === 0) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
      >
        Pending
      </Badge>
    );
  }

  if (status === "failed") {
    return (
      <Badge
        variant="outline"
        className="border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400"
        title={latestAt ? `Last: ${formatDate(latestAt)}` : undefined}
      >
        Failed ({count})
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400"
      title={latestAt ? `Last: ${formatDate(latestAt)}` : undefined}
    >
      {count} {count === 1 ? "analysis" : "analyses"}
    </Badge>
  );
}

function PlaylistStatusBadge({ status }: { status: PlaylistEntryStatus }) {
  if (status === "active") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400"
      >
        Active
      </Badge>
    );
  }

  if (status === "lost") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
      >
        Playlist Lost
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400"
    >
      Auth Invalid
    </Badge>
  );
}

function VideoSyncStatusBadge({ status }: { status: string }) {
  if (status === "removed") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-900/80 text-xs text-amber-200"
      >
        Removed
      </Badge>
    );
  }

  if (status === "unavailable") {
    return (
      <Badge
        variant="outline"
        className="border-red-500/30 bg-red-900/80 text-xs text-red-200"
      >
        Unavailable
      </Badge>
    );
  }

  return null;
}

function QuotaDisplay({ quota }: { quota: { analysis_count: number; max_analyses: number } }) {
  const remaining = quota.max_analyses - quota.analysis_count;
  const isLow = remaining <= 1;
  const isExhausted = remaining <= 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        isExhausted
          ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          : isLow
            ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border bg-muted/50 text-muted-foreground"
      }`}
      title={`${quota.analysis_count} of ${quota.max_analyses} analyses used`}
    >
      <span className="font-medium">{remaining}</span>
      <span>analyses remaining</span>
    </div>
  );
}
