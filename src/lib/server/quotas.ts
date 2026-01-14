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

export interface QuotaGrant {
  id: string;
  sourceType: string; // 'subscription' | 'package' | 'manual' | 'promo'
  sourceRef: string | null;
  videoSecondsTotal: number;
  videoSecondsRemaining: number;
  chatSecondsTotal: number;
  chatSecondsRemaining: number;
  maxVideoSeconds: number; // 0 = no video support
  validFrom: string;
  validTo: string | null;
  consumePriority: number;
}

export interface UserActiveQuotaResponse {
  summary: UserQuotaSummary;
  grants: QuotaGrant[];
}

export const getUserActiveQuotaFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const nowIso = new Date().toISOString();

    const { data: grantsRaw, error } = await supabase
      .from("quota_grants")
      .select(
        "id,source_type,source_ref,video_seconds_total,video_seconds_remaining,chat_seconds_total,chat_seconds_remaining,max_video_seconds,valid_from,valid_to,consume_priority,created_at",
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("valid_from", nowIso)
      .or(`valid_to.is.null,valid_to.gte.${nowIso}`)
      .order("consume_priority", { ascending: true })
      .order("valid_to", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Filter out fully consumed grants in memory (OR logic is hard in single supabase query mixed with ANDs)
    // We only want to show grants that have SOME remaining quota (video OR chat)
    const activeGrants = (grantsRaw || [])
      .filter((g) => {
        const vRem = g.video_seconds_remaining ?? 0;
        const cRem = g.chat_seconds_remaining ?? 0;
        return vRem > 0 || cRem > 0;
      })
      .map((g) => ({
        id: g.id,
        sourceType: g.source_type,
        sourceRef: g.source_ref,
        videoSecondsTotal: g.video_seconds_total,
        videoSecondsRemaining: g.video_seconds_remaining,
        chatSecondsTotal: g.chat_seconds_total,
        chatSecondsRemaining: g.chat_seconds_remaining,
        maxVideoSeconds: g.max_video_seconds,
        validFrom: g.valid_from,
        validTo: g.valid_to,
        consumePriority: g.consume_priority,
      }));

    // Aggregate Summary
    let videoTotal = 0;
    let videoRemaining = 0;
    let chatTotal = 0;
    let chatRemaining = 0;
    let maxVideoLimit = 0;
    let hasVideoSupport = false;

    let periodStartAt: string | null = null;
    let periodEndAt: string | null = null;
    let isLongValid = false;

    for (const g of activeGrants) {
      videoTotal += g.videoSecondsTotal;
      videoRemaining += g.videoSecondsRemaining;
      chatTotal += g.chatSecondsTotal;
      chatRemaining += g.chatSecondsRemaining;

      // Track max per-video limit among grants that actually have video quota remaining
      if (g.videoSecondsRemaining > 0) {
        if (g.maxVideoSeconds > 0) {
          hasVideoSupport = true;
          if (g.maxVideoSeconds > maxVideoLimit) {
            maxVideoLimit = g.maxVideoSeconds;
          }
        }
      }

      // Period calculation
      if (!periodStartAt || g.validFrom < periodStartAt) {
        periodStartAt = g.validFrom;
      }

      if (g.validTo === null) {
        isLongValid = true;
      } else {
        // Track latest expiry if not long valid yet
        if (!isLongValid) {
          if (!periodEndAt || g.validTo > periodEndAt) {
            periodEndAt = g.validTo;
          }
        }
      }
    }

    // If any grant is long valid, periodEndAt is effectively null (unlimited duration)
    if (isLongValid) {
      periodEndAt = null;
    }

    const videoUsed = Math.max(0, videoTotal - videoRemaining);
    const videoPercent =
      videoTotal > 0 ? Math.min(100, (videoUsed / videoTotal) * 100) : 0;

    const chatUsed = Math.max(0, chatTotal - chatRemaining);
    const chatPercent = chatTotal > 0 ? Math.min(100, (chatUsed / chatTotal) * 100) : 0;

    // perVideoLimitSeconds:
    // If hasVideoSupport is false (meaning all video-capable grants are 0 max_seconds, or no grants have video remaining),
    // then limit is 0 (Video Not Supported).
    // If hasVideoSupport is true, use maxVideoLimit.
    const perVideoLimitSeconds = hasVideoSupport ? maxVideoLimit : 0;

    // Calculate days remaining
    let daysRemaining: number | null = null;
    if (periodEndAt) {
      const endDate = new Date(periodEndAt);
      const now = new Date();
      const diffMs = endDate.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const summary: UserQuotaSummary = {
      videoSecondsTotal: videoTotal,
      videoSecondsRemaining: videoRemaining,
      videoSecondsUsed: videoUsed,
      videoPercent,
      chatSecondsTotal: chatTotal,
      chatSecondsRemaining: chatRemaining,
      chatSecondsUsed: chatUsed,
      chatPercent,
      perVideoLimitSeconds: perVideoLimitSeconds === 0 ? 0 : perVideoLimitSeconds, // Explicit 0
      periodStartAt,
      periodEndAt,
      daysRemaining,
    };

    return {
      summary,
      grants: activeGrants,
    } satisfies UserActiveQuotaResponse;
  },
);

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
