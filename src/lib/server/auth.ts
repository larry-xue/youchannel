import { createServerFn } from "@tanstack/react-start";

/**
 * Server function to sign out the current user.
 * Clears the Supabase session on the server side.
 */
export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return { success: true };
});
