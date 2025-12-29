import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  DEFAULT_ANALYSIS_PROMPT,
  getChannelsFn,
  saveChannelPromptFn,
  setActiveChannelFn,
  startYouTubeOAuthFn,
  syncChannelsFn,
  syncChannelFn,
} from "~/lib/dashboard/data";
import { formatDateTime } from "~/lib/dashboard/utils";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/channels")({
  component: DashboardChannels,
});

function DashboardChannels() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [channelPromptDraft, setChannelPromptDraft] = useState(
    DEFAULT_ANALYSIS_PROMPT,
  );
  const [syncSummary, setSyncSummary] = useState<{
    created: number;
    skipped: number;
    total: number;
  } | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);

  const channelsQuery = useQuery({
    queryKey: CHANNELS_QUERY_KEY,
    queryFn: () => getChannelsFn(),
  });

  const channels = channelsQuery.data || [];
  const activeChannel = channels.find((channel) => channel.is_active) || null;

  useEffect(() => {
    if (!activeChannel) return;
    setChannelPromptDraft(activeChannel.analysis_prompt || DEFAULT_ANALYSIS_PROMPT);
  }, [activeChannel?.id]);

  const connectMutation = useMutation({
    mutationFn: () => startYouTubeOAuthFn({ data: {} }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to start OAuth",
      );
    },
  });

  const syncMutation = useMutation({
    mutationFn: (channelId: string) => syncChannelFn({ data: { channelId } }),
    onSuccess: (result) => {
      setSyncSummary(result);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Sync failed");
    },
  });

  const syncChannelsMutation = useMutation({
    mutationFn: () => syncChannelsFn({ data: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Channel sync failed",
      );
    },
  });

  useEffect(() => {
    if (!autoSyncEnabled || !activeChannel) return;
    const interval = setInterval(() => {
      if (syncMutation.isPending) return;
      syncMutation.mutate(activeChannel.id);
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoSyncEnabled, activeChannel, syncMutation]);

  const savePromptMutation = useMutation({
    mutationFn: (payload: { channelId: string; prompt: string }) =>
      saveChannelPromptFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Prompt update failed",
      );
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (channelId: string) => setActiveChannelFn({ data: { channelId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to set active channel",
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
          Playlist control
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage your YouTube connection, sync cadence, and the default analysis
          prompt for playlists.
        </p>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Playlists</CardTitle>
            <CardDescription>
              Connect and pick the playlist you want to analyze.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {channelsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading playlists...</p>
            ) : (
              <>
                {activeChannel ? (
                  <>
                    <div className="flex items-center gap-3">
                      {activeChannel.thumbnail_url ? (
                        <img
                          src={activeChannel.thumbnail_url}
                          alt={activeChannel.title || "Playlist thumbnail"}
                          className="h-12 w-12 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                          {activeChannel.title?.slice(0, 1) || "C"}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {activeChannel.title || "Untitled playlist"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeChannel.custom_url || activeChannel.channel_id}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => syncMutation.mutate(activeChannel.id)}
                        disabled={syncMutation.isPending}
                      >
                        {syncMutation.isPending ? "Syncing..." : "Sync now"}
                      </Button>
                      <Button
                        type="button"
                        variant={autoSyncEnabled ? "secondary" : "outline"}
                        onClick={() => setAutoSyncEnabled((prev) => !prev)}
                      >
                        {autoSyncEnabled ? "Auto-sync on" : "Auto-sync off"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => connectMutation.mutate()}
                      >
                        Reconnect
                      </Button>
                    </div>

                    <div className="rounded-2xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Last sync: {formatDateTime(activeChannel.last_synced_at)}
                      {syncSummary && (
                        <span className="block text-[11px] text-muted-foreground/80">
                          {syncSummary.created} created, {syncSummary.skipped} skipped
                        </span>
                      )}
                      {autoSyncEnabled && (
                        <span className="mt-1 block text-[11px] text-muted-foreground/80">
                          Auto-sync runs every 30 minutes while this page is open.
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                      No playlists found yet. Sync your YouTube account to load
                      them, then pick one to start tracking.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => syncChannelsMutation.mutate()}
                        disabled={syncChannelsMutation.isPending}
                      >
                        {syncChannelsMutation.isPending
                          ? "Syncing..."
                          : "Sync playlists"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending}
                      >
                        {connectMutation.isPending ? "Reconnecting..." : "Reconnect"}
                      </Button>
                    </div>
                  </>
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Playlists</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => syncChannelsMutation.mutate()}
                      disabled={syncChannelsMutation.isPending}
                    >
                        {syncChannelsMutation.isPending
                        ? "Syncing..."
                        : "Sync playlists"}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition",
                          channel.is_active
                            ? "border-primary/40 bg-primary/10"
                            : "border-border/60 bg-background/70 hover:border-primary/30",
                        )}
                        onClick={() => setActiveMutation.mutate(channel.id)}
                      >
                        <span className="font-medium">
                          {channel.title || "Untitled playlist"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {channel.is_active ? "Tracking" : "Track"}
                        </span>
                      </button>
                    ))}
                    {channels.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                        No playlists synced yet.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analysis prompt</CardTitle>
            <CardDescription>
              Default prompt used for sync and manual analyses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="channel-prompt">Prompt</Label>
            <textarea
              id="channel-prompt"
              rows={6}
              className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={channelPromptDraft}
              onChange={(event) => setChannelPromptDraft(event.target.value)}
              disabled={!activeChannel}
            />
            <Button
              type="button"
              onClick={() =>
                activeChannel &&
                savePromptMutation.mutate({
                  channelId: activeChannel.id,
                  prompt: channelPromptDraft,
                })
              }
              disabled={!activeChannel || savePromptMutation.isPending}
            >
              {savePromptMutation.isPending ? "Saving..." : "Save prompt"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
