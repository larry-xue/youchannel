import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "./utils";

export const YOUCHANNEL_PLAYLIST_TITLE = "YouChannel AI";
export const YOUCHANNEL_PLAYLIST_DESCRIPTION = "Add videos here for AI analysis";

export const getYouTubeAccountStatusFn = createServerFn({ method: "GET" }).handler(async () => {
    const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
    const supabase = await getSupabaseServerClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) return { hasAccount: false };

    const { data: account, error: accountError } = await supabase
        .from("youtube_accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (accountError) throw accountError;

    return { hasAccount: Boolean(account) };
});

export const startYouTubeOAuthFn = createServerFn({ method: "POST" }).handler(
    async () => {
        const { supabase, user } = await getSupabaseAndUser();
        const { randomUUID } = await import("crypto");
        const state = randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        const { error } = await supabase.from("youtube_oauth_states").insert({
            user_id: user.id,
            state,
            expires_at: expiresAt,
        });

        if (error) throw error;

        const { buildYouTubeAuthUrl } = await import("~/lib/server/youtube");
        return { url: buildYouTubeAuthUrl(state) };
    },
);

export const completeYouTubeOauthFn = createServerFn({ method: "POST" })
    .inputValidator((data) => z.object({ code: z.string(), state: z.string() }).parse(data))
    .handler(async ({ data }) => {
        const { supabase, user } = await getSupabaseAndUser();

        // Validate OAuth state
        const { data: stateRow, error: stateError } = await supabase
            .from("youtube_oauth_states")
            .select("*")
            .eq("state", data.state)
            .eq("user_id", user.id)
            .maybeSingle();

        if (stateError || !stateRow) throw new Error("Invalid OAuth state");

        const expiresAt = new Date(stateRow.expires_at).getTime();
        if (Date.now() > expiresAt) {
            throw new Error("OAuth state expired. Please connect again.");
        }

        await supabase.from("youtube_oauth_states").delete().eq("id", stateRow.id);

        // Exchange code for tokens
        const { exchangeCodeForTokens, createYouTubePlaylist, findPlaylistByTitle } =
            await import("~/lib/server/youtube");
        const token = await exchangeCodeForTokens(data.code);
        const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

        // Save or update YouTube account
        const { data: existingAccount } = await supabase
            .from("youtube_accounts")
            .select("*")
            .eq("user_id", user.id)
            .eq("provider", "google")
            .maybeSingle();

        let accountId = existingAccount?.id;

        if (existingAccount) {
            const refreshToken = token.refresh_token || existingAccount.refresh_token;
            if (!refreshToken) throw new Error("Missing refresh token");

            const { error: updateError } = await supabase
                .from("youtube_accounts")
                .update({
                    access_token: token.access_token,
                    refresh_token: refreshToken,
                    expires_at: tokenExpiresAt,
                    scope: token.scope || existingAccount.scope,
                    token_type: token.token_type || existingAccount.token_type,
                })
                .eq("id", existingAccount.id);

            if (updateError) throw updateError;
        } else {
            if (!token.refresh_token) throw new Error("Missing refresh token");

            const { data: inserted, error: insertError } = await supabase
                .from("youtube_accounts")
                .insert({
                    user_id: user.id,
                    provider: "google",
                    access_token: token.access_token,
                    refresh_token: token.refresh_token,
                    expires_at: tokenExpiresAt,
                    scope: token.scope,
                    token_type: token.token_type,
                })
                .select()
                .single();

            if (insertError || !inserted) throw insertError || new Error("Account save failed");
            accountId = inserted.id;
        }

        const existingPlaylists = await supabase
            .from("playlists")
            .select("playlist_id, is_active")
            .eq("user_id", user.id);

        if (existingPlaylists.error) throw existingPlaylists.error;

        const hasActive = (existingPlaylists.data || []).some((item) => item.is_active);

        const existingPlaylist = await findPlaylistByTitle(
            token.access_token,
            YOUCHANNEL_PLAYLIST_TITLE,
        );

        const createdPlaylist = existingPlaylist
            ? null
            : await createYouTubePlaylist(
                token.access_token,
                YOUCHANNEL_PLAYLIST_TITLE,
                YOUCHANNEL_PLAYLIST_DESCRIPTION,
                "private",
            );

        const playlistId = existingPlaylist?.playlistId || createdPlaylist?.playlistId;
        if (!playlistId) throw new Error("Unable to resolve YouChannel playlist");

        const isActive = !hasActive
            ? true
            : (existingPlaylists.data || []).some(
                (item) => item.is_active && item.playlist_id === playlistId,
            );

        const playlistTitle =
            existingPlaylist?.title || createdPlaylist?.title || YOUCHANNEL_PLAYLIST_TITLE;
        const playlistDescription =
            existingPlaylist?.description || createdPlaylist?.description || YOUCHANNEL_PLAYLIST_DESCRIPTION;

        const upsertResult = await supabase
            .from("playlists")
            .upsert(
                {
                    user_id: user.id,
                    youtube_account_id: accountId,
                    playlist_id: playlistId,
                    title: playlistTitle,
                    description: playlistDescription,
                    thumbnail_url: existingPlaylist?.thumbnailUrl || null,
                    custom_url: existingPlaylist?.customUrl || null,
                    is_active: isActive,
                },
                { onConflict: "user_id,playlist_id" },
            )
            .select("id")
            .single();

        if (upsertResult.error) {
            const fallback = await supabase
                .from("playlists")
                .select("id")
                .eq("user_id", user.id)
                .eq("playlist_id", playlistId)
                .maybeSingle();

            if (fallback.error || !fallback.data) throw upsertResult.error;
        }

        const { error: statusUpdateError } = await supabase
            .from("playlists")
            .update({ entry_status: "active" })
            .eq("user_id", user.id)
            .eq("entry_status", "auth_invalid");

        if (statusUpdateError) throw statusUpdateError;

        return { success: true, playlistTitle: playlistTitle || YOUCHANNEL_PLAYLIST_TITLE };
    });
