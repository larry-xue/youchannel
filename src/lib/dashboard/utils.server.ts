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
