import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { VideoAnalysis } from "~/schema";
import { getSupabaseAndUser } from "./utils.server";

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

export const triggerOpenApiAnalysisFn = createServerFn({ method: "POST" })
    .inputValidator((data) =>
        z.object({ videoIds: z.array(z.string()) }).parse(data),
    )
    .handler(async ({ data }) => {
        const { user } = await getSupabaseAndUser();

        const baseUrl = process.env.OPENAPI_BASE_URL;
        const sharedKey = process.env.OPENAPI_SHARED_KEY;
        if (!baseUrl || !sharedKey) throw new Error("OpenAPI service unavailable");

        const uniqueVideoIds = Array.from(new Set(data.videoIds.filter(Boolean)));
        if (uniqueVideoIds.length === 0) throw new Error("Missing videoIds");

        const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
        const url = new URL("openapi/analysis", normalizedBase);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-openapi-key": sharedKey,
            },
            body: JSON.stringify({
                userId: user.id,
                videoIds: uniqueVideoIds,
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
                ? `Analysis error: ${errorValue}`
                : `Analysis request failed (${response.status})`;
            throw new Error(message);
        }

        if (!payload || typeof payload !== "object" || !("candidateCount" in payload)) {
            throw new Error("OpenAPI response invalid");
        }

        return payload as OpenApiAnalysisResponse
    });
