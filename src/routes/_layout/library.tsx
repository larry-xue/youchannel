import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyVideoState } from "~/lib/components/empty-video-state";
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
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import { Progress } from "~/lib/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import { VideoCard } from "~/lib/components/video-card";
import {
  USER_QUOTA_QUERY_KEY,
  getYouTubeAccountStatusFn,
  getUserQuotaFn,
  getVideosFn,
  triggerOpenApiAnalysisFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import { toast } from "sonner";
import { z } from "zod";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/lib/components/ui/pagination";

const videosSearchSchema = z.object({
  page: z.number().default(1).catch(1),
});

export const Route = createFileRoute("/_layout/library")({
  validateSearch: (search) => videosSearchSchema.parse(search),
  component: DashboardPlaylists,
});

const EMPTY_VIDEOS: VideoWithStatus[] = [];

function DashboardPlaylists() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);

  const accountQuery = useQuery({
    queryKey: ["youtube-account-status"],
    queryFn: () => getYouTubeAccountStatusFn(),
  });
  const hasAccount = accountQuery.data?.hasAccount ?? false;

  const quotaQuery = useQuery({
    queryKey: USER_QUOTA_QUERY_KEY,
    queryFn: () => getUserQuotaFn(),
    enabled: hasAccount,
  });

  const { page } = Route.useSearch();
  const pageSize = 12;

  const videosQuery = useQuery({
    queryKey: ["videos", page],
    queryFn: () => getVideosFn({ data: { page, pageSize } }),
    enabled: hasAccount,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const videos = videosQuery.data?.videos ?? EMPTY_VIDEOS;
  const total = videosQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const isVideoSelectable = (video: VideoWithStatus) => {
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

  const isLoading = videosQuery.isLoading;

  const triggerAnalysisMutation = useMutation({
    mutationFn: (payload: { videoIds: string[] }) =>
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

  const handleOpenVideo = (video: VideoWithStatus) => {
    navigate({
      to: "/learn/$videoId",
      params: { videoId: video.id },
    });
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
    if (selectedCount === 0) return;
    setShowAnalysisDialog(true);
  };

  const handleConfirmAnalysis = () => {
    if (selectedCount === 0) return;
    triggerAnalysisMutation.mutate({
      videoIds: selectedVideoIds,
    });
  };

  return (
    <div className="space-y-6">
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
        ) : videos.length === 0 ? (
          <EmptyVideoState />
        ) : (
          <div className={videosQuery.isPlaceholderData ? "opacity-50 transition-opacity duration-200" : "transition-opacity duration-200"}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 mb-4">
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
          </div>
        )
        }

        {totalPages > 1 && (
          <Pagination className="mt-8">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href={
                    page > 1
                      ? router.buildLocation({ to: "/library", search: { page: page - 1 } }).href
                      : undefined
                  }
                  className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  onClick={(e) => {
                    if (page <= 1) e.preventDefault();
                    else {
                      e.preventDefault();
                      navigate({ search: { page: page - 1 } });
                    }
                  }}
                />
              </PaginationItem>

              {/* Simple pagination logic: show current, prev, next, first, last */}
              {totalPages <= 7 ? (
                Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={page === p}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate({ search: { page: p } });
                      }}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))
              ) : (
                <>
                  {/* First and optionally second page */}
                  <PaginationItem key="page-1">
                    <PaginationLink
                      isActive={page === 1}
                      onClick={(e) => { e.preventDefault(); navigate({ search: { page: 1 } }); }}
                      className="cursor-pointer"
                    >
                      1
                    </PaginationLink>
                  </PaginationItem>

                  {page > 3 && (
                    <PaginationItem key="ellipsis-start">
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  {page > 2 && page < totalPages - 1 && (
                    <PaginationItem key={`page-${page}`}>
                      <PaginationLink
                        isActive={true}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  )}

                  {page < totalPages - 2 && (
                    <PaginationItem key="ellipsis-end">
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  <PaginationItem key={`page-${totalPages}`}>
                    <PaginationLink
                      isActive={page === totalPages}
                      onClick={(e) => { e.preventDefault(); navigate({ search: { page: totalPages } }); }}
                      className="cursor-pointer"
                    >
                      {totalPages}
                    </PaginationLink>
                  </PaginationItem>
                </>
              )}

              <PaginationItem>
                <PaginationNext
                  href={
                    page < totalPages
                      ? router.buildLocation({ to: "/library", search: { page: page + 1 } }).href
                      : undefined
                  }
                  className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  onClick={(e) => {
                    if (page >= totalPages) e.preventDefault();
                    else {
                      e.preventDefault();
                      navigate({ search: { page: page + 1 } });
                    }
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
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
