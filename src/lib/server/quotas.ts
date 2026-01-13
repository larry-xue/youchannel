import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

export interface UserQuotaSummary {
  videoSecondsTotal: number;
  videoSecondsRemaining: number;
  videoSecondsUsed: number;
  videoPercent: number;
  chatSecondsTotal: number;
  chatSecondsRemaining: number;
  chatSecondsUsed: number;
  chatPercent: number;
  perVideoLimitSeconds: number | null; // null = unlimited
  periodStartAt: string | null;
  periodEndAt: string | null;
  daysRemaining: number | null; // null = long valid
}

export const getUserQuotaSummaryFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();

    const { data, error } = await supabase
      .from("user_quotas")
      .select(
        "user_id,video_seconds_total,video_seconds_remaining,chat_seconds_total,chat_seconds_remaining,max_video_seconds,period_start_at,period_end_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    // Normalize missing row to zeros
    if (!data) {
      return {
        videoSecondsTotal: 0,
        videoSecondsRemaining: 0,
        videoSecondsUsed: 0,
        videoPercent: 0,
        chatSecondsTotal: 0,
        chatSecondsRemaining: 0,
        chatSecondsUsed: 0,
        chatPercent: 0,
        perVideoLimitSeconds: null,
        periodStartAt: null,
        periodEndAt: null,
        daysRemaining: null,
      } satisfies UserQuotaSummary;
    }

    // Derive UI-ready values
    const videoTotal = data.video_seconds_total ?? 0;
    const videoRemaining = Math.max(
      0,
      Math.min(data.video_seconds_remaining ?? 0, videoTotal),
    );
    const videoUsed = Math.max(0, videoTotal - videoRemaining);
    const videoPercent =
      videoTotal > 0 ? Math.min(100, (videoUsed / videoTotal) * 100) : 0;

    const chatTotal = data.chat_seconds_total ?? 0;
    const chatRemaining = Math.max(
      0,
      Math.min(data.chat_seconds_remaining ?? 0, chatTotal),
    );
    const chatUsed = Math.max(0, chatTotal - chatRemaining);
    const chatPercent = chatTotal > 0 ? Math.min(100, (chatUsed / chatTotal) * 100) : 0;

    const perVideoLimit = data.max_video_seconds ?? 0;
    const perVideoLimitSeconds = perVideoLimit === 0 ? null : perVideoLimit;

    // Calculate days remaining
    let daysRemaining: number | null = null;
    if (data.period_end_at) {
      const endDate = new Date(data.period_end_at);
      const now = new Date();
      const diffMs = endDate.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      videoSecondsTotal: videoTotal,
      videoSecondsRemaining: videoRemaining,
      videoSecondsUsed: videoUsed,
      videoPercent,
      chatSecondsTotal: chatTotal,
      chatSecondsRemaining: chatRemaining,
      chatSecondsUsed: chatUsed,
      chatPercent,
      perVideoLimitSeconds,
      periodStartAt: data.period_start_at ?? null,
      periodEndAt: data.period_end_at ?? null,
      daysRemaining,
    } satisfies UserQuotaSummary;
  },
);
