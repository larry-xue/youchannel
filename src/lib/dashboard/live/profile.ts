import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

export type LiveUserProfile = {
  currentVersion: number;
  onboardingCompletedAt: string | null;
  manualText: string;
  data: Record<string, unknown>;
  source: Record<string, unknown>;
  createdAt: string;
};

export const getLiveUserProfileFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ profile: LiveUserProfile | null }> => {
    const { supabase, user } = await getSupabaseAndUser();

    const { data: profileRow, error: profileError } = await supabase
      .from("live_user_profiles")
      .select("current_version,onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message || "Failed to load live profile");
    }

    const currentVersion =
      typeof profileRow?.current_version === "number" ? profileRow.current_version : 0;

    if (currentVersion <= 0) {
      return { profile: null };
    }

    const { data: versionRow, error: versionError } = await supabase
      .from("live_user_profile_versions")
      .select("version,manual_text,data,source,created_at")
      .eq("user_id", user.id)
      .eq("version", currentVersion)
      .single();

    if (versionError || !versionRow) {
      throw new Error(versionError?.message || "Failed to load live profile version");
    }

    return {
      profile: {
        currentVersion,
        onboardingCompletedAt: profileRow?.onboarding_completed_at ?? null,
        manualText: versionRow.manual_text as string,
        data: (versionRow.data as Record<string, unknown> | null) ?? {},
        source: (versionRow.source as Record<string, unknown> | null) ?? {},
        createdAt: versionRow.created_at as string,
      },
    };
  },
);

const createLiveUserProfileVersionSchema = z.object({
  manualText: z.string().min(1).max(20000),
  data: z.record(z.unknown()).optional().default({}),
  source: z.record(z.unknown()).optional().default({}),
});

const createLiveUserProfileVersionRpcSchema = z
  .array(
    z.object({
      version: z.number().int(),
    }),
  )
  .min(1);

export const createLiveUserProfileVersionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => createLiveUserProfileVersionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();

    const { data: rpcData, error } = await supabase.rpc(
      "create_live_user_profile_version",
      {
        p_manual_text: data.manualText,
        p_data: data.data,
        p_source: data.source,
      },
    );

    if (error) {
      throw new Error(error.message || "Failed to save live profile");
    }

    const parsed = createLiveUserProfileVersionRpcSchema.safeParse(rpcData);
    if (!parsed.success) {
      throw new Error("Unexpected response saving live profile");
    }

    return { version: parsed.data[0].version };
  });

