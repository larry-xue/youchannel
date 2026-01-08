import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { VideoCard } from "~/lib/components/video-card";
import {
  getYouTubeAccountStatusFn,
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
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);

  const accountQuery = useQuery({
    queryKey: ["youtube-account-status"],
    queryFn: () => getYouTubeAccountStatusFn(),
  });
  const hasAccount = accountQuery.data?.hasAccount ?? false;

  const { page } = Route.useSearch();
  const pageSize = 12;

  const videosQuery = useQuery({
    queryKey: ["videos", page, pageSize],
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
  const validSelectedVideoIds = useMemo(() => {
    const eligible = new Set(eligibleVideoIds);
    return selectedVideoIds.filter((id) => eligible.has(id));
  }, [selectedVideoIds, eligibleVideoIds]);
  const selectedCount = validSelectedVideoIds.length;
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
      void videosQuery.refetch();
    },
    onError: () => {
      toast.error("We could not start", {
        description: "Please try again later. If this keeps happening, refresh the page.",
      });
      setShowAnalysisDialog(false);
    },
  });

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
      videoIds: validSelectedVideoIds,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Library
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage and analyze your saved videos from YouTube playlists.
        </p>
      </div>

      <AlertDialog open={showAnalysisDialog} onOpenChange={setShowAnalysisDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Analysis</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 pt-2">
                <p>
                  You have selected <strong>{selectedCount}</strong> video{selectedCount !== 1 ? "s" : ""} for analysis.
                </p>
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
                  isSelected={validSelectedVideoIds.includes(video.id)}
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
