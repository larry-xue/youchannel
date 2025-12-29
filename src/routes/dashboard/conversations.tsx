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
import { Input } from "~/lib/components/ui/input";
import {
  CHANNELS_QUERY_KEY,
  CONVERSATIONS_QUERY_KEY,
  type VideoWithStatus,
  createConversationFn,
  getChannelsFn,
  getConversationMessagesFn,
  getConversationsFn,
  getVideosFn,
  sendConversationMessageFn,
} from "~/lib/dashboard/data";
import { truncate } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/conversations")({
  component: DashboardConversations,
});

function DashboardConversations() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    null,
  );
  const [messageDraft, setMessageDraft] = useState("");

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
    queryFn: () => getVideosFn({ data: { channelIds: sortedChannelIds } }),
    enabled: sortedChannelIds.length > 0,
  });

  const videos = videosQuery.data || [];

  const conversationsQuery = useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: () => getConversationsFn(),
  });

  const conversations = conversationsQuery.data || [];

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedConversationId],
    queryFn: () =>
      getConversationMessagesFn({
        data: { conversationId: selectedConversationId || "" },
      }),
    enabled: Boolean(selectedConversationId),
  });

  const conversationMessages = messagesQuery.data || [];

  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

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

  useEffect(() => {
    setSelectedVideoIds((prev) =>
      prev.filter((id) => videos.some((video) => video.id === id)),
    );
  }, [videos]);

  const selectedVideos = useMemo(
    () =>
      selectedVideoIds
        .map((id) => videos.find((video) => video.id === id))
        .filter((video): video is VideoWithStatus => Boolean(video)),
    [selectedVideoIds, videos],
  );

  const hasMissingAnalysis = selectedVideos.some(
    (video) => video.analysis_count === 0,
  );

  const createConversationMutation = useMutation({
    mutationFn: (payload: {
      channelId?: string | null;
      title?: string;
      selections: Array<{ videoId: string; analysisId?: string | null }>;
    }) => createConversationFn({ data: payload }),
    onSuccess: ({ conversation }) => {
      setSelectedConversationId(conversation.id);
      setSelectedVideoIds([]);
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      queryClient.invalidateQueries({
        queryKey: ["conversation-messages", conversation.id],
      });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to create conversation",
      );
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (payload: { conversationId: string; content: string }) =>
      sendConversationMessageFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conversation-messages", selectedConversationId],
      });
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Message failed");
    },
  });

  const handleToggleVideo = (videoId: string) => {
    setSelectedVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId],
    );
  };

  const handleStartConversation = () => {
    if (selectedVideoIds.length === 0) return;
    createConversationMutation.mutate({
      selections: selectedVideoIds.map((videoId) => ({ videoId })),
    });
  };

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedConversationId || !messageDraft.trim()) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      content: messageDraft,
    });
    setMessageDraft("");
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Dashboard
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Conversations
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Build conversations across selected analyses and keep a running thread.
        </p>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {!channelsQuery.isLoading && !activeChannel && channels.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Choose a playlist to track first.{" "}
          <Link to="/dashboard/channels" className="text-primary hover:underline">
            Go to playlists
          </Link>
          .
        </div>
      )}

      {channels.length > 0 && (
        <div className="rounded-3xl border border-border/60 bg-background/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Playlists
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

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pick videos</CardTitle>
              <CardDescription>Select videos to include in a chat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {videosQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading videos...</p>
              ) : sortedChannelIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Select at least one playlist to see its videos.
                </p>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No videos found yet. Sync your playlist first.
                </p>
              ) : (
                <div className="space-y-2">
                  {videos.map((video) => (
                    <label
                      key={video.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm transition",
                        selectedVideoIds.includes(video.id)
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/60 bg-background/70 hover:border-primary/20",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-border"
                        checked={selectedVideoIds.includes(video.id)}
                        onChange={() => handleToggleVideo(video.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {truncate(video.title || "Video", 24)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {video.analysis_count} analyses
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStartConversation}
                  disabled={
                    selectedVideoIds.length === 0 ||
                    createConversationMutation.isPending ||
                    hasMissingAnalysis
                  }
                >
                  {createConversationMutation.isPending
                    ? "Creating..."
                    : "Start conversation"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedVideoIds([])}
                  disabled={selectedVideoIds.length === 0}
                >
                  Clear
                </Button>
              </div>
              {hasMissingAnalysis && (
                <p className="text-xs text-destructive">
                  Run analysis on all selected videos before starting a conversation.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Threads</CardTitle>
              <CardDescription>Recent conversations for this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {conversationsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No conversations yet.
                </p>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={cn(
                      "w-full rounded-2xl border px-3 py-2 text-left text-xs transition",
                      conversation.id === selectedConversationId
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/60 bg-background/70 hover:border-primary/20",
                    )}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {truncate(conversation.title, 26)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {conversation.video_count} videos
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
            <CardDescription>
              Ask questions across the selected analyses.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="max-h-[380px] space-y-3 overflow-y-auto rounded-3xl border border-border/60 bg-background/60 p-3">
              {messagesQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading chat...</p>
              ) : conversationMessages.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Start the conversation by asking a question.
                </p>
              ) : (
                conversationMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[85%] rounded-3xl px-4 py-3 text-sm",
                      message.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted/50 text-foreground",
                    )}
                  >
                    {message.content}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <Input
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder={
                  selectedConversationId
                    ? "Ask about the selected videos..."
                    : "Select a conversation"
                }
                disabled={!selectedConversationId || sendMessageMutation.isPending}
              />
              <Button
                type="submit"
                disabled={!selectedConversationId || sendMessageMutation.isPending}
              >
                {sendMessageMutation.isPending ? "Sending..." : "Send"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
