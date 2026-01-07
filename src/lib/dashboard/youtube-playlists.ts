import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "./utils.server";

async function getYouTubeAccessToken() {
  const { supabase, user } = await getSupabaseAndUser();
  const { data: account, error: accountError } = await supabase
    .from("youtube_accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (accountError || !account) {
    throw accountError || new Error("YouTube account not found");
  }

  let accessToken = account.access_token;
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;

  if (!expiresAt || Date.now() > expiresAt - 60_000) {
    if (!account.refresh_token) throw new Error("Missing refresh token");
    const { refreshAccessToken } = await import("~/lib/server/youtube");
    const refreshed = await refreshAccessToken(account.refresh_token);
    accessToken = refreshed.access_token;

    const updatedExpiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000,
    ).toISOString();

    const { error: updateError } = await supabase
      .from("youtube_accounts")
      .update({
        access_token: accessToken,
        refresh_token: refreshed.refresh_token || account.refresh_token,
        expires_at: updatedExpiresAt,
        scope: refreshed.scope || account.scope,
        token_type: refreshed.token_type || account.token_type,
      })
      .eq("id", account.id);

    if (updateError) throw updateError;
  }

  return accessToken;
}

export const getYouTubePlaylistsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const accessToken = await getYouTubeAccessToken();
    const { fetchPlaylistSummaries } = await import("~/lib/server/youtube");
    return fetchPlaylistSummaries(accessToken, { allowEmpty: true });
  },
);

export const getYouTubePlaylistItemsFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        playlistId: z.string(),
        pageToken: z.string().optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const accessToken = await getYouTubeAccessToken();
    const { fetchPlaylistVideosPage } = await import("~/lib/server/youtube");
    const pageSize = data.pageSize ?? 50;

    return fetchPlaylistVideosPage(accessToken, data.playlistId, {
      pageToken: data.pageToken,
      pageSize,
    });
  });
