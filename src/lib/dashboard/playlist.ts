import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Playlist } from "~/schema";
import { getSupabaseAndUser } from "./utils";
import { YOUCHANNEL_PLAYLIST_TITLE, YOUCHANNEL_PLAYLIST_DESCRIPTION } from "./youtube-account";

export const PLAYLISTS_QUERY_KEY = ["playlists"] as const;

export const getPlaylistsFn = createServerFn({ method: "GET" }).handler(async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { data, error } = await supabase
        .from("playlists")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return (data || []) as Playlist[];
});

export const syncPlaylistsFn = createServerFn({ method: "POST" }).handler(async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { data: account, error: accountError } = await supabase
        .from("youtube_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider", "google")
        .maybeSingle();

    if (accountError || !account)
        throw accountError || new Error("YouTube account not found");

    let accessToken = account.access_token;
    const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;

    if (!expiresAt || Date.now() > expiresAt - 60_000) {
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

    const { fetchPlaylistSummaries } = await import("~/lib/server/youtube");
    const playlistSummaries = await fetchPlaylistSummaries(accessToken);
    if (playlistSummaries.length === 0) {
        throw new Error("No YouTube playlists found for this account");
    }

    const { data: existingPlaylists, error: existingError } = await supabase
        .from("playlists")
        .select("playlist_id, is_active")
        .eq("user_id", user.id);

    if (existingError) throw existingError;

    const activeByPlaylist = new Map(
        (existingPlaylists || []).map((playlist) => [
            playlist.playlist_id,
            playlist.is_active,
        ]),
    );
    const hasActive = (existingPlaylists || []).some((playlist) => playlist.is_active);

    const upsertPayload = playlistSummaries.map((summary, index) => ({
        user_id: user.id,
        youtube_account_id: account.id,
        playlist_id: summary.playlistId,
        title: summary.title,
        description: summary.description,
        thumbnail_url: summary.thumbnailUrl,
        custom_url: summary.customUrl,
        is_active: activeByPlaylist.get(summary.playlistId) ?? (!hasActive && index === 0),
    }));

    const { error: upsertError } = await supabase
        .from("playlists")
        .upsert(upsertPayload, { onConflict: "user_id,playlist_id" });

    if (upsertError) throw upsertError;

    return { total: playlistSummaries.length };
});

export const setActivePlaylistFn = createServerFn({ method: "POST" })
    .inputValidator((data) => z.object({ playlistId: z.string() }).parse(data))
    .handler(async ({ data }) => {
        const { supabase, user } = await getSupabaseAndUser();
        if (!data?.playlistId) throw new Error("Missing playlistId");

        const { error: resetError } = await supabase
            .from("playlists")
            .update({ is_active: false })
            .eq("user_id", user.id);
        if (resetError) throw resetError;

        const { error } = await supabase
            .from("playlists")
            .update({ is_active: true })
            .eq("id", data.playlistId)
            .eq("user_id", user.id);

        if (error) throw error;
        return { success: true };
    });

// Restore a lost playlist by creating a new one on YouTube
export const restorePlaylistFn = createServerFn({ method: "POST" })
    .inputValidator((data) => z.object({ playlistId: z.string() }).parse(data))
    .handler(async ({ data }) => {
        const { supabase, user } = await getSupabaseAndUser();
        if (!data?.playlistId) throw new Error("Missing playlistId");

        // Get the playlist
        const { data: playlist, error: playlistError } = await supabase
            .from("playlists")
            .select("*")
            .eq("id", data.playlistId)
            .eq("user_id", user.id)
            .single();

        if (playlistError || !playlist)
            throw playlistError || new Error("Playlist not found");

        if (playlist.entry_status !== "lost") {
            throw new Error("Playlist is not in lost status");
        }

        if (!playlist.youtube_account_id) {
            throw new Error("Playlist is not connected to a YouTube account");
        }

        // Get the YouTube account
        const { data: account, error: accountError } = await supabase
            .from("youtube_accounts")
            .select("*")
            .eq("id", playlist.youtube_account_id)
            .single();

        if (accountError || !account)
            throw accountError || new Error("YouTube account not found");

        // Refresh token if needed
        let accessToken = account.access_token;
        const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;

        if (!expiresAt || Date.now() > expiresAt - 60_000) {
            const { refreshAccessToken } = await import("~/lib/server/youtube");
            try {
                const refreshed = await refreshAccessToken(account.refresh_token);
                accessToken = refreshed.access_token;

                const updatedExpiresAt = new Date(
                    Date.now() + refreshed.expires_in * 1000,
                ).toISOString();

                await supabase
                    .from("youtube_accounts")
                    .update({
                        access_token: accessToken,
                        refresh_token: refreshed.refresh_token || account.refresh_token,
                        expires_at: updatedExpiresAt,
                    })
                    .eq("id", account.id);
            } catch {
                throw new Error("Failed to refresh authorization. Please re-authorize.");
            }
        }

        // Create a new playlist on YouTube
        const { createYouTubePlaylist } = await import("~/lib/server/youtube");
        const createdPlaylist = await createYouTubePlaylist(
            accessToken,
            playlist.title || YOUCHANNEL_PLAYLIST_TITLE,
            playlist.description || YOUCHANNEL_PLAYLIST_DESCRIPTION,
            "private",
        );

        // Update the playlist record with new playlist_id and reset status
        const { error: updateError } = await supabase
            .from("playlists")
            .update({
                playlist_id: createdPlaylist.playlistId,
                title: createdPlaylist.title,
                description: createdPlaylist.description,
                entry_status: "active",
            })
            .eq("id", playlist.id);

        if (updateError) throw updateError;

        return {
            success: true,
            newPlaylistId: createdPlaylist.playlistId,
            title: createdPlaylist.title,
        };
    });
