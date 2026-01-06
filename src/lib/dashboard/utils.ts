export const formatDateTime = (value?: string | null) => {
  if (!value) return "Not synced yet";
  return new Date(value).toLocaleString();
};

export const formatDate = (value?: string | null) => {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleDateString();
};

type VideoRawSnippet = {
  snippet?: {
    publishedAt?: string | null;
  };
};

export const getVideoPublishedAt = (video?: {
  published_at?: string | null;
  raw?: VideoRawSnippet | null;
}) => {
  if (!video) return null;
  const rawPublishedAt = video.raw?.snippet?.publishedAt;
  return rawPublishedAt || video.published_at || null;
};

export const truncate = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length)}...` : value;

/**
 * Shared utility to get authenticated Supabase client and user.
 * Used by all dashboard API functions.
 */
export async function getSupabaseAndUser() {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("User not authenticated");
  return { supabase, user };
}
