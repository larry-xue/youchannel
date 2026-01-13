import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { VideoAnalysis } from "~/schema";
import { getSupabaseAndUser } from "./utils.server";

export type OpenApiAnalysisResponse = {
  userId: string;
  requestedCount: number;
  uniqueCount: number;
  insertedCount: number;
  existingCount: number;
  enqueued: number;
  skipped: number;
  skipReasons: {
    duration_exceeded?: number;
    already_queued?: number;
    already_completed?: number;
    quota_exceeded?: number;
    analysis_exists?: number;
    [key: string]: number | undefined;
  };
};

const VideoInputSchema = z.object({
  youtubeVideoId: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnailUrl: z.string().url(),
  publishedAt: z.string().datetime(),
  duration: z.string().regex(/^PT(\d+H)?(\d+M)?(\d+S)?$/),
  url: z.string().url(),
  raw: z.record(z.string(), z.any()).nullable().optional(),
});

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
    z
      .object({
        videos: z.array(VideoInputSchema),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { user } = await getSupabaseAndUser();

    const baseUrl = process.env.OPENAPI_BASE_URL;
    const sharedKey = process.env.OPENAPI_SHARED_KEY;
    if (!baseUrl || !sharedKey) throw new Error("OpenAPI service unavailable");

    if (data.videos.length === 0) throw new Error("Missing videos");

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
        videos: data.videos,
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

    if (!payload || typeof payload !== "object" || !("enqueued" in payload)) {
      throw new Error("OpenAPI response invalid");
    }

    return payload as OpenApiAnalysisResponse;
  });
