import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
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
import { Label } from "~/lib/components/ui/label";
import { Separator } from "~/lib/components/ui/separator";
import { cn } from "~/lib/utils";
import type {
  Channel,
  Conversation,
  ConversationMessage,
  Video,
  VideoAnalysis,
} from "~/schema";

const DEFAULT_ANALYSIS_PROMPT =
  "Summarize the video in 5 bullet points and call out key insights.";

const CHANNELS_QUERY_KEY = ["channels"] as const;
const CONVERSATIONS_QUERY_KEY = ["conversations"] as const;

type VideoWithStatus = Video & {
  analysis_count: number;
  latest_analysis_at: string | null;
};

type ConversationWithCount = Conversation & {
  video_count: number;
};

async function getSupabaseAndUser() {
  const { getSupabaseServerClient } = await import("~/lib/server/auth");
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("User not authenticated");
  return { supabase, user };
}

export const startYouTubeOAuthFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { randomUUID } = await import("crypto");
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase.from("youtube_oauth_states").insert({
      user_id: user.id,
      state,
      expires_at: expiresAt,
    });

    if (error) throw error;

    const { buildYouTubeAuthUrl } = await import("~/lib/server/youtube");
    return { url: buildYouTubeAuthUrl(state) };
  },
);

export const getChannelsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { data, error } = await supabase
      .from("channels")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data || []) as Channel[];
  },
);

export const setActiveChannelFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelId: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.channelId) throw new Error("Missing channelId");

    const { error: resetError } = await supabase
      .from("channels")
      .update({ is_active: false })
      .eq("user_id", user.id);
    if (resetError) throw resetError;

    const { error } = await supabase
      .from("channels")
      .update({ is_active: true })
      .eq("id", data.channelId)
      .eq("user_id", user.id);

    if (error) throw error;
    return { success: true };
  },
);

export const saveChannelPromptFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelId: string; prompt: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.channelId) throw new Error("Missing channelId");

    const prompt = data.prompt.trim() || DEFAULT_ANALYSIS_PROMPT;
    const { error } = await supabase
      .from("channels")
      .update({ analysis_prompt: prompt })
      .eq("id", data.channelId)
      .eq("user_id", user.id);

    if (error) throw error;
    return { success: true };
  },
);
export const getVideosFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelId: string } }) => {
    const { supabase } = await getSupabaseAndUser();
    if (!data?.channelId) return [] as VideoWithStatus[];

    const { data: videos, error } = await supabase
      .from("videos")
      .select("*")
      .eq("channel_id", data.channelId)
      .order("published_at", { ascending: false });

    if (error) throw error;

    const videoIds = (videos || []).map((video) => video.id);
    if (videoIds.length === 0) return [] as VideoWithStatus[];

    const { data: analyses } = await supabase
      .from("video_analyses")
      .select("video_id, created_at")
      .in("video_id", videoIds);

    const analysisMap = new Map<string, { count: number; latest: string | null }>();
    for (const analysis of analyses || []) {
      const current = analysisMap.get(analysis.video_id) || {
        count: 0,
        latest: null,
      };
      const nextLatest =
        !current.latest ||
        new Date(analysis.created_at).getTime() >
          new Date(current.latest).getTime()
          ? analysis.created_at
          : current.latest;
      analysisMap.set(analysis.video_id, {
        count: current.count + 1,
        latest: nextLatest,
      });
    }

    return (videos || []).map((video) => ({
      ...video,
      analysis_count: analysisMap.get(video.id)?.count || 0,
      latest_analysis_at: analysisMap.get(video.id)?.latest || null,
    })) as VideoWithStatus[];
  },
);

export const getVideoAnalysesFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { videoId: string } }) => {
    const { supabase } = await getSupabaseAndUser();
    if (!data?.videoId) return [] as VideoAnalysis[];

    const { data: analyses, error } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("video_id", data.videoId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (analyses || []) as VideoAnalysis[];
  },
);

