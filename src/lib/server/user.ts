import { createServerFn } from "@tanstack/react-start";
import type { AuthUser } from "~/lib/store/auth";

export const getUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.warn("Auth error:", error);
    return null;
  }

  if (!user) return null;

  const { id, email, user_metadata, app_metadata } = user;
  return { id, email, user_metadata, app_metadata } as AuthUser;
});
