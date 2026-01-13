import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Video } from "~/schema";
import { getSupabaseAndUser } from "./utils.server";

export type VideoWithStatus = Video & {
  status: "pending" | "completed" | "failed";
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

    const {
      data: videos,
      error,
      count,
    } = await supabase
      .from("videos")
      .select("*, video_analyses(status)", { count: "exact" })
      .eq("user_id", user.id)
      .order("published_at", { ascending: false })
      .order("created_at", { referencedTable: "video_analyses", ascending: false })
      .limit(1, { referencedTable: "video_analyses" })
      .range(start, end);

    if (error) throw error;
    const total = count ?? 0;

    return {
      videos: videos.map((itm) => {
        const status = itm.video_analyses?.[0]?.status;
        console.log("s1tatus = ", status);
        delete itm.video_analyses;
        return {
          ...itm,
          status,
        };
      }),
      total,
    };
  });

export const getVideoByIdFn = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ videoId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();
    if (!data?.videoId) throw new Error("Missing videoId");

    const { data: video, error } = await supabase
      .from("videos")
      .select("*")
      .eq("id", data.videoId)
      .single();

    if (error || !video) throw error || new Error("Video not found");

    return video as Video;
  });
