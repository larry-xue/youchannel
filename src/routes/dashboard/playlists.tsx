import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import {
  PLAYLISTS_QUERY_KEY,
  getPlaylistsFn,
  getVideosFn,
  restorePlaylistFn,
  startYouTubeOAuthFn,
  triggerOpenApiAnalysisFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import {
  formatDate,
  getVideoPublishedAt,
  truncate,
} from "~/lib/dashboard/utils";
import type { PlaylistEntryStatus, VideoAnalysisSkipReason } from "~/schema";
import { toast } from "sonner";

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

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
        data: {
          playlistIds: activePlaylistId ? [activePlaylistId] : [],
          includeSyncStatus: ["synced", "removed", "unavailable"],
        },
      }),
    enabled: Boolean(activePlaylistId),
  });

  const videos = videosQuery.data ?? EMPTY_VIDEOS;
  const isVideoSelectable = (video: VideoWithStatus) => {
    if (video.sync_status !== "synced") return false;
    const isProcessing =
      video.latest_analysis_status === "pending" ||
      video.latest_analysis_status === "processing";
    const hasTooManyFailures = (video.failed_count ?? 0) > 3;
    return !isProcessing && !hasTooManyFailures;
  };
  const eligibleVideoIds = videos
    .filter((video) => isVideoSelectable(video))
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
      const skippedReasons: string[] = [];
      if (result.skipReasons.analysis_exists > 0) {
        skippedReasons.push(`${result.skipReasons.analysis_exists} already in progress`);
      }
      if (result.skipReasons.duration_exceeded > 0) {
        skippedReasons.push(`${result.skipReasons.duration_exceeded} too long`);
      }
      if (result.skipReasons.quota_exceeded > 0) {
        skippedReasons.push(`${result.skipReasons.quota_exceeded} limit reached`);
      }
      const skippedText =
        result.skipped > 0
          ? `, and ${result.skipped} couldn't be started${
              skippedReasons.length > 0
                ? ` (${skippedReasons.join(", ")})`
                : ""
            }`
          : "";

      if (result.enqueued > 0) {
        toast.success("We are on it", {
          description: `We are working on ${result.enqueued} videos${skippedText}. This may take a few minutes - please wait for updates.`,
        });
      } else {
        toast.info("Nothing to start yet", {
          description: `We could not start on the current selection${skippedText}. Please try again later.`,
        });
      }

      setSelectedVideoIds([]);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      void videosQuery.refetch();
    },
    onError: () => {
      toast.error("We could not start", {
        description: "Please try again later. If this keeps happening, refresh the page.",
      });
      setActionError(null);
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
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY }),
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
    triggerAnalysisMutation.mutate({
      playlistId: activePlaylistId,
      videoIds: selectedVideoIds,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {activePlaylist?.title || "YouChannel AI"}
          </h1>
          {activePlaylist && (
            <PlaylistStatusBadge status={activePlaylist.entry_status} />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {activePlaylist?.entry_status === "lost" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Playlist not found on YouTube
            </p>
            <Button
              onClick={() => restoreMutation.mutate(activePlaylist.id)}
              disabled={restoreMutation.isPending}
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {restoreMutation.isPending ? "Restoring..." : "Restore"}
            </Button>
          </div>
        </div>
      )}

      {activePlaylist?.entry_status === "auth_invalid" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Authorization expired
            </p>
            <Button
              onClick={() => reAuthMutation.mutate()}
              disabled={reAuthMutation.isPending}
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {reAuthMutation.isPending ? "Redirecting..." : "Re-authorize"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <Loading text="Loading videos..." size="md" />
        ) : !activePlaylist ? (
          <p className="text-sm text-muted-foreground">
            No playlist found. Please connect your YouTube account first.
          </p>
        ) : (
          <>
            {videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No videos yet. Add videos to your playlist on YouTube, then refresh.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium text-foreground">
                      {selectedCount} selected
                    </span>
                    <span className="text-muted-foreground">
                      {eligibleCount} eligible
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllEligible}
                      disabled={eligibleCount === 0}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                      disabled={selectedCount === 0}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleTriggerAnalysis}
                      disabled={selectedCount === 0 || triggerAnalysisMutation.isPending}
                    >
                      {triggerAnalysisMutation.isPending
                        ? "Triggering..."
                        : "Analyze"}
                    </Button>
                  </div>
                </div>
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                  {videos.map((video) => {
                      const isSelectable = isVideoSelectable(video);
                      const isProcessing =
                        video.latest_analysis_status === "pending" ||
                        video.latest_analysis_status === "processing";
                      const hasTooManyFailures = (video.failed_count ?? 0) > 3;
                      const isSelected = selectedVideoIds.includes(video.id);
                      const durationLabel = formatVideoDuration(video.duration);
                      const selectionLabel = isSelectable
                        ? "Select"
                        : hasTooManyFailures
                          ? "Paused"
                          : isProcessing
                            ? "Processing"
                            : "Locked";
                      const selectionHint = hasTooManyFailures
                        ? "This video failed analysis several times and is temporarily locked."
                        : isProcessing
                          ? "This video is already being analyzed."
                          : "Only synced videos can be selected.";

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
                              title={hasTooManyFailures ? undefined : selectionHint}
                            >
                              {hasTooManyFailures ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
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
                                      <span>{selectionLabel}</span>
                                    </label>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    This video failed analysis several times and is temporarily locked. Please try again later.
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
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
                                  <span>{selectionLabel}</span>
                                </label>
                              )}
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
                              {formatDate(getVideoPublishedAt(video))}
                            </p>
                            <div className="mt-auto! flex items-center justify-between gap-2 border-t border-border/40 pt-2">
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
