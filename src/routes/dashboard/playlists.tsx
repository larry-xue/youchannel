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
  getPlaylistsFn,
  getVideoAnalysesFn,
  getVideosFn,
  syncPlaylistFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import { formatDate, truncate } from "~/lib/dashboard/utils";
import type { VideoAnalysis } from "~/schema";

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
        data: { playlistIds: activePlaylistId ? [activePlaylistId] : [] },
      }),
    enabled: Boolean(activePlaylistId),
  });

  const videos = videosQuery.data ?? EMPTY_VIDEOS;

  const syncMutation = useMutation({
    mutationFn: (playlistId: string) => syncPlaylistFn({ data: { playlistId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: PLAYLISTS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Sync failed");
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
        <Button
          type="button"
          onClick={() => activePlaylist && syncMutation.mutate(activePlaylist.id)}
          disabled={!activePlaylist || syncMutation.isPending || isLoading}
        >
          {syncMutation.isPending ? "Syncing..." : "Sync now"}
        </Button>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{activePlaylist?.title || "YouChannel AI"} playlist</CardTitle>
          <CardDescription>
            {activePlaylist?.last_synced_at
              ? `Last synced ${formatDate(activePlaylist.last_synced_at)}`
              : "Not synced yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading videos...</p>
          ) : !activePlaylist ? (
            <p className="text-sm text-muted-foreground">
              No playlist found. Please connect your YouTube account first.
            </p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No videos yet. Add videos to your YouChannel AI playlist on YouTube, then
              click "Sync now" to fetch them.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,280px))] sm:justify-start">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="group flex w-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/80 transition-shadow hover:shadow-md"
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
}: {
  count: number;
  latestAt: string | null;
  status: string | null;
}) {
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
