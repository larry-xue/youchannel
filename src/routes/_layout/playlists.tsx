import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { toast } from "sonner";
import { ConnectYouTubeAlert } from "~/lib/components/connect-youtube-alert";
import { Button } from "~/lib/components/ui/button";
import * as m from "~/paraglide/messages";
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
  getYouTubeAccountStatusFn,
  getYouTubePlaylistItemsFn,
  getYouTubePlaylistsFn,
  triggerOpenApiAnalysisFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import { formatDate, truncate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";

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

const PAGE_SIZE = 50;
const PLAYLISTS_QUERY_KEY = ["youtube-playlists"] as const;
const PLAYLIST_ITEMS_QUERY_KEY = ["youtube-playlist-items"] as const;
const MAX_VIDEO_DURATION_SEC = 2 * 60 * 60;
const STACK_VISIBLE_RANGE = 4;
const EMPTY_VIDEOS: PlaylistVideo[] = [];
const QUOTA_COLORS = [
  {
    fill: "rgba(59, 130, 246, 0.35)",
    fillActive: "rgba(59, 130, 246, 0.9)",
    border: "rgba(59, 130, 246, 0.65)",
    glow: "rgba(59, 130, 246, 0.35)",
    glowActive: "rgba(59, 130, 246, 0.55)",
  },
  {
    fill: "rgba(16, 185, 129, 0.35)",
    fillActive: "rgba(16, 185, 129, 0.9)",
    border: "rgba(16, 185, 129, 0.65)",
    glow: "rgba(16, 185, 129, 0.35)",
    glowActive: "rgba(16, 185, 129, 0.55)",
  },
  {
    fill: "rgba(245, 158, 11, 0.35)",
    fillActive: "rgba(245, 158, 11, 0.9)",
    border: "rgba(245, 158, 11, 0.65)",
    glow: "rgba(245, 158, 11, 0.35)",
    glowActive: "rgba(245, 158, 11, 0.55)",
  },
  {
    fill: "rgba(244, 63, 94, 0.35)",
    fillActive: "rgba(244, 63, 94, 0.9)",
    border: "rgba(244, 63, 94, 0.65)",
    glow: "rgba(244, 63, 94, 0.35)",
    glowActive: "rgba(244, 63, 94, 0.55)",
  },
  {
    fill: "rgba(14, 165, 233, 0.35)",
    fillActive: "rgba(14, 165, 233, 0.9)",
    border: "rgba(14, 165, 233, 0.65)",
    glow: "rgba(14, 165, 233, 0.35)",
    glowActive: "rgba(14, 165, 233, 0.55)",
  },
  {
    fill: "rgba(132, 204, 22, 0.35)",
    fillActive: "rgba(132, 204, 22, 0.9)",
    border: "rgba(132, 204, 22, 0.65)",
    glow: "rgba(132, 204, 22, 0.35)",
    glowActive: "rgba(132, 204, 22, 0.55)",
  },
] as const;

type PlaylistVideo = VideoWithStatus & {
  isSelectable: boolean;
  selectionHint?: string;
  selectionLabel?: string;
};

type SelectedVideo = Pick<
  VideoWithStatus,
  "id" | "title" | "description" | "thumbnail_url" | "duration" | "playlist_id" | "published_at"
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

function parseDurationSeconds(duration: string | null) {
  if (!duration) return null;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function formatSeconds(value: number | null) {
  if (value === null) return "Unknown";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
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

  const accountQuery = useQuery({
    queryKey: ["youtube-account-status"],
    queryFn: () => getYouTubeAccountStatusFn(),
  });
  const hasAccount = accountQuery.data?.hasAccount ?? false;

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

  useEffect(() => {
    setPageTokens([null]);
    setPageIndex(0);
  }, [activePlaylistId]);

  const currentPageToken = pageTokens[pageIndex] ?? null;
  const itemsQuery = useQuery({
    queryKey: [...PLAYLIST_ITEMS_QUERY_KEY, activePlaylistId, currentPageToken],
    queryFn: () =>
      getYouTubePlaylistItemsFn({
        data: {
          playlistId: activePlaylistId || "",
          pageToken: currentPageToken || undefined,
          pageSize: PAGE_SIZE,
        },
      }),
    enabled: Boolean(activePlaylistId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const playlistItems = itemsQuery.data?.items ?? [];
  const videos = useMemo(() => {
    if (!activePlaylistId) return EMPTY_VIDEOS;
    const fallbackTimestamp = new Date().toISOString();
    return playlistItems.map((item) => {
      const durationSeconds = parseDurationSeconds(item.duration);
      const rawStatus = (item.raw as { status?: { privacyStatus?: string } } | undefined)
        ?.status;
      const privacyStatus =
        typeof rawStatus?.privacyStatus === "string" ? rawStatus.privacyStatus : null;
      const isPrivate =
        privacyStatus === "private" ||
        (item.title || "").trim().toLowerCase() === "private video";
      const isTooLong =
        typeof durationSeconds === "number" && durationSeconds > MAX_VIDEO_DURATION_SEC;
      const selectionHint = isPrivate
        ? m.playlist_hint_private()
        : isTooLong
          ? m.playlist_hint_too_long()
          : undefined;
      const selectionLabel = selectionHint
        ? isPrivate
          ? m.playlist_label_private()
          : m.playlist_label_too_long()
        : undefined;
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
  }, [activePlaylistId, playlistItems]);

  const totalResults = itemsQuery.data?.pageInfo?.totalResults ?? null;
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
  const playlistLabel = selectedPlaylistCount === 1 ? m.label_playlist() : m.label_playlists();
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
        ? m.quota_with_unknown({ time: formatSeconds(selectionQuota.totalSeconds), count: selectionQuota.unknownCount })
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
        ? Math.round(knownSeconds.reduce((sum, value) => sum + value, 0) / knownSeconds.length)
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
        title: m.review_stack_title({ title: truncate(video.title || m.default_video_title(), 36), time: formatSeconds(seconds) }),
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
        skippedReasons.push(m.skip_reason_progress_count({ count: result.skipReasons.analysis_exists ?? 0 }));
      }
      if ((result.skipReasons.duration_exceeded ?? 0) > 0) {
        skippedReasons.push(m.skip_reason_too_long_count({ count: result.skipReasons.duration_exceeded ?? 0 }));
      }
      if ((result.skipReasons.quota_exceeded ?? 0) > 0) {
        skippedReasons.push(m.skip_reason_quota_count({ count: result.skipReasons.quota_exceeded ?? 0 }));
      }
      const skippedText =
        result.skipped > 0
          ? `, and ${result.skipped} couldn't be started${skippedReasons.length > 0
            ? ` (${skippedReasons.join(", ")})`
            : ""
          }`
          : "";

      if (result.enqueued > 0) {
        toast.success(m.toast_success_title(), {
          description: m.toast_success_desc({ count: result.enqueued, label: result.enqueued === 1 ? "video" : "videos" }),
        });
      } else {
        toast.info(m.toast_info_title(), {
          description: m.toast_info_desc(),
        });
      }

      setSelectedVideos([]);
      setShowReviewDialog(false);
    },
    onError: () => {
      toast.error(m.toast_error_title(), {
        description: m.toast_error_desc(),
      });
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
    const nextToken = itemsQuery.data?.nextPageToken;
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
  const canNext = Boolean(itemsQuery.data?.nextPageToken);
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
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {m.playlists_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.playlists_description()}
          </p>
        </div>
        {hasAccount && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? m.playlists_refreshing() : m.playlists_refresh()}
          </Button>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{m.review_selection_title()}</DialogTitle>
            <DialogDescription>
              {selectedCount === 0 ? (
                m.review_selection_empty()
              ) : (
                <>
                  <span className="block">
                    {m.review_selection_count({ count: selectedCount, label: selectionLabel, playlistCount: selectedPlaylistCount, playlistLabel: playlistLabel })}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {m.review_selection_quota({ quota: totalQuotaLabel })}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              {m.review_selection_no_videos()}
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="relative flex h-[260px] items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-4 [--stack-shift:70px] [--stack-drop:8px] sm:h-[300px] sm:[--stack-shift:100px] sm:[--stack-drop:10px]"
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
                        "absolute left-1/2 top-1/2 w-[220px] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-[260px]",
                        isActive ? "cursor-default" : "cursor-pointer",
                      )}
                      style={getStackStyle(offset)}
                    >
                      <div
                        className={cn(
                          "overflow-hidden rounded-2xl border bg-background/95 shadow-lg transition-shadow",
                        )}
                        style={{ borderColor: accent.border, boxShadow: cardShadow }}
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
                              {m.video_no_thumbnail()}
                            </div>
                          )}
                          {durationLabel && (
                            <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                              {durationLabel}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1 px-3 py-2 text-left">
                          <p className="text-sm font-semibold text-foreground">
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
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {activeSelectedVideo?.title || m.default_video_title()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeSelectedVideo?.source_playlist_title
                      ? m.review_source_from({ source: activeSelectedVideo.source_playlist_title })
                      : m.review_source_selected()}
                    {activeSelectedVideo?.published_at
                      ? ` - ${formatDate(activeSelectedVideo.published_at)}`
                      : ""}
                    {activeDurationLabel ? ` - ${activeDurationLabel}` : ""}
                    {activeSelectedVideo ? m.review_quota_label({ quota: activeQuotaLabel }) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{carouselIndex + 1} / {selectedCount}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSelected(activeSelectedVideo?.id)}
                    disabled={!activeSelectedVideo}
                  >
                    {m.review_remove()}
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>{m.review_quota_split()}</span>
                  <span>{m.review_total_quota()}<span className="font-semibold text-primary">{totalQuotaLabel}</span></span>
                </div>
                <div className="mt-2 w-full overflow-x-auto">
                  <div className="flex h-3 items-stretch" style={{ minWidth: `${progressMinWidth}px` }}>
                    {quotaSegments.map((segment, index) => {
                      const isActive = segment.id === activeSelectedVideo?.id;
                      const isFirst = index === 0;
                      const isLast = index === quotaSegments.length - 1;
                      const segmentFill = isActive ? segment.color.fillActive : segment.color.fill;
                      return (
                        <button
                          key={segment.id}
                          type="button"
                          title={segment.title}
                          aria-label={`Select ${segment.title}`}
                          onClick={() => setCarouselIndex(index)}
                          className={cn(
                            "h-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            isActive ? "opacity-100" : "opacity-70 hover:opacity-100",
                            isFirst ? "rounded-l-full" : "",
                            isLast ? "rounded-r-full" : "",
                          )}
                          style={{ width: `${segment.percent}%`, backgroundColor: segmentFill }}
                        />
                      );
                    })}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {m.review_click_segment_hint()}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
            >
              {m.review_selection_cancel()}
            </Button>
            <Button
              type="button"
              onClick={handleSubmitSelection}
              disabled={selectedCount === 0 || submitSelectionMutation.isPending}
            >
              {submitSelectionMutation.isPending ? m.review_selection_submitting() : m.review_selection_submit()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {accountQuery.isLoading ? (
        <Loading text={m.loading_checking_account()} size="md" />
      ) : (!hasAccount || search.code) ? (
        <ConnectYouTubeAlert
          code={search.code}
          state={search.state}
          error={search.error}
        />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-72 lg:shrink-0">
            <div className="flex max-h-[70vh] flex-col rounded-2xl border border-border/60 bg-background/70 lg:sticky lg:top-24 lg:max-h-[calc(100vh-9rem)]">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">{m.playlists_your_playlists()}</h2>
                <span className="text-xs text-muted-foreground">{playlists.length}</span>
              </div>
              <ScrollArea className="flex-1 px-3 pb-4 overflow-y-auto">
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
                  <div className="flex flex-col gap-2">
                    {playlists.map((playlist) => {
                      const isActive = playlist.playlistId === activePlaylistId;
                      return (
                        <button
                          key={playlist.playlistId}
                          type="button"
                          onClick={() => handleSelectPlaylist(playlist.playlistId)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                            isActive
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/60 bg-background/70 hover:bg-accent/40",
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/60">
                            {playlist.thumbnailUrl ? (
                              <img
                                src={playlist.thumbnailUrl}
                                alt={playlist.title || m.aria_playlist_thumbnail()}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-xs font-semibold text-muted-foreground">
                                PL
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {playlist.title || m.playlist_untitled()}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
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

          <div className="min-w-0 flex-1 space-y-4">
            {isLoadingPlaylists ? (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-border/60 bg-background/70">
                <Loading text={m.playlist_loading_single()} size="sm" />
              </div>
            ) : activePlaylist ? (
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-foreground">
                    {activePlaylist.title || m.playlist_untitled()}
                  </h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {activePlaylist.description || m.playlist_no_description()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{pageLabel}</span>
                  {typeof totalResults === "number" && (
                    <span>{m.playlist_count_videos({ count: totalResults })}</span>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={!canPrev || isLoadingItems}
                    >
                      {m.button_prev()}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!canNext || isLoadingItems}
                    >
                      {m.button_next()}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                {m.playlist_select_hint()}
              </div>
            )}

            {activePlaylist && (
              <>
                {selectedCount > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-3">
                        {selectionPreview.map((video) => (
                          <div
                            key={video.id}
                            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-background/80 bg-background/80 shadow-sm"
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
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-xs font-semibold text-muted-foreground shadow-sm">
                            +{selectedCount - selectionPreview.length}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {selectedCount} {selectionLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedPlaylistCount} {playlistLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearSelection}
                        disabled={submitSelectionMutation.isPending}
                      >
                        {m.action_clear()}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleOpenReviewDialog}
                        disabled={submitSelectionMutation.isPending}
                      >
                        {m.action_review_submit()}
                      </Button>
                    </div>
                  </div>
                )}
                {isLoadingItems ? (
                  <Loading text={m.library_loading()} size="md" />
                ) : itemsQuery.isError ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                    {m.playlist_items_error()}
                  </div>
                ) : videos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {m.playlist_items_empty()}
                  </p>
                ) : (
                  <div className="grid w-full justify-start gap-4 grid-cols-[repeat(auto-fill,minmax(220px,220px))]">
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
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )
      }
    </div >
  );
}
