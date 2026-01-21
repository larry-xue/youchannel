import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { toast } from "sonner";
import { ConnectYouTubeAlert } from "~/lib/components/connect-youtube-alert";
import { Button } from "~/lib/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/lib/components/ui/dialog";
import { Loading } from "~/lib/components/ui/loading";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { VideoCard } from "~/lib/components/video-card";
import {
  getLibraryVideoIdsFn,
  getYouTubeAccountStatusFn,
  getYouTubePlaylistItemsFn,
  getYouTubePlaylistsFn,
  triggerOpenApiAnalysisFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import { formatDate, truncate } from "~/lib/dashboard/utils";
import { cn, formatSeconds, parseDurationSeconds } from "~/lib/utils";
import * as m from "~/paraglide/messages";

interface PlaylistsSearch {
  code?: string;
  state?: string;
  error?: string;
}

export const Route = createFileRoute("/_layout/playlists")({
  validateSearch: (search?: Record<string, unknown>): PlaylistsSearch => {
    const safeSearch = search ?? {};
    return {
      code: safeSearch.code as string | undefined,
      state: safeSearch.state as string | undefined,
      error: safeSearch.error as string | undefined,
    };
  },
  loaderDeps: ({ search }) => ({
    code: search.code,
    state: search.state,
    error: search.error,
  }),
  component: DashboardPlaylists,
});

const PAGE_SIZE = 30;
const PLAYLISTS_QUERY_KEY = ["youtube-playlists"] as const;
const PLAYLIST_ITEMS_QUERY_KEY = ["youtube-playlist-items"] as const;
const STACK_VISIBLE_RANGE = 4;
const EMPTY_VIDEOS: PlaylistVideo[] = [];
const QUOTA_COLORS = [
  {
    fill: "rgba(134, 167, 200, 0.35)",
    fillActive: "rgba(134, 167, 200, 0.9)",
    border: "rgba(134, 167, 200, 0.65)",
    glow: "rgba(134, 167, 200, 0.35)",
    glowActive: "rgba(134, 167, 200, 0.55)",
  },
  {
    fill: "rgba(238, 165, 145, 0.35)",
    fillActive: "rgba(238, 165, 145, 0.9)",
    border: "rgba(238, 165, 145, 0.65)",
    glow: "rgba(238, 165, 145, 0.35)",
    glowActive: "rgba(238, 165, 145, 0.55)",
  },
  {
    fill: "rgba(90, 124, 166, 0.35)",
    fillActive: "rgba(90, 124, 166, 0.9)",
    border: "rgba(90, 124, 166, 0.65)",
    glow: "rgba(90, 124, 166, 0.35)",
    glowActive: "rgba(90, 124, 166, 0.55)",
  },
  {
    fill: "rgba(70, 100, 148, 0.35)",
    fillActive: "rgba(70, 100, 148, 0.9)",
    border: "rgba(70, 100, 148, 0.65)",
    glow: "rgba(70, 100, 148, 0.35)",
    glowActive: "rgba(70, 100, 148, 0.55)",
  },
  {
    fill: "rgba(51, 76, 130, 0.35)",
    fillActive: "rgba(51, 76, 130, 0.9)",
    border: "rgba(51, 76, 130, 0.65)",
    glow: "rgba(51, 76, 130, 0.35)",
    glowActive: "rgba(51, 76, 130, 0.55)",
  },
] as const;

type PlaylistVideo = VideoWithStatus & {
  isSelectable: boolean;
  selectionHint?: string;
  selectionLabel?: string;
};

type SelectedVideo = Pick<
  VideoWithStatus,
  | "id"
  | "title"
  | "description"
  | "thumbnail_url"
  | "duration"
  | "playlist_id"
  | "published_at"
> & {
  source_playlist_title?: string | null;
};

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
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [pageTokens, setPageTokens] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedVideos, setSelectedVideos] = useState<SelectedVideo[]>([]);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const wheelAccumulatorRef = useRef(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const search = Route.useSearch();
  const { quota } = Route.useRouteContext();

  const accountQuery = useQuery({
    queryKey: ["youtube-account-status"],
    queryFn: () => getYouTubeAccountStatusFn(),
  });
  const hasAccount = accountQuery.data?.hasAccount ?? false;

  const libraryQuery = useQuery({
    queryKey: ["library-video-ids"],
    queryFn: () => getLibraryVideoIdsFn(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: hasAccount,
  });
  const libraryVideoIds = useMemo(
    () => new Set(libraryQuery.data ?? []),
    [libraryQuery.data],
  );

  const playlistsQuery = useQuery({
    queryKey: PLAYLISTS_QUERY_KEY,
    queryFn: () => getYouTubePlaylistsFn(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: hasAccount,
  });

  const playlists = playlistsQuery.data || [];
  const activePlaylist =
    playlists.find((playlist) => playlist.playlistId === activePlaylistId) || null;

  useEffect(() => {
    if (playlists.length === 0) {
      setActivePlaylistId(null);
      return;
    }
    if (
      !activePlaylistId ||
      !playlists.some((playlist) => playlist.playlistId === activePlaylistId)
    ) {
      setActivePlaylistId(playlists[0].playlistId);
    }
  }, [activePlaylistId, playlists]);

  const itemsQuery = useInfiniteQuery({
    queryKey: [...PLAYLIST_ITEMS_QUERY_KEY, activePlaylistId],
    queryFn: ({ pageParam }) =>
      getYouTubePlaylistItemsFn({
        data: {
          playlistId: activePlaylistId || "",
          pageToken: pageParam as string | undefined,
          pageSize: PAGE_SIZE,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined,
    enabled: Boolean(activePlaylistId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const playlistItems = itemsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const videos = useMemo(() => {
    if (!activePlaylistId) return EMPTY_VIDEOS;
    const fallbackTimestamp = new Date().toISOString();
    const mappedVideos = playlistItems.map((item) => {
      const durationSeconds = parseDurationSeconds(item.duration);
      const rawStatus = (item.raw as { status?: { privacyStatus?: string } } | undefined)
        ?.status;
      const privacyStatus =
        typeof rawStatus?.privacyStatus === "string" ? rawStatus.privacyStatus : null;
      const isPrivate =
        privacyStatus === "private" ||
        (item.title || "").trim().toLowerCase() === "private video";
      const maxDuration = quota.perVideoLimitSeconds;
      const isTooLong =
        maxDuration !== null &&
        typeof durationSeconds === "number" &&
        durationSeconds > maxDuration;
      const isAlreadyInLibrary = libraryVideoIds.has(item.videoId);
      let selectionHint: string | undefined;
      let selectionLabel: string | undefined;
      if (isAlreadyInLibrary) {
        selectionHint = m.playlist_hint_added();
        selectionLabel = m.playlist_label_added();
      } else if (isPrivate) {
        selectionHint = m.playlist_hint_private();
        selectionLabel = m.playlist_label_private();
      } else if (isTooLong) {
        selectionHint = m.playlist_hint_too_long();
        selectionLabel = m.playlist_label_too_long();
      }
      const isSelectable = !selectionHint;

      return {
        id: item.videoId,
        playlist_id: activePlaylistId,
        youtube_video_id: item.videoId,
        title: item.title,
        description: item.description,
        published_at: item.publishedAt,
        thumbnail_url: item.thumbnailUrl,
        duration: item.duration,
        created_at: item.publishedAt || fallbackTimestamp,
        updated_at: fallbackTimestamp,
        isSelectable,
        selectionHint,
        selectionLabel,
      };
    });
    // Sort by publishedAt descending (newest first)
    return mappedVideos.sort((a, b) => {
      const dateA = new Date(a.published_at || 0).getTime();
      const dateB = new Date(b.published_at || 0).getTime();
      return dateB - dateA;
    });
  }, [activePlaylistId, playlistItems, libraryVideoIds]);

  const totalResults = itemsQuery.data?.pages[0]?.pageInfo?.totalResults ?? null;
  const totalPages = totalResults ? Math.ceil(totalResults / PAGE_SIZE) : null;
  const pageLabel = totalPages
    ? m.playlist_page_info({ current: pageIndex + 1, total: totalPages })
    : m.playlist_page_current({ current: pageIndex + 1 });
  const videoById = useMemo(
    () => new Map(videos.map((video) => [video.id, video])),
    [videos],
  );
  const selectedVideoIdSet = useMemo(
    () => new Set(selectedVideos.map((video) => video.id)),
    [selectedVideos],
  );
  const selectedCount = selectedVideos.length;
  const selectedPlaylistCount = useMemo(() => {
    const playlistIds = selectedVideos.map((video) => video.playlist_id);
    return new Set(playlistIds).size;
  }, [selectedVideos]);
  const selectionPreview = selectedVideos.slice(0, 4);
  const selectionLabel = selectedCount === 1 ? m.label_video() : m.label_videos();
  const playlistLabel =
    selectedPlaylistCount === 1 ? m.label_playlist() : m.label_playlists();
  const activeSelectedVideo = selectedVideos[carouselIndex] ?? null;
  const activeDurationLabel = formatVideoDuration(activeSelectedVideo?.duration ?? null);
  const selectionQuota = useMemo(() => {
    let totalSeconds = 0;
    let unknownCount = 0;
    const perVideoSeconds = new Map<string, number | null>();
    for (const video of selectedVideos) {
      const seconds = parseDurationSeconds(video.duration);
      if (typeof seconds === "number") {
        totalSeconds += seconds;
        perVideoSeconds.set(video.id, seconds);
      } else {
        unknownCount += 1;
        perVideoSeconds.set(video.id, null);
      }
    }
    return { totalSeconds, unknownCount, perVideoSeconds };
  }, [selectedVideos]);
  const totalQuotaLabel =
    selectedCount === 0
      ? m.quota_zero_seconds()
      : selectionQuota.unknownCount > 0
        ? m.quota_with_unknown({
            time: formatSeconds(selectionQuota.totalSeconds),
            count: selectionQuota.unknownCount,
          })
        : formatSeconds(selectionQuota.totalSeconds);
  const activeQuotaLabel = activeSelectedVideo
    ? formatSeconds(selectionQuota.perVideoSeconds.get(activeSelectedVideo.id) ?? null)
    : m.quota_unknown();
  const progressMinWidth = Math.max(120, selectedCount * 14);
  const quotaSegments = useMemo(() => {
    if (selectedVideos.length === 0) return [];
    const secondsList = selectedVideos.map(
      (video) => selectionQuota.perVideoSeconds.get(video.id) ?? null,
    );
    const knownSeconds = secondsList.filter(
      (value): value is number => typeof value === "number",
    );
    const averageKnown =
      knownSeconds.length > 0
        ? Math.round(
            knownSeconds.reduce((sum, value) => sum + value, 0) / knownSeconds.length,
          )
        : 1;
    const fallbackSeconds = Math.max(averageKnown, 1);
    const weights = secondsList.map((seconds) =>
      typeof seconds === "number" ? seconds : fallbackSeconds,
    );
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    return selectedVideos.map((video, index) => {
      const seconds = secondsList[index];
      const weight = weights[index];
      const percent = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
      const color = QUOTA_COLORS[index % QUOTA_COLORS.length];
      return {
        id: video.id,
        percent,
        seconds,
        title: m.review_stack_title({
          title: truncate(video.title || m.default_video_title(), 36),
          time: formatSeconds(seconds),
        }),
        color,
      };
    });
  }, [selectedVideos, selectionQuota]);

  useEffect(() => {
    if (selectedVideos.length === 0) {
      setCarouselIndex(0);
      return;
    }
    setCarouselIndex((prev) => Math.min(prev, selectedVideos.length - 1));
  }, [selectedVideos.length]);

  const submitSelectionMutation = useMutation({
    mutationFn: (payload: { videos: any[] }) =>
      triggerOpenApiAnalysisFn({ data: payload }),
    onSuccess: (result) => {
      const skippedReasons: string[] = [];
      if ((result.skipReasons.analysis_exists ?? 0) > 0) {
        skippedReasons.push(
          m.skip_reason_progress_count({
            count: result.skipReasons.analysis_exists ?? 0,
          }),
        );
      }
      if ((result.skipReasons.duration_exceeded ?? 0) > 0) {
        skippedReasons.push(
          m.skip_reason_too_long_count({
            count: result.skipReasons.duration_exceeded ?? 0,
          }),
        );
      }
      if ((result.skipReasons.quota_exceeded ?? 0) > 0) {
        skippedReasons.push(
          m.skip_reason_quota_count({ count: result.skipReasons.quota_exceeded ?? 0 }),
        );
      }
      const skippedText =
        result.skipped > 0
          ? m.toast_skipped_message({
              count: result.skipped,
              reasons: skippedReasons.length > 0 ? ` (${skippedReasons.join(", ")})` : "",
            })
          : "";

      if (result.enqueued > 0) {
        toast.success(
          m.toast_success_desc({
            count: result.enqueued,
            label: result.enqueued === 1 ? m.label_video() : m.label_videos(),
          }) + skippedText,
        );
      } else {
        toast.info(m.toast_info_desc());
      }

      setSelectedVideos([]);
      setShowReviewDialog(false);
    },
    onError: (err) => {
      toast.error(err.message || m.toast_error_desc());
    },
  });

  const handleSelectPlaylist = (playlistId: string) => {
    if (playlistId === activePlaylistId) return;
    setActivePlaylistId(playlistId);
  };

  const handleToggleVideo = (videoId: string) => {
    setSelectedVideos((prev) => {
      const existingIndex = prev.findIndex((video) => video.id === videoId);
      if (existingIndex !== -1) {
        return prev.filter((video) => video.id !== videoId);
      }
      const nextVideo = videoById.get(videoId);
      if (!nextVideo || !nextVideo.isSelectable) return prev;
      return [
        ...prev,
        {
          id: nextVideo.id,
          title: nextVideo.title,
          description: nextVideo.description,
          thumbnail_url: nextVideo.thumbnail_url,
          duration: nextVideo.duration,
          playlist_id: nextVideo.playlist_id,
          published_at: nextVideo.published_at,
          source_playlist_title: activePlaylist?.title ?? null,
        },
      ];
    });
  };

  const handleClearSelection = () => {
    setSelectedVideos([]);
    setShowReviewDialog(false);
    setCarouselIndex(0);
  };

  const handleOpenReviewDialog = () => {
    if (selectedVideos.length === 0) return;
    setCarouselIndex(Math.max(0, selectedVideos.length - 1));
    setShowReviewDialog(true);
  };

  const handleRemoveSelected = (videoId?: string) => {
    if (!videoId) return;
    setSelectedVideos((prev) => prev.filter((video) => video.id !== videoId));
  };

  const handleStackWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (selectedVideos.length <= 1) return;
    wheelAccumulatorRef.current += event.deltaY;
    if (Math.abs(wheelAccumulatorRef.current) < 40) return;
    const direction = wheelAccumulatorRef.current > 0 ? 1 : -1;
    wheelAccumulatorRef.current = 0;
    setCarouselIndex(
      (prev) => (prev + direction + selectedVideos.length) % selectedVideos.length,
    );
  };

  const handleSubmitSelection = () => {
    if (selectedVideos.length === 0) return;
    submitSelectionMutation.mutate({
      videos: selectedVideos.map((video) => ({
        youtubeVideoId: video.id,
        title: video.title || m.untitled_video(),
        description: video.description || "",
        thumbnailUrl: video.thumbnail_url || "",
        publishedAt: video.published_at || new Date().toISOString(),
        duration: video.duration || "PT0S",
        url: `https://www.youtube.com/watch?v=${video.id}`,
        raw: null,
      })),
    });
  };

  const handleOpenVideo = (video: VideoWithStatus) => {
    if (!video.youtube_video_id) return;
    window.open(
      `https://www.youtube.com/watch?v=${video.youtube_video_id}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handlePrevPage = () => {
    setPageIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    const pages = itemsQuery.data?.pages;
    const nextToken = pages?.[pages.length - 1]?.nextPageToken;
    if (!nextToken) return;
    setPageTokens((prev) => {
      const next = [...prev];
      if (pageIndex === prev.length - 1) {
        next.push(nextToken);
      } else {
        next[pageIndex + 1] = nextToken;
        next.splice(pageIndex + 2);
      }
      return next;
    });
    setPageIndex((prev) => prev + 1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setActionError(null);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PLAYLIST_ITEMS_QUERY_KEY }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : m.playlists_error_action());
    } finally {
      setIsRefreshing(false);
    }
  };

  const canPrev = pageIndex > 0;
  const lastPage = itemsQuery.data?.pages[itemsQuery.data.pages.length - 1];
  const canNext = Boolean(lastPage?.nextPageToken);
  const isLoadingPlaylists = playlistsQuery.isLoading;
  const isLoadingItems = itemsQuery.isLoading;
  const getStackStyle = (offset: number) => {
    const absOffset = Math.abs(offset);
    const scale = Math.max(0.72, 1 - absOffset * 0.08);
    const opacity = Math.max(0.2, 1 - absOffset * 0.18);
    return {
      transform: `translate(-50%, -50%) translateX(calc(${offset} * var(--stack-shift))) translateY(calc(${absOffset} * var(--stack-drop))) scale(${scale}) rotate(${offset * 2}deg)`,
      zIndex: 50 - absOffset,
      opacity,
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="type-h1 text-foreground">{m.playlists_title()}</h1>
          <p className="type-body text-muted-foreground">{m.playlists_description()}</p>
        </div>
        {hasAccount && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-full text-muted-foreground hover:bg-muted"
          >
            <RefreshCcw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        )}
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl p-0 gap-0 border-none bg-card shadow-md">
          <DialogHeader className="px-6 py-4 border-b border-border bg-card">
            <DialogTitle className="text-xl font-display">
              {m.review_selection_title()}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedCount === 0 ? (
                m.review_selection_empty()
              ) : (
                <>
                  <span className="block font-medium text-foreground">
                    {m.review_selection_count({
                      count: selectedCount,
                      label: selectionLabel,
                      playlistCount: selectedPlaylistCount,
                      playlistLabel: playlistLabel,
                    })}
                  </span>
                  <span className="block text-xs text-muted-foreground/80">
                    {m.review_selection_quota({ quota: totalQuotaLabel })}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-6 bg-card">
            {selectedCount === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-outline-variant/40 bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
                {m.review_selection_no_videos()}
              </div>
            ) : (
              <div className="space-y-6">
                <div
                  className="relative flex h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-muted p-4 [--stack-shift:70px] [--stack-drop:8px] sm:h-[320px] sm:[--stack-shift:100px] sm:[--stack-drop:10px]"
                  onWheel={handleStackWheel}
                >
                  {selectedVideos.map((video, index) => {
                    const offset = index - carouselIndex;
                    const absOffset = Math.abs(offset);
                    if (absOffset > STACK_VISIBLE_RANGE) return null;
                    const isActive = offset === 0;
                    const durationLabel = formatVideoDuration(video.duration);
                    const accent = QUOTA_COLORS[index % QUOTA_COLORS.length];
                    const cardShadow = isActive
                      ? `0 0 0 1px ${accent.border}, 0 12px 30px ${accent.glowActive}`
                      : `0 0 0 1px ${accent.border}, 0 8px 22px ${accent.glow}`;
                    return (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => setCarouselIndex(index)}
                        aria-current={isActive}
                        className={cn(
                          "absolute left-1/2 top-1/2 w-[220px] transition-[transform,opacity,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[260px]",
                          isActive ? "cursor-default" : "cursor-pointer",
                        )}
                        style={getStackStyle(offset)}
                      >
                        <div
                          className={cn(
                            "overflow-hidden rounded-2xl border-none bg-background shadow-md transition-shadow",
                          )}
                          style={{ boxShadow: cardShadow }}
                        >
                          <div className="relative w-full overflow-hidden bg-card pb-[56.25%]">
                            {video.thumbnail_url ? (
                              <img
                                src={video.thumbnail_url}
                                alt={video.title || "Video thumbnail"}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                                {m.video_no_thumbnail()}
                              </div>
                            )}
                            {durationLabel && (
                              <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                                {durationLabel}
                              </div>
                            )}
                          </div>
                          <div className="space-y-1 px-4 py-3 text-left">
                            <p className="text-sm font-semibold text-foreground font-display leading-tight">
                              {truncate(video.title || "Video", 40)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {video.source_playlist_title || m.review_source_selected()}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-muted/30 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {activeSelectedVideo?.title || m.default_video_title()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeSelectedVideo?.source_playlist_title
                        ? m.review_source_from({
                            source: activeSelectedVideo.source_playlist_title,
                          })
                        : m.review_source_selected()}
                      {activeSelectedVideo?.published_at
                        ? ` â€?${formatDate(activeSelectedVideo.published_at)}`
                        : ""}
                      {activeDurationLabel ? ` â€?${activeDurationLabel}` : ""}
                      {activeSelectedVideo ? (
                        <span className="ml-1 inline-block rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                          {m.review_quota_label({ quota: activeQuotaLabel })}
                        </span>
                      ) : (
                        ""
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-medium bg-card px-2 py-1 rounded-full">
                      {carouselIndex + 1} / {selectedCount}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveSelected(activeSelectedVideo?.id)}
                      disabled={!activeSelectedVideo}
                      className="rounded-full h-8 px-3 text-error hover:bg-error/10 hover:text-error"
                    >
                      {m.review_remove()}
                    </Button>
                  </div>
                </div>
                <div className="rounded-2xl bg-muted/30 px-5 py-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>{m.review_quota_split()}</span>
                    <span>
                      {m.review_total_quota()}
                      <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        {totalQuotaLabel}
                      </span>
                    </span>
                  </div>
                  <div className="mt-3 w-full overflow-x-auto pb-1">
                    <div
                      className="flex h-4 items-stretch overflow-hidden rounded-full ring-1 ring-inset ring-black/5"
                      style={{ minWidth: `${progressMinWidth}px` }}
                    >
                      {quotaSegments.map((segment, index) => {
                        const isActive = segment.id === activeSelectedVideo?.id;
                        const segmentFill = isActive
                          ? segment.color.fillActive
                          : segment.color.fill;
                        return (
                          <button
                            key={segment.id}
                            type="button"
                            title={segment.title}
                            aria-label={`Select ${segment.title}`}
                            onClick={() => setCarouselIndex(index)}
                            className={cn(
                              "h-full transition-[width,background-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              isActive ? "opacity-100" : "opacity-80 hover:opacity-100",
                            )}
                            style={{
                              width: `${segment.percent}%`,
                              backgroundColor: segmentFill,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground/70 text-center">
                    {m.review_click_segment_hint()}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border bg-muted/30 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
              className="rounded-lg"
            >
              {m.review_selection_cancel()}
            </Button>
            <Button
              type="button"
              onClick={handleSubmitSelection}
              disabled={selectedCount === 0 || submitSelectionMutation.isPending}
              className="rounded-lg"
            >
              {submitSelectionMutation.isPending
                ? m.review_selection_submitting()
                : m.review_selection_submit()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {accountQuery.isLoading ? (
        <Loading text={m.loading_checking_account()} size="md" />
      ) : !hasAccount || search.code ? (
        <ConnectYouTubeAlert
          code={search.code}
          state={search.state}
          error={search.error}
        />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-80 lg:shrink-0">
            <div className="flex max-h-[70vh] flex-col rounded-2xl bg-muted/30 border border-border/50 lg:sticky lg:top-24 lg:max-h-[calc(100vh-9rem)] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <h2 className="text-sm font-semibold text-foreground">
                  {m.playlists_your_playlists()}
                </h2>
                <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary">
                  {playlists.length}
                </span>
              </div>
              <ScrollArea className="flex-1 px-4 pb-4 overflow-y-auto">
                {isLoadingPlaylists ? (
                  <Loading size="sm" text={m.playlists_loading()} />
                ) : playlistsQuery.isError ? (
                  <p className="px-2 text-sm text-destructive">
                    {m.playlists_error_load()}
                  </p>
                ) : playlists.length === 0 ? (
                  <p className="px-2 text-sm text-muted-foreground">
                    {m.playlists_empty()}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {playlists.map((playlist) => {
                      const isActive = playlist.playlistId === activePlaylistId;
                      return (
                        <button
                          key={playlist.playlistId}
                          type="button"
                          onClick={() => handleSelectPlaylist(playlist.playlistId)}
                          className={cn(
                            "group flex w-full items-center gap-4 rounded-full px-4 py-3 text-left transition-[background-color,transform] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive
                              ? "bg-secondary text-secondary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform group-hover:scale-105",
                              isActive ? "bg-primary/10" : "bg-secondary",
                            )}
                          >
                            {playlist.thumbnailUrl ? (
                              <img
                                src={playlist.thumbnailUrl}
                                alt={playlist.title || m.aria_playlist_thumbnail()}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-xs font-semibold">PL</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-sm font-medium",
                                isActive ? "font-semibold" : "",
                              )}
                            >
                              {playlist.title || m.playlist_untitled()}
                            </p>
                            <p className="truncate text-xs opacity-70">
                              {playlist.description || m.playlist_no_description()}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-6">
            {isLoadingPlaylists ? (
              <div className="flex h-40 items-center justify-center rounded-2xl bg-muted/30">
                <Loading text={m.playlist_loading_single()} size="sm" />
              </div>
            ) : activePlaylist ? (
              <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-muted/30 p-6 transition-[background-color,border-color] border border-border/50">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate type-h2 text-foreground">
                    {activePlaylist.title || m.playlist_untitled()}
                  </h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {activePlaylist.description || m.playlist_no_description()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                  <span className="rounded-full bg-muted px-3 py-1">{pageLabel}</span>
                  {typeof totalResults === "number" && (
                    <span className="rounded-full bg-muted px-3 py-1">
                      {m.playlist_count_videos({ count: totalResults })}
                    </span>
                  )}
                  <div className="flex items-center gap-2 pl-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={!canPrev || isLoadingItems}
                      className="rounded-full w-9 h-9 p-0"
                    >
                      <span className="sr-only">{m.button_prev()}</span>â†?                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!canNext || isLoadingItems}
                      className="rounded-full w-9 h-9 p-0"
                    >
                      <span className="sr-only">{m.button_next()}</span>â†?                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-outline-variant/40 px-6 py-12 text-center text-sm text-muted-foreground/60">
                {m.playlist_select_hint()}
              </div>
            )}

            {activePlaylist && (
              <>
                {selectedCount > 0 && (
                  <div className="sticky top-6 z-20 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-secondary px-5 py-3 ring-1 ring-border/60">
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-3">
                        {selectionPreview.map((video) => (
                          <div
                            key={video.id}
                            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-secondary-container bg-card shadow-sm"
                          >
                            {video.thumbnail_url ? (
                              <img
                                src={video.thumbnail_url}
                                alt={video.title || m.aria_video_thumbnail()}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {m.playlist_video_placeholder()}
                              </span>
                            )}
                          </div>
                        ))}
                        {selectedCount > selectionPreview.length && (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-xs font-semibold text-foreground">
                            +{selectedCount - selectionPreview.length}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <p className="text-sm font-bold text-secondary-foreground">
                          {selectedCount} {selectionLabel}
                        </p>
                        <p className="text-[10px] font-medium opacity-80 text-secondary-foreground">
                          {selectedPlaylistCount} {playlistLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearSelection}
                        disabled={submitSelectionMutation.isPending}
                        className="rounded-lg text-foreground hover:bg-muted/70"
                      >
                        {m.action_clear()}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleOpenReviewDialog}
                        disabled={submitSelectionMutation.isPending}
                        className="rounded-lg"
                      >
                        {m.action_review_submit()}
                      </Button>
                    </div>
                  </div>
                )}
                {isLoadingItems ? (
                  <Loading text={m.library_loading()} size="md" />
                ) : itemsQuery.isError ? (
                  <div className="rounded-2xl bg-destructive/10 px-6 py-4 text-sm text-destructive">
                    {m.playlist_items_error()}
                  </div>
                ) : videos.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2">
                    {m.playlist_items_empty()}
                  </p>
                ) : (
                  <div className="grid w-full justify-start gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] pb-10">
                    {videos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video as VideoWithStatus}
                        isSelected={selectedVideoIdSet.has(video.id)}
                        isSelectable={video.isSelectable}
                        selectionHint={video.selectionHint}
                        selectionLabel={video.selectionLabel}
                        onSelect={handleToggleVideo}
                        onOpen={handleOpenVideo}
                        actionLabel={m.video_card_action_open()}
                        hideFooter={true}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
