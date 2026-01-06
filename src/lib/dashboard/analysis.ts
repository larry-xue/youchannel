import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { VideoAnalysis } from "~/schema";
import { getSupabaseAndUser } from "./utils";

const DEFAULT_ANALYSIS_PROMPT =
    "Summarize the video in 5 bullet points and call out key insights.";

export type OpenApiAnalysisResponse = {
    playlistId: string;
    userId: string;
    candidateCount: number;
    enqueued: number;
    skipped: number;
    skipReasons: {
        duration_exceeded: number;
        analysis_exists: number;
        quota_exceeded: number;
    };
};

export const getVideoAnalysesFn = createServerFn({ method: "POST" })
    .inputValidator((data) => z.object({ videoId: z.string() }).parse(data))
    .handler(async ({ data }) => {
        const { supabase } = await getSupabaseAndUser();
        if (!data?.videoId) return [] as VideoAnalysis[];

        const { data: analyses, error } = await supabase
            .from("video_analyses")
            .select("*")
            .eq("video_id", data.videoId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return (analyses || []) as VideoAnalysis[];
    });

export const runVideoAnalysisFn = createServerFn({ method: "POST" })
    .inputValidator((data) =>
        z.object({ videoId: z.string(), prompt: z.string().optional() }).parse(data),
    )
    .handler(async ({ data }) => {
        const { supabase, user } = await getSupabaseAndUser();
        if (!data?.videoId) throw new Error("Missing videoId");

        const { data: video, error: videoError } = await supabase
            .from("videos")
            .select("*")
            .eq("id", data.videoId)
            .single();

        if (videoError || !video) throw videoError || new Error("Video not found");

        const { data: playlist, error: playlistError } = await supabase
            .from("playlists")
            .select("*")
            .eq("id", video.playlist_id)
            .single();

        if (playlistError || !playlist)
            throw playlistError || new Error("Playlist not found");

        const prompt = (data.prompt || playlist.analysis_prompt || DEFAULT_ANALYSIS_PROMPT).trim();

        const { createHash } = await import("crypto");
        const promptHash = createHash("sha256").update(prompt).digest("hex");

        const { generateVideoAnalysis } = await import("~/lib/server/gemini");
        const videoUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
        const result = await generateVideoAnalysis({ videoUrl, prompt });

        const { data: inserted, error: insertError } = await supabase
            .from("video_analyses")
            .insert({
                video_id: video.id,
                playlist_id: playlist.id,
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
    });

export const triggerOpenApiAnalysisFn = createServerFn({ method: "POST" })
    .inputValidator((data) =>
        z.object({ playlistId: z.string(), videoIds: z.array(z.string()) }).parse(data),
    )
    .handler(async ({ data }) => {
        const { supabase, user } = await getSupabaseAndUser();
        if (!data?.playlistId) throw new Error("Missing playlistId");

        const baseUrl = process.env.OPENAPI_BASE_URL;
        const sharedKey = process.env.OPENAPI_SHARED_KEY;
        if (!baseUrl || !sharedKey) throw new Error("OpenAPI service unavailable");

        const uniqueVideoIds = Array.from(new Set(data.videoIds.filter(Boolean)));
        if (uniqueVideoIds.length === 0) throw new Error("Missing videoIds");

        const { data: playlist, error: playlistError } = await supabase
            .from("playlists")
            .select("id")
            .eq("id", data.playlistId)
            .eq("user_id", user.id)
            .maybeSingle();

        if (playlistError || !playlist)
            throw playlistError || new Error("Playlist not found");

        const { data: videos, error: videosError } = await supabase
            .from("videos")
            .select("id, sync_status")
            .in("id", uniqueVideoIds)
            .eq("playlist_id", playlist.id);

        if (videosError) throw videosError;

        const syncedVideoIds = (videos || [])
            .filter((video) => video.sync_status === "synced")
            .map((video) => video.id);

        if (syncedVideoIds.length === 0) {
            return {
                playlistId: playlist.id,
                userId: user.id,
                candidateCount: 0,
                enqueued: 0,
                skipped: 0,
                skipReasons: {
                    duration_exceeded: 0,
                    analysis_exists: 0,
                    quota_exceeded: 0,
                },
            } as OpenApiAnalysisResponse;
        }

        const { data: existingAnalyses, error: analysesError } = await supabase
            .from("video_analyses")
            .select("video_id, status, created_at")
            .in("video_id", syncedVideoIds);

        if (analysesError) throw analysesError;

        const latestStatusByVideo = new Map<string, { status: string; createdAt: string }>();
        for (const analysis of existingAnalyses || []) {
            if (!analysis.video_id || !analysis.created_at || !analysis.status) continue;
            const current = latestStatusByVideo.get(analysis.video_id);
            if (
                !current ||
                new Date(analysis.created_at).getTime() > new Date(current.createdAt).getTime()
            ) {
                latestStatusByVideo.set(analysis.video_id, {
                    status: analysis.status,
                    createdAt: analysis.created_at,
                });
            }
        }

        const inProgressIds = new Set<string>();
        for (const [videoId, info] of latestStatusByVideo.entries()) {
            if (info.status === "pending" || info.status === "processing") {
                inProgressIds.add(videoId);
            }
        }

        const eligibleVideoIds = syncedVideoIds.filter((id) => !inProgressIds.has(id));
        const inProgressCount = syncedVideoIds.length - eligibleVideoIds.length;

        if (eligibleVideoIds.length === 0) {
            return {
                playlistId: playlist.id,
                userId: user.id,
                candidateCount: syncedVideoIds.length,
                enqueued: 0,
                skipped: inProgressCount,
                skipReasons: {
                    duration_exceeded: 0,
                    analysis_exists: inProgressCount,
                    quota_exceeded: 0,
                },
            } as OpenApiAnalysisResponse;
        }

        const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
        const url = new URL("openapi/analysis", normalizedBase);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-openapi-key": sharedKey,
            },
            body: JSON.stringify({
                playlistId: playlist.id,
                userId: user.id,
                videoIds: eligibleVideoIds,
            }),
        });

        const payload = (await response.json().catch(() => null)) as
            | OpenApiAnalysisResponse
            | { error?: string }
            | null;

        if (!response.ok) {
            const errorValue =
                payload && typeof payload === "object" && "error" in payload
                    ? payload.error
                    : undefined;
            const message = errorValue
                ? `OpenAPI error: ${errorValue}`
                : `OpenAPI request failed (${response.status})`;
            throw new Error(message);
        }

        if (!payload || typeof payload !== "object" || !("candidateCount" in payload)) {
            throw new Error("OpenAPI response invalid");
        }

        const result = payload as OpenApiAnalysisResponse;

        if (!inProgressCount) return result;

        return {
            ...result,
            candidateCount: result.candidateCount + inProgressCount,
            skipped: result.skipped + inProgressCount,
            skipReasons: {
                duration_exceeded: result.skipReasons?.duration_exceeded ?? 0,
                analysis_exists:
                    (result.skipReasons?.analysis_exists ?? 0) + inProgressCount,
                quota_exceeded: result.skipReasons?.quota_exceeded ?? 0,
            },
        } as OpenApiAnalysisResponse;
    });
