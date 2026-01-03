import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { CardDescription, CardTitle } from "~/lib/components/ui/card";
import {
  PLAYLISTS_QUERY_KEY,
  USER_QUOTA_QUERY_KEY,
  getPlaylistsFn,
  getUserQuotaFn,
  getVideosFn,
  restorePlaylistFn,
  startYouTubeOAuthFn,
  triggerOpenApiAnalysisFn,
  type OpenApiAnalysisResponse,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import { formatDate, formatDateTime, truncate } from "~/lib/dashboard/utils";
import type { PlaylistEntryStatus, VideoAnalysisSkipReason } from "~/schema";

export const Route = createFileRoute("/dashboard/playlists")({
  component: DashboardPlaylists,
});

const EMPTY_VIDEOS: VideoWithStatus[] = [];

function formatVideoDuration(duration: string | null) {
  if (!duration) return null;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return duration;
  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return duration;
  }
  const pad = (value: number) => value.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function DashboardPlaylists() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [analysisSummary, setAnalysisSummary] =
    useState<OpenApiAnalysisResponse | null>(null);
  const [showRemovedVideos, setShowRemovedVideos] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

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
  const eligibleVideoIds = videos
    .filter((video) => video.sync_status === "synced" && video.analysis_count === 0)
    .map((video) => video.id);
  const selectedCount = selectedVideoIds.length;
  const eligibleCount = eligibleVideoIds.length;

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

  const triggerAnalysisMutation = useMutation({
    mutationFn: (payload: { playlistId: string; videoIds: string[] }) =>
      triggerOpenApiAnalysisFn({ data: payload }),
    onSuccess: (result) => {
      setAnalysisSummary(result);
      setSelectedVideoIds([]);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: USER_QUOTA_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      void videosQuery.refetch();
    },
    onError: (error) => {
      setAnalysisSummary(null);
      setActionError(
        error instanceof Error ? error.message : "Failed to trigger analysis",
      );
    },
  });

  useEffect(() => {
    setSelectedVideoIds((prev) => {
      const eligible = new Set(eligibleVideoIds);
      const next = prev.filter((id) => eligible.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [eligibleVideoIds]);

  useEffect(() => {
    setSelectedVideoIds([]);
    setAnalysisSummary(null);
  }, [activePlaylistId]);

  const handleOpenVideo = (video: VideoWithStatus) => {
    router.navigate({
      to: "/dashboard/learn/$videoId",
      params: { videoId: video.id },
    });
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    video: VideoWithStatus,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenVideo(video);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setActionError(null);
    setAnalysisSummary(null);
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

  const handleToggleVideo = (videoId: string) => {
    setSelectedVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId],
    );
  };

  const handleSelectAllEligible = () => {
    setSelectedVideoIds(eligibleVideoIds);
  };

  const handleClearSelection = () => {
    setSelectedVideoIds([]);
  };

  const handleTriggerAnalysis = () => {
    if (!activePlaylistId || selectedCount === 0) return;
    setActionError(null);
    setAnalysisSummary(null);
    triggerAnalysisMutation.mutate({
      playlistId: activePlaylistId,
      videoIds: selectedVideoIds,
    });
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
      {analysisSummary && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          <span className="font-medium">Analysis queued.</span>{" "}
          {analysisSummary.enqueued} enqueued, {analysisSummary.skipped} skipped.
          <span className="ml-2 text-emerald-700/80 dark:text-emerald-200/80">
            Existing: {analysisSummary.skipReasons.analysis_exists}, Duration:{" "}
            {analysisSummary.skipReasons.duration_exceeded}, Quota:{" "}
            {analysisSummary.skipReasons.quota_exceeded}.
          </span>
        </div>
      )}

      <div className="space-y-4">
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
        <div className="space-y-4">
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
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {selectedCount} selected · {eligibleCount} eligible
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Only synced videos without analysis can be selected.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllEligible}
                        disabled={eligibleCount === 0}
                        className="text-xs"
                      >
                        Select all
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearSelection}
                        disabled={selectedCount === 0}
                        className="text-xs"
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleTriggerAnalysis}
                        disabled={selectedCount === 0 || triggerAnalysisMutation.isPending}
                        className="text-xs"
                      >
                        {triggerAnalysisMutation.isPending
                          ? "Triggering..."
                          : "Trigger analysis"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                    {videos.map((video) => {
                      const isSelectable =
                        video.sync_status === "synced" && video.analysis_count === 0;
                      const isSelected = selectedVideoIds.includes(video.id);
                      const durationLabel = formatVideoDuration(video.duration);

                      return (
                        <div
                          key={video.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open learning view for ${video.title || "video"}`}
                          onClick={() => handleOpenVideo(video)}
                          onKeyDown={(event) => handleCardKeyDown(event, video)}
                          className={`group flex w-full cursor-pointer flex-col overflow-hidden rounded-3xl border bg-background/80 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:shadow-md ${
                            isSelected ? "ring-2 ring-primary/30" : ""
                          } ${
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
                            <div
                              className="absolute left-2 top-2"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                              title={
                                isSelectable
                                  ? "Select for analysis"
                                  : "Only synced videos without analysis can be selected"
                              }
                            >
                              <label
                                className={`flex items-center gap-2 rounded-full bg-background/80 px-2 py-1 text-[11px] text-foreground shadow ${
                                  isSelectable ? "" : "opacity-60"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleVideo(video.id)}
                                  disabled={!isSelectable}
                                  className="h-3.5 w-3.5"
                                  aria-label={`Select ${video.title || "video"} for analysis`}
                                />
                                <span>{isSelectable ? "Select" : "Locked"}</span>
                              </label>
                            </div>
                            {video.sync_status !== "synced" && (
                              <div className="absolute right-2 top-2">
                                <VideoSyncStatusBadge status={video.sync_status} />
                              </div>
                            )}
                            {durationLabel && (
                              <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                                {durationLabel}
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
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenVideo(video);
                                }}
                              >
                                Learn
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

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
  if (count === 0) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
      >
        Not started
      </Badge>
    );
  }

  const resolvedStatus = status || "pending";

  if (resolvedStatus === "processing") {
    return (
      <Badge
        variant="outline"
        className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400"
      >
        Processing
      </Badge>
    );
  }

  if (resolvedStatus === "skipped") {
    const reasonText =
      skipReason === "quota_exceeded"
        ? "Quota exceeded"
        : skipReason === "duration_exceeded"
          ? "Duration exceeded"
          : skipReason === "video_unavailable"
            ? "Video unavailable"
            : null;
    return (
      <Badge
        variant="outline"
        className="border-slate-500/30 bg-slate-500/10 text-xs text-slate-600 dark:text-slate-400"
        title={reasonText ? `Skipped: ${reasonText}` : undefined}
      >
        Skipped
      </Badge>
    );
  }

  if (resolvedStatus === "failed") {
    return (
      <Badge
        variant="outline"
        className="border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400"
        title={latestAt ? `Last: ${formatDate(latestAt)}` : undefined}
      >
        Failed
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400"
      title={latestAt ? `Completed: ${formatDate(latestAt)}` : undefined}
    >
      {resolvedStatus === "pending" ? "Pending" : "Completed"}
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
