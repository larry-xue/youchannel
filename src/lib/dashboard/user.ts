import { createServerFn } from "@tanstack/react-start";
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
