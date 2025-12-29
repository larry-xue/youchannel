import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
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
import { Separator } from "~/lib/components/ui/separator";
import {
  CHANNELS_QUERY_KEY,
  CONVERSATIONS_QUERY_KEY,
  DEFAULT_ANALYSIS_PROMPT,
  createConversationFn,
  getChannelsFn,
  getVideoAnalysesFn,
  getVideosFn,
  runVideoAnalysisFn,
} from "~/lib/dashboard/data";
import { formatDate, formatDateTime, truncate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/analyses")({
  component: DashboardAnalyses,
});

function DashboardAnalyses() {
  const router = useRouter();
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

  const analysesQuery = useQuery({
    queryKey: ["analyses", selectedVideo?.id],
    queryFn: () =>
      getVideoAnalysesFn({ data: { videoId: selectedVideo?.id || "" } }),
    enabled: Boolean(selectedVideo?.id),
  });

  const analysisRecords = analysesQuery.data || [];

  const analysisMutation = useMutation({
    mutationFn: (payload: { videoId: string; prompt: string }) =>
      runVideoAnalysisFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analyses", selectedVideo?.id] });
      queryClient.invalidateQueries({
        queryKey: ["videos", sortedChannelIds.join("|")],
      });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Analysis failed");
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: (payload: {
      channelId?: string | null;
      title?: string;
      selections: Array<{ videoId: string; analysisId?: string | null }>;
    }) => createConversationFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      router.navigate({ to: "/dashboard/conversations" });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to create conversation",
      );
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Dashboard
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Analysis history
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review analysis records for each video and generate fresh summaries on
          demand.
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

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Videos</CardTitle>
            <CardDescription>Select a video to inspect analyses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {videosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading videos...</p>
            ) : sortedChannelIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select at least one channel to see its videos.
              </p>
            ) : videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No videos found yet. Sync your channel to fetch uploads.
              </p>
            ) : (
              videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition",
                    video.id === selectedVideo?.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/60 bg-background/70 hover:border-primary/20",
                  )}
                  onClick={() => setSelectedVideoId(video.id)}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {truncate(video.title || "Video", 22)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(video.published_at)}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {video.analysis_count}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate analysis</CardTitle>
              <CardDescription>
                Create a new summary for the selected video.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedVideo ? (
                <p className="text-sm text-muted-foreground">
                  Select a video to generate an analysis.
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">
                      {selectedVideo.title || "Untitled video"}
                    </p>
                    <a
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      href={`https://www.youtube.com/watch?v=${selectedVideo.youtube_video_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open on YouTube
                    </a>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="analysis-prompt">Prompt</Label>
                    <textarea
                      id="analysis-prompt"
                      rows={4}
                      className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                      value={analysisPromptDraft}
                      onChange={(event) =>
                        setAnalysisPromptDraft(event.target.value)
                      }
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
                      {analysisMutation.isPending ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analysis records</CardTitle>
              <CardDescription>
                Review summaries and prompt history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedVideo ? (
                <p className="text-sm text-muted-foreground">
                  Select a video to view its analysis history.
                </p>
              ) : analysesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading analyses...</p>
              ) : analysisRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No analyses yet. Generate one to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {analysisRecords.map((analysis) => (
                    <div
                      key={analysis.id}
                      className="rounded-3xl border border-border/60 bg-background/70 px-3 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(analysis.created_at)}
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-[11px]",
                            analysis.status === "failed"
                              ? "bg-destructive/15 text-destructive"
                              : "bg-secondary/15 text-secondary-foreground",
                          )}
                        >
                          {analysis.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Prompt: {truncate(analysis.prompt, 120)}
                      </p>
                      {analysis.status === "failed" ? (
                        <p className="mt-2 text-xs text-destructive">
                          {analysis.error || "Analysis failed"}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-foreground">
                          {truncate(analysis.analysis_text, 180)}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            createConversationMutation.mutate({
                              title: `Chat: ${selectedVideo?.title || "Video"}`,
                              selections: [
                                { videoId: analysis.video_id, analysisId: analysis.id },
                              ],
                            })
                          }
                          disabled={createConversationMutation.isPending}
                        >
                          Chat from record
                        </Button>
                        <span className="text-[11px] text-muted-foreground">
                          {truncate(analysis.model || "Model", 18)}
                        </span>
                      </div>
                      <Separator className="mt-3" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
