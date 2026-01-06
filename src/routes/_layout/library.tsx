import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/lib/components/ui/alert-dialog";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import { Progress } from "~/lib/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import { VideoCard } from "~/lib/components/video-card";
import {
  PLAYLISTS_QUERY_KEY,
  USER_QUOTA_QUERY_KEY,
  getPlaylistsFn,
  getUserQuotaFn,
  getVideosFn,
  restorePlaylistFn,
  startYouTubeOAuthFn,
  triggerOpenApiAnalysisFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import type { PlaylistEntryStatus } from "~/schema";
import { toast } from "sonner";

export const Route = createFileRoute("/_layout/library")({
  component: DashboardPlaylists,
});

const EMPTY_VIDEOS: VideoWithStatus[] = [];



function DashboardPlaylists() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);

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
      video.latest_analysis_status === "processing" ||
      video.latest_analysis_status === "queued";
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
          ? `, and ${result.skipped} couldn't be started${skippedReasons.length > 0
            ? ` (${skippedReasons.join(`, `)})`
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
      setShowAnalysisDialog(false);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: USER_QUOTA_QUERY_KEY });
      void videosQuery.refetch();
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Check if it's a quota-related error
      if (errorMessage.toLowerCase().includes("quota") || errorMessage.toLowerCase().includes("limit")) {
        toast.error("Quota Exceeded", {
          description: "Your analysis quota has been exhausted. Please try again later or contact support.",
        });
      } else {
        toast.error("We could not start", {
          description: "Please try again later. If this keeps happening, refresh the page.",
        });
      }
      setActionError(null);
      setShowAnalysisDialog(false);
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
      to: "/learn/$videoId",
      params: { videoId: video.id },
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setActionError(null);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
        queryClient.invalidateQueries({ queryKey: USER_QUOTA_QUERY_KEY }),
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
    setShowAnalysisDialog(true);
  };

  const handleConfirmAnalysis = () => {
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

      <AlertDialog open={showAnalysisDialog} onOpenChange={setShowAnalysisDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Analysis</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 pt-2">
                <p>
                  You have selected <strong>{selectedCount}</strong> video{selectedCount !== 1 ? "s" : ""} for analysis.
                </p>
                {quotaQuery.data && (
                  <div className="space-y-1">
                    <p>
                      This will consume <strong>{selectedCount}</strong> analysis quota{selectedCount !== 1 ? "s" : ""}.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Current usage: {quotaQuery.data.analysis_count} / {quotaQuery.data.max_analyses}
                    </p>
                    {quotaQuery.data.analysis_count + selectedCount > quotaQuery.data.max_analyses && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Warning: This may exceed your quota limit
                      </p>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={triggerAnalysisMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAnalysis}
              disabled={triggerAnalysisMutation.isPending}
            >
              {triggerAnalysisMutation.isPending ? "Analyzing..." : "Confirm Analysis"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                No videos yet. Add videos to the "YouChannel AI" playlist on YouTube, then come back here. Syncing may take a moment.
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
                    {quotaQuery.data && (
                      <QuotaBadge
                        used={quotaQuery.data.analysis_count}
                        max={quotaQuery.data.max_analyses}
                      />
                    )}
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
                  {videos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      isSelected={selectedVideoIds.includes(video.id)}
                      isSelectable={isVideoSelectable(video)}
                      onSelect={handleToggleVideo}
                      onOpen={handleOpenVideo}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
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



function QuotaBadge({ used, max }: { used: number; max: number }) {
  const percentage = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = used >= max;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
          <Progress
            value={percentage}
            className={`h-1.5 w-16 ${isAtLimit ? `*:data-[slot=progress-indicator]:bg-red-500` : isNearLimit ? `*:data-[slot=progress-indicator]:bg-amber-500` : ``}`}
          />
          <span className={`text-xs font-medium ${isAtLimit ? `text-red-500` : isNearLimit ? `text-amber-500` : `text-muted-foreground`}`}>
            {used}/{max}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isAtLimit
          ? "Quota limit reached"
          : `${max - used} analysis${max - used !== 1 ? `es` : ``} remaining`}
      </TooltipContent>
    </Tooltip>
  );
}
