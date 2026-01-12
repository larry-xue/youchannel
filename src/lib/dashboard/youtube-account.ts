import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "./utils.server";
export const Fluentlyby_PLAYLIST_TITLE = "Fluentlyby AI";
export const Fluentlyby_PLAYLIST_DESCRIPTION = "Add videos here for AI analysis";

export const getYouTubeAccountStatusFn = createServerFn({ method: "GET" }).handler(async () => {
    const { supabase, user } = await getSupabaseAndUser();

    if (!user) return { hasAccount: false };

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
        const { exchangeCodeForTokens } = await import("~/lib/server/youtube");
        const token = await exchangeCodeForTokens(data.code);
        const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

        // Save or update YouTube account
        const { data: existingAccount } = await supabase
            .from("youtube_accounts")
            .select("*")
            .eq("user_id", user.id)
            .eq("provider", "google")
            .maybeSingle();

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
        }

        return { success: true };
    });