export const syncChannelFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelId: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.channelId) throw new Error("Missing channelId");

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("id", data.channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channel) throw channelError || new Error("Channel not found");
    if (!channel.youtube_account_id)
      throw new Error("Channel is not connected to YouTube");

    const { data: account, error: accountError } = await supabase
      .from("youtube_accounts")
      .select("*")
      .eq("id", channel.youtube_account_id)
      .single();

    if (accountError || !account)
      throw accountError || new Error("YouTube account not found");

    let accessToken = account.access_token;
    const expiresAt = account.expires_at
      ? new Date(account.expires_at).getTime()
      : 0;

    if (!expiresAt || Date.now() > expiresAt - 60_000) {
      const { refreshAccessToken } = await import("~/lib/server/youtube");
      const refreshed = await refreshAccessToken(account.refresh_token);
      accessToken = refreshed.access_token;

      const updatedExpiresAt = new Date(
        Date.now() + refreshed.expires_in * 1000,
      ).toISOString();

      const { error: updateError } = await supabase
        .from("youtube_accounts")
        .update({
          access_token: accessToken,
          refresh_token: refreshed.refresh_token || account.refresh_token,
          expires_at: updatedExpiresAt,
          scope: refreshed.scope || account.scope,
          token_type: refreshed.token_type || account.token_type,
        })
        .eq("id", account.id);

      if (updateError) throw updateError;
    }

    const { fetchChannelSummaries, fetchChannelVideos } = await import(
      "~/lib/server/youtube",
    );

    const channelSummaries = await fetchChannelSummaries(accessToken);
    const summary =
      channelSummaries.find((item) => item.channelId === channel.channel_id) ||
      channelSummaries[0];

    if (!summary?.uploadsPlaylistId)
      throw new Error("Unable to fetch channel uploads");

    const fetchedVideos = await fetchChannelVideos(
      accessToken,
      summary.uploadsPlaylistId,
      25,
    );

    const upsertPayload = fetchedVideos.map((video) => ({
      channel_id: channel.id,
      youtube_video_id: video.videoId,
      title: video.title,
      description: video.description,
      published_at: video.publishedAt,
      thumbnail_url: video.thumbnailUrl,
      duration: video.duration,
      raw: video.raw,
    }));

    const { data: upserted, error: upsertError } = await supabase
      .from("videos")
      .upsert(upsertPayload, { onConflict: "channel_id,youtube_video_id" })
      .select();

    if (upsertError) throw upsertError;

    const { error: channelUpdateError } = await supabase
      .from("channels")
      .update({
        title: summary.title,
        description: summary.description,
        thumbnail_url: summary.thumbnailUrl,
        custom_url: summary.customUrl,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", channel.id);

    if (channelUpdateError) throw channelUpdateError;

    const prompt =
      (channel.analysis_prompt || DEFAULT_ANALYSIS_PROMPT).trim() ||
      DEFAULT_ANALYSIS_PROMPT;
    const { createHash } = await import("crypto");
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    const videoRows = upserted || [];
    if (videoRows.length === 0) {
      return { created: 0, skipped: 0, total: 0 };
    }

    const videoIds = videoRows.map((video) => video.id);
    const { data: existingAnalyses } = await supabase
      .from("video_analyses")
      .select("video_id, prompt_hash")
      .in("video_id", videoIds)
      .eq("prompt_hash", promptHash);

    const existingSet = new Set(
      (existingAnalyses || []).map((row) => row.video_id),
    );

    const { generateVideoAnalysis } = await import("~/lib/server/gemini");

    let created = 0;
    let skipped = 0;

    for (const video of videoRows) {
      if (existingSet.has(video.id)) {
        skipped += 1;
        continue;
      }

      const videoUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;

      try {
        const result = await generateVideoAnalysis({ videoUrl, prompt });
        const { error: insertError } = await supabase
          .from("video_analyses")
          .insert({
            video_id: video.id,
            channel_id: channel.id,
            user_id: user.id,
            prompt,
            prompt_hash: promptHash,
            analysis_text: result.text,
            model: result.model,
            status: "completed",
          });

        if (insertError) throw insertError;
        created += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Analysis failed";

        await supabase.from("video_analyses").insert({
          video_id: video.id,
          channel_id: channel.id,
          user_id: user.id,
          prompt,
          prompt_hash: promptHash,
          analysis_text: "",
          model: "gemini-2.5-flash",
          status: "failed",
          error: message,
        });
      }
    }

    return { created, skipped, total: videoRows.length };
  },
);

