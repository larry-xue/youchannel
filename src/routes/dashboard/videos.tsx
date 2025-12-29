import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/lib/components/ui/card";
import { Label } from "~/lib/components/ui/label";
import {
  CHANNELS_QUERY_KEY,
  DEFAULT_ANALYSIS_PROMPT,
  getChannelsFn,
  getVideosFn,
  runVideoAnalysisFn,
} from "~/lib/dashboard/data";
import { formatDate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/videos")({
  component: DashboardVideos,
});

function DashboardVideos() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [analysisPromptDraft, setAnalysisPromptDraft] = useState(
    DEFAULT_ANALYSIS_PROMPT,
  );

  const channelsQuery = useQuery({
    queryKey: CHANNELS_QUERY_KEY,
    queryFn: () => getChannelsFn(),
  });

  const channels = channelsQuery.data || [];
  const activeChannel = channels.find((channel) => channel.is_active) || null;

  const sortedChannelIds = useMemo(
    () => [...new Set(selectedChannelIds)].sort(),
    [selectedChannelIds],
  );

  const videosQuery = useQuery({
    queryKey: ["videos", sortedChannelIds.join("|")],
    queryFn: () =>
      getVideosFn({ data: { channelIds: sortedChannelIds } }),
    enabled: sortedChannelIds.length > 0,
  });

  const videos = videosQuery.data || [];
  const selectedVideo =
    videos.find((video) => video.id === selectedVideoId) || videos[0] || null;

  useEffect(() => {
    if (!selectedVideoId && videos.length > 0) {
      setSelectedVideoId(videos[0].id);
    }
  }, [videos, selectedVideoId]);

  useEffect(() => {
    if (!selectedVideo) return;
    const channelPrompt =
      channels.find((channel) => channel.id === selectedVideo.channel_id)
        ?.analysis_prompt || DEFAULT_ANALYSIS_PROMPT;
    setAnalysisPromptDraft(channelPrompt);
  }, [selectedVideo?.id, channels]);

  useEffect(() => {
    if (channels.length === 0) return;
    if (selectedChannelIds.length > 0) return;
    if (activeChannel) {
      setSelectedChannelIds([activeChannel.id]);
      return;
    }
    setSelectedChannelIds(channels.map((channel) => channel.id));
  }, [channels, activeChannel, selectedChannelIds.length]);

  useEffect(() => {
    setSelectedChannelIds((prev) =>
      prev.filter((id) => channels.some((channel) => channel.id === id)),
    );
  }, [channels]);

  const analysisMutation = useMutation({
    mutationFn: (payload: { videoId: string; prompt: string }) =>
      runVideoAnalysisFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["videos", sortedChannelIds.join("|")],
      });
      queryClient.invalidateQueries({ queryKey: ["analyses", selectedVideo?.id] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Analysis failed");
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Dashboard
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Video library
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review recent uploads and trigger analyses for the active channel.
        </p>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {!channelsQuery.isLoading && !activeChannel && channels.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Choose a channel to track first.{" "}
          <Link to="/dashboard/channels" className="text-primary hover:underline">
            Go to channels
          </Link>
          .
        </div>
      )}

      {channels.length > 0 && (
        <div className="rounded-3xl border border-border/60 bg-background/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Channels
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={selectedChannelIds.length === channels.length ? "secondary" : "outline"}
              onClick={() => setSelectedChannelIds(channels.map((channel) => channel.id))}
            >
              All
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedChannelIds.length === 0 ? "secondary" : "outline"}
              onClick={() => setSelectedChannelIds([])}
            >
              Clear
            </Button>
            {channels.map((channel) => {
              const isSelected = selectedChannelIds.includes(channel.id);
              return (
                <Button
                  key={channel.id}
                  type="button"
                  size="sm"
                  variant={isSelected ? "secondary" : "outline"}
                  onClick={() =>
                    setSelectedChannelIds((prev) =>
                      prev.includes(channel.id)
                        ? prev.filter((id) => id !== channel.id)
                        : [...prev, channel.id],
                    )
                  }
                >
                  {channel.title || "Untitled"}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Videos</CardTitle>
            <CardDescription>Latest uploads for the selected channels.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {videosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading videos...</p>
            ) : sortedChannelIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select at least one channel to see its videos.
              </p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No videos found yet. Run a sync to pull in channel uploads.
              </p>
            ) : (
              <div className="space-y-3">
                {videos.map((video) => {
                  const isSelected = selectedVideoId === video.id;
                  const isAnalyzing =
                    analysisMutation.isPending &&
                    analysisMutation.variables?.videoId === video.id;

                  return (
                    <div
                      key={video.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-3xl border px-3 py-3 transition",
                        isSelected
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/60 bg-background/70 hover:border-primary/20",
                      )}
                      onClick={() => setSelectedVideoId(video.id)}
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {video.title || "Untitled video"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(video.published_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-secondary/15 px-2 py-1 text-secondary-foreground">
                            {video.analysis_count} analyses
                          </span>
                          <span className="rounded-full bg-muted/40 px-2 py-1 text-muted-foreground">
                            Last: {formatDate(video.latest_analysis_at)}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          analysisMutation.mutate({
                            videoId: video.id,
                            prompt: analysisPromptDraft,
                          });
                        }}
                        disabled={analysisMutation.isPending}
                      >
                        {isAnalyzing ? "Analyzing..." : "Analyze"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analysis prompt</CardTitle>
            <CardDescription>
              Customize the prompt for the next analysis run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="analysis-prompt">Prompt</Label>
            <textarea
              id="analysis-prompt"
              rows={6}
              className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={analysisPromptDraft}
              onChange={(event) => setAnalysisPromptDraft(event.target.value)}
              disabled={!activeChannel}
            />
            <Button
              type="button"
              onClick={() =>
                selectedVideo &&
                analysisMutation.mutate({
                  videoId: selectedVideo.id,
                  prompt: analysisPromptDraft,
                })
              }
              disabled={!selectedVideo || analysisMutation.isPending}
            >
              {analysisMutation.isPending ? "Generating..." : "Analyze selected"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
