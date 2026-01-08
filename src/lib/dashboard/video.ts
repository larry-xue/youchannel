import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Video, VideoAnalysisSkipReason } from "~/schema";
import { getSupabaseAndUser } from "./utils.server";

export type VideoWithStatus = Video & {
    analysis_count: number;
    latest_analysis_at: string | null;
    latest_analysis_status: string | null;
    latest_skip_reason: VideoAnalysisSkipReason | null;
    failed_count: number;
};

export const getVideosFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => {
        return z
            .object({
                page: z.number().min(1).default(1),
                pageSize: z.number().min(1).max(100).default(12),
            })
            .parse(data);
    })
    .handler(async ({ data }) => {
        const { page, pageSize } = data;
        const { supabase, user } = await getSupabaseAndUser();

        const start = (page - 1) * pageSize;
        const end = start + pageSize - 1;

        const { data: videos, error, count } = await supabase
            .from("videos")
            .select("*", { count: "exact" })
            .eq("user_id", user.id)
            .order("published_at", { ascending: false })
            .range(start, end);

        if (error) throw error;

        const videoIds = (videos || []).map((video) => video.id);
        const total = count ?? 0;

        if (videoIds.length === 0) {
            return {
                videos: [] as VideoWithStatus[],
                total,
            };
        }

        const { data: analyses } = await supabase
            .from("video_analyses")
            .select("video_id, created_at, status, skip_reason, failed_count")
            .in("video_id", videoIds);

        const analysisMap = new Map<
            string,
            {
                count: number;
                latest: string | null;
                status: string | null;
                skip_reason: string | null;
                failed_count: number;
            }
        >();
        for (const analysis of analyses || []) {
            const current = analysisMap.get(analysis.video_id) || {
                count: 0,
                latest: null,
                status: null,
                skip_reason: null,
                failed_count: 0,
            };
            const isNewer =
                !current.latest ||
                new Date(analysis.created_at).getTime() > new Date(current.latest).getTime();
            const nextFailedCount = Math.max(
                current.failed_count,
                analysis.failed_count ?? 0,
            );
            analysisMap.set(analysis.video_id, {
                count: current.count + 1,
                latest: isNewer ? analysis.created_at : current.latest,
                status: isNewer ? analysis.status : current.status,
                skip_reason: isNewer ? analysis.skip_reason : current.skip_reason,
                failed_count: nextFailedCount,
            });
        }

        const videosWithStatus = (videos || []).map((video) => ({
            ...video,
            analysis_count: analysisMap.get(video.id)?.count || 0,
            latest_analysis_at: analysisMap.get(video.id)?.latest || null,
            latest_analysis_status: analysisMap.get(video.id)?.status || null,
            latest_skip_reason:
                (analysisMap.get(video.id)?.skip_reason as VideoAnalysisSkipReason) || null,
            failed_count: analysisMap.get(video.id)?.failed_count ?? 0,
        })) as VideoWithStatus[];

        return {
            videos: videosWithStatus,
            total,
        };
    });

export const getVideoByIdFn = createServerFn({ method: "POST" })
    .inputValidator((data) => z.object({ videoId: z.string() }).parse(data))
    .handler(async ({ data }) => {
        const { supabase, user } = await getSupabaseAndUser();
        if (!data?.videoId) throw new Error("Missing videoId");

        const { data: video, error } = await supabase
            .from("videos")
            .select("*")
            .eq("id", data.videoId)
            .single();

        if (error || !video) throw error || new Error("Video not found");

        return video as Video;
    });
