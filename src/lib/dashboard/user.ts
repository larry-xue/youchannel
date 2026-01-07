import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "./utils.server";

// User quota type
export type UserQuota = {
    analysis_count: number;
    max_analyses: number;
};

export const USER_QUOTA_QUERY_KEY = ["user-quota"] as const;

// Get user quota
export const getUserQuotaFn = createServerFn({ method: "GET" }).handler(async () => {
    const { supabase, user } = await getSupabaseAndUser();

    const { data: quota, error } = await supabase
        .from("user_quotas")
        .select("analysis_count, max_analyses")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) throw error;

    // Return default values if no quota record exists
    return (quota || { analysis_count: 0, max_analyses: 3 }) as UserQuota;
});

// Get sync logs for a playlist
export const getSyncLogsFn = createServerFn({ method: "POST" })
    .inputValidator((data) =>
        z.object({ playlistId: z.string().optional(), limit: z.number().optional() }).parse(data),
    )
    .handler(async ({ data }) => {
        const { supabase, user } = await getSupabaseAndUser();

        let query = supabase
            .from("sync_logs")
            .select("*")
            .eq("user_id", user.id)
            .order("started_at", { ascending: false })
            .limit(data?.limit || 10);

        if (data?.playlistId) {
            query = query.eq("playlist_id", data.playlistId);
        }

        const { data: logs, error } = await query;

        if (error) throw error;
        return logs || [];
    });
