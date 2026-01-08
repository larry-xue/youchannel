import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ConnectYouTubeAlert } from "~/lib/components/connect-youtube-alert";
import { Button } from "~/lib/components/ui/button";
import { Loading } from "~/lib/components/ui/loading";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { VideoCard } from "~/lib/components/video-card";
import {
  getYouTubePlaylistItemsFn,
  getYouTubePlaylistsFn,
  getYouTubeAccountStatusFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
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
const EMPTY_VIDEOS: VideoWithStatus[] = [];

function DashboardPlaylists() {
  const queryClient = useQueryClient();
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [pageTokens, setPageTokens] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
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
    setSelectedVideoIds([]);
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
    return playlistItems.map((item) => ({
      id: item.videoId,
      playlist_id: activePlaylistId,
      youtube_video_id: item.videoId,
      title: item.title,
      description: item.description,
      published_at: item.publishedAt,
      thumbnail_url: item.thumbnailUrl,
      duration: item.duration,
      sync_status: "synced",
      removed_at: null,
      created_at: item.publishedAt || fallbackTimestamp,
      updated_at: fallbackTimestamp,
      analysis_count: 0,
      latest_analysis_at: null,
      latest_analysis_status: null,
      latest_skip_reason: null,
      failed_count: 0,
    }));
  }, [activePlaylistId, playlistItems]);

  const totalResults = itemsQuery.data?.pageInfo?.totalResults ?? null;
  const totalPages = totalResults ? Math.ceil(totalResults / PAGE_SIZE) : null;
  const pageLabel = totalPages
    ? `Page ${pageIndex + 1} of ${totalPages}`
    : `Page ${pageIndex + 1}`;

  const handleSelectPlaylist = (playlistId: string) => {
    if (playlistId === activePlaylistId) return;
    setActivePlaylistId(playlistId);
  };

  const handleToggleVideo = (videoId: string) => {
    setSelectedVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId],
    );
  };

  const handleClearSelection = () => {
    setSelectedVideoIds([]);
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
      setActionError(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  };

  const canPrev = pageIndex > 0;
  const canNext = Boolean(itemsQuery.data?.nextPageToken);
  const isLoadingPlaylists = playlistsQuery.isLoading;
  const isLoadingItems = itemsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Playlists
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse your YouTube playlists directly from the API.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {
        (!hasAccount || search.code) ? (
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
                  <h2 className="text-sm font-semibold text-foreground">Your playlists</h2>
                  <span className="text-xs text-muted-foreground">{playlists.length}</span>
                </div>
                <ScrollArea className="flex-1 px-3 pb-4 overflow-y-auto">
                  {isLoadingPlaylists ? (
                    <Loading size="sm" text="Loading playlists..." />
                  ) : playlistsQuery.isError ? (
                    <p className="px-2 text-sm text-destructive">
                      Unable to load playlists. Please try reconnecting.
                    </p>
                  ) : playlists.length === 0 ? (
                    <p className="px-2 text-sm text-muted-foreground">
                      No playlists found.
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
                                  alt={playlist.title || "Playlist thumbnail"}
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
                                {playlist.title || "Untitled playlist"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {playlist.description || "No description"}
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
              {activePlaylist ? (
                <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-foreground">
                      {activePlaylist.title || "Untitled playlist"}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {activePlaylist.description || "No description"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{pageLabel}</span>
                    {typeof totalResults === "number" && (
                      <span>{totalResults} videos</span>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={!canPrev || isLoadingItems}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={!canNext || isLoadingItems}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                  Select a playlist to load its videos.
                </div>
              )}

              {activePlaylist && (
                <>
                  {isLoadingItems ? (
                    <Loading text="Loading videos..." size="md" />
                  ) : itemsQuery.isError ? (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                      Unable to load playlist items.
                    </div>
                  ) : videos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This playlist has no videos yet.
                    </p>
                  ) : (
                    <>
                      {selectedVideoIds.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 text-sm">
                          <span className="font-medium text-foreground">
                            {selectedVideoIds.length} selected
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearSelection}
                          >
                            Clear selection
                          </Button>
                        </div>
                      )}
                      <div className="grid w-full justify-start gap-4 grid-cols-[repeat(auto-fill,minmax(220px,220px))]">
                        {videos.map((video) => (
                          <VideoCard
                            key={video.id}
                            video={video as VideoWithStatus}
                            isSelected={selectedVideoIds.includes(video.id)}
                            isSelectable
                            onSelect={handleToggleVideo}
                            onOpen={handleOpenVideo}
                            actionLabel="Open"
                          />
                        ))}
                      </div>
                    </>
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