export const runVideoAnalysisFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { videoId: string; prompt?: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.videoId) throw new Error("Missing videoId");

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", data.videoId)
      .single();

    if (videoError || !video) throw videoError || new Error("Video not found");

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("id", video.channel_id)
      .single();

    if (channelError || !channel)
      throw channelError || new Error("Channel not found");

    const prompt =
      (data.prompt || channel.analysis_prompt || DEFAULT_ANALYSIS_PROMPT).trim() ||
      DEFAULT_ANALYSIS_PROMPT;

    const { createHash } = await import("crypto");
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    const { data: existing } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("video_id", video.id)
      .eq("prompt_hash", promptHash)
      .maybeSingle();

    if (existing) return { analysis: existing, reused: true };

    const { generateVideoAnalysis } = await import("~/lib/server/gemini");
    const videoUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
    const result = await generateVideoAnalysis({ videoUrl, prompt });

    const { data: inserted, error: insertError } = await supabase
      .from("video_analyses")
      .insert({
        video_id: video.id,
        channel_id: channel.id,
        user_id: user.id,
        prompt,
        prompt_hash: promptHash,
        analysis_text: result.text,
        model: result.model,
        status: "completed",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return { analysis: inserted, reused: false };
  },
);
export const getConversationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const convoIds = (conversations || []).map((conversation) => conversation.id);
    if (convoIds.length === 0) return [] as ConversationWithCount[];

    const { data: selections } = await supabase
      .from("conversation_videos")
      .select("conversation_id")
      .in("conversation_id", convoIds);

    const counts = new Map<string, number>();
    for (const selection of selections || []) {
      counts.set(
        selection.conversation_id,
        (counts.get(selection.conversation_id) || 0) + 1,
      );
    }

    return (conversations || []).map((conversation) => ({
      ...conversation,
      video_count: counts.get(conversation.id) || 0,
    })) as ConversationWithCount[];
  },
);

export const createConversationFn = createServerFn({ method: "POST" }).handler(
  async ({
    data,
  }: {
    data: {
      channelId?: string | null;
      title?: string;
      selections: Array<{ videoId: string; analysisId?: string | null }>;
    };
  }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.selections?.length)
      throw new Error("Select at least one video");

    const videoIds = data.selections.map((selection) => selection.videoId);

    const { data: videos, error: videoError } = await supabase
      .from("videos")
      .select("id, title")
      .in("id", videoIds);

    if (videoError) throw videoError;

    const { data: analyses } = await supabase
      .from("video_analyses")
      .select("id, video_id, created_at")
      .in("video_id", videoIds)
      .order("created_at", { ascending: false });

    const latestByVideo = new Map<string, string>();
    for (const analysis of analyses || []) {
      if (!latestByVideo.has(analysis.video_id)) {
        latestByVideo.set(analysis.video_id, analysis.id);
      }
    }

    const selectionRows = data.selections.map((selection) => ({
      video_id: selection.videoId,
      analysis_id: selection.analysisId || latestByVideo.get(selection.videoId) || null,
    }));

    const missing = selectionRows.filter((row) => !row.analysis_id);
    if (missing.length > 0) {
      throw new Error("Run analysis for all selected videos first");
    }

    const trimmedTitle = data.title?.trim();
    const sortedTitles = (videos || []).map((video) => video.title || "Video");
    const title =
      trimmedTitle ||
      (sortedTitles.length === 1
        ? `Chat: ${sortedTitles[0]}`
        : `Chat: ${sortedTitles[0]} +${sortedTitles.length - 1}`);

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        channel_id: data.channelId || null,
        title,
      })
      .select()
      .single();

    if (conversationError || !conversation)
      throw conversationError || new Error("Conversation not created");

    const { error: selectionError } = await supabase
      .from("conversation_videos")
      .insert(
        selectionRows.map((row) => ({
          conversation_id: conversation.id,
          video_id: row.video_id,
          analysis_id: row.analysis_id,
        })),
      );

    if (selectionError) throw selectionError;

    return { conversation };
  },
);

export const getConversationMessagesFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { conversationId: string } }) => {
    const { supabase } = await getSupabaseAndUser();
    if (!data?.conversationId) return [] as ConversationMessage[];

    const { data: messages, error } = await supabase
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (messages || []) as ConversationMessage[];
  },
);

export const sendConversationMessageFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { conversationId: string; content: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.conversationId) throw new Error("Missing conversationId");

    const content = data.content?.trim();
    if (!content) throw new Error("Message cannot be empty");

    const { data: conversation, error: convoError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", data.conversationId)
      .eq("user_id", user.id)
      .single();

    if (convoError || !conversation)
      throw convoError || new Error("Conversation not found");

    const { error: insertUserError } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: data.conversationId,
        role: "user",
        content,
      });

    if (insertUserError) throw insertUserError;

    const { data: selections, error: selectionError } = await supabase
      .from("conversation_videos")
      .select("video_id, analysis_id")
      .eq("conversation_id", data.conversationId);

    if (selectionError) throw selectionError;

    const analysisIds = (selections || [])
      .map((selection) => selection.analysis_id)
      .filter(Boolean) as string[];

    if (analysisIds.length === 0)
      throw new Error("Conversation has no analysis records");

    const { data: analyses } = await supabase
      .from("video_analyses")
      .select("id, video_id, prompt, analysis_text")
      .in("id", analysisIds);

    const { data: videos } = await supabase
      .from("videos")
      .select("id, title, youtube_video_id")
      .in(
        "id",
        (selections || []).map((selection) => selection.video_id),
      );

    const videoMap = new Map(
      (videos || []).map((video) => [video.id, video]),
    );
    const analysisMap = new Map(
      (analyses || []).map((analysis) => [analysis.id, analysis]),
    );

    const promptBlocks = (selections || []).map((selection, index) => {
      const analysis = selection.analysis_id
        ? analysisMap.get(selection.analysis_id)
        : undefined;
      const video = videoMap.get(selection.video_id);
      const title = video?.title || "Untitled video";
      const url = video?.youtube_video_id
        ? `https://www.youtube.com/watch?v=${video.youtube_video_id}`
        : "Unknown URL";
      const prompt = analysis?.prompt || "No prompt";
      const analysisText = analysis?.analysis_text || "No analysis available.";

      return `Video ${index + 1}: ${title}\nURL: ${url}\nPrompt: ${prompt}\nAnalysis:\n${analysisText}`;
    });

    const systemPrompt = [
      "You are a YouTube analysis assistant.",
      "Use only the analysis records below as ground truth.",
      "If a question is outside the records, say you do not have that detail.",
      "",
      ...promptBlocks,
    ].join("\n");

    const { data: conversationMessages } = await supabase
      .from("conversation_messages")
      .select("role, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });

    const modelMessages = (conversationMessages || [])
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));

    const { generateConversationReply } = await import("~/lib/server/gemini");
    const reply = await generateConversationReply({
      messages: modelMessages,
      systemPrompts: [systemPrompt],
    });

    const { error: insertAssistantError } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: data.conversationId,
        role: "assistant",
        content: reply.text,
        metadata: { model: reply.model },
      });

    if (insertAssistantError) throw insertAssistantError;

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return { reply: reply.text, model: reply.model };
  },
);

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [channelPromptDraft, setChannelPromptDraft] = useState(
    DEFAULT_ANALYSIS_PROMPT,
  );
  const [analysisPromptDraft, setAnalysisPromptDraft] = useState(
    DEFAULT_ANALYSIS_PROMPT,
  );
  const [messageDraft, setMessageDraft] = useState("");
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
  const activeChannel =
    channels.find((channel) => channel.is_active) || channels[0] || null;

  const videosQuery = useQuery({
    queryKey: ["videos", activeChannel?.id],
    queryFn: () =>
      getVideosFn({ data: { channelId: activeChannel?.id || "" } }),
    enabled: Boolean(activeChannel?.id),
  });

  const videos = videosQuery.data || [];
  const selectedVideo =
    videos.find((video) => video.id === selectedVideoId) || videos[0] || null;

  const analysesQuery = useQuery({
    queryKey: ["analyses", selectedVideo?.id],
    queryFn: () =>
      getVideoAnalysesFn({ data: { videoId: selectedVideo?.id || "" } }),
    enabled: Boolean(selectedVideo?.id),
  });

  const analysisRecords = analysesQuery.data || [];

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
    if (!selectedVideoId && videos.length > 0) {
      setSelectedVideoId(videos[0].id);
    }
  }, [videos, selectedVideoId]);

  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!activeChannel) return;
    setChannelPromptDraft(activeChannel.analysis_prompt || DEFAULT_ANALYSIS_PROMPT);
    setAnalysisPromptDraft(activeChannel.analysis_prompt || DEFAULT_ANALYSIS_PROMPT);
  }, [activeChannel?.id]);

  useEffect(() => {
    setSelectedVideoIds((prev) =>
      prev.filter((id) => videos.some((video) => video.id === id)),
    );
  }, [videos]);

  const selectedVideos = useMemo(
    () =>
      selectedVideoIds
        .map((id) => videos.find((video) => video.id === id))
        .filter(Boolean) as VideoWithStatus[],
    [selectedVideoIds, videos],
  );
  const hasMissingAnalysis = selectedVideos.some(
    (video) => video.analysis_count === 0,
  );

  const connectMutation = useMutation({
    mutationFn: () => startYouTubeOAuthFn(),
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
      queryClient.invalidateQueries({ queryKey: ["videos", activeChannel?.id] });
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Sync failed",
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
    mutationFn: (channelId: string) =>
      setActiveChannelFn({ data: { channelId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHANNELS_QUERY_KEY });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Unable to set active channel",
      );
    },
  });

  const analysisMutation = useMutation({
    mutationFn: (payload: { videoId: string; prompt: string }) =>
      runVideoAnalysisFn({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analyses", selectedVideo?.id] });
      queryClient.invalidateQueries({ queryKey: ["videos", activeChannel?.id] });
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Analysis failed",
      );
    },
  });

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
      setActionError(
        error instanceof Error ? error.message : "Message failed",
      );
    },
  });

  const handleToggleVideo = (videoId: string) => {
    setSelectedVideoIds((prev) =>
      prev.includes(videoId)
        ? prev.filter((id) => id !== videoId)
        : [...prev, videoId],
    );
  };

  const handleStartConversation = () => {
    if (!activeChannel || selectedVideoIds.length === 0) return;
    createConversationMutation.mutate({
      channelId: activeChannel.id,
      selections: selectedVideoIds.map((videoId) => ({ videoId })),
    });
  };

  const handleChatFromAnalysis = (analysis: VideoAnalysis) => {
    if (!activeChannel) return;
    createConversationMutation.mutate({
      channelId: activeChannel.id,
      title: `Chat: ${selectedVideo?.title || "Video"}`,
      selections: [{ videoId: analysis.video_id, analysisId: analysis.id }],
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

  const formatDateTime = (value?: string | null) => {
    if (!value) return "Not synced yet";
    return new Date(value).toLocaleString();
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "Unknown date";
    return new Date(value).toLocaleDateString();
  };

  const truncate = (value: string, length: number) =>
    value.length > length ? `${value.slice(0, length)}...` : value;

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Workspace
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Channel intelligence studio
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Connect your YouTube channel, keep videos in sync, and chat across
          multiple analyses with Gemini.
        </p>
      </div>

      {actionError && (
        <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Channel</CardTitle>
              <CardDescription>
                Connect and pick the channel you want to analyze.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {channelsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading channels...</p>
              ) : channels.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Connect your YouTube account to start syncing videos.
                  </p>
                  <Button
                    type="button"
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                  >
                    {connectMutation.isPending ? "Opening OAuth..." : "Connect YouTube"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    {activeChannel?.thumbnail_url ? (
                      <img
                        src={activeChannel.thumbnail_url}
                        alt={activeChannel.title || "Channel thumbnail"}
                        className="h-12 w-12 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                        {activeChannel?.title?.slice(0, 1) || "C"}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {activeChannel?.title || "Untitled channel"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeChannel?.custom_url || activeChannel?.channel_id}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        activeChannel && syncMutation.mutate(activeChannel.id)
                      }
                      disabled={!activeChannel || syncMutation.isPending}
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
                    Last sync: {formatDateTime(activeChannel?.last_synced_at)}
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

                  <Separator />

                  <div className="space-y-2">
                    <Label>Channels</Label>
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
                            {channel.title || "Untitled channel"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {channel.is_active ? "Active" : "Set active"}
                          </span>
                        </button>
                      ))}
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
                rows={5}
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Videos</CardTitle>
              <CardDescription>
                Latest uploads for the active channel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {videosQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading videos...</p>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No videos found yet. Run a sync to pull in channel uploads.
                </p>
              ) : (
                <div className="space-y-3">
                  {videos.map((video) => {
                    const isSelected = selectedVideoId === video.id;
                    const isChecked = selectedVideoIds.includes(video.id);
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
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-border"
                          checked={isChecked}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => handleToggleVideo(video.id)}
                        />
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
                              prompt: isSelected
                                ? analysisPromptDraft
                                : channelPromptDraft,
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analysis records</CardTitle>
              <CardDescription>
                Review summaries and start chats from a record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedVideo ? (
                <p className="text-sm text-muted-foreground">
                  Select a video to view its analysis history.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
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
                    <Label htmlFor="analysis-prompt">New analysis prompt</Label>
                    <textarea
                      id="analysis-prompt"
                      rows={4}
                      className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                      value={analysisPromptDraft}
                      onChange={(event) => setAnalysisPromptDraft(event.target.value)}
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
                      disabled={analysisMutation.isPending}
                    >
                      {analysisMutation.isPending ? "Generating..." : "Generate analysis"}
                    </Button>
                  </div>

                  <Separator />

                  {analysesQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading analyses...
                    </p>
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
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3"
                            onClick={() => handleChatFromAnalysis(analysis)}
                            disabled={analysis.status === "failed"}
                          >
                            Chat from record
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>
                Chat across one or more selected videos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Selected videos: {selectedVideoIds.length}
                </div>
                <div className="flex gap-2">
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
              </div>

              {selectedVideos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedVideos.map((video) => (
                    <span
                      key={video.id}
                      className="rounded-full bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground"
                    >
                      {truncate(video.title || "Video", 24)}
                    </span>
                  ))}
                </div>
              )}
              {hasMissingAnalysis && (
                <p className="text-xs text-destructive">
                  Run analysis on all selected videos before starting a conversation.
                </p>
              )}

              <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Threads
                  </p>
                  <div className="max-h-[240px] space-y-2 overflow-y-auto pr-2">
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
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="max-h-[260px] space-y-3 overflow-y-auto rounded-3xl border border-border/60 bg-background/60 p-3">
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

                  <form
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-2"
                  >
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
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
