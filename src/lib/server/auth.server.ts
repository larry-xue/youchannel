import { createServerClient } from "@supabase/ssr";

const getEnvValue = (key: string) => {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  return process.env[key] ?? metaEnv?.[key];
};

export const getBaseUrl = () => {
  const baseUrl = getEnvValue("VITE_BASE_URL");
  if (!baseUrl) throw new Error("Missing VITE_BASE_URL");
  return baseUrl;
};

export async function getSupabaseServerClient() {
  const { getCookies, setCookie } = await import("@tanstack/react-start/server");
  const supabaseUrl = getEnvValue("VITE_SUPABASE_URL") ?? getEnvValue("SUPABASE_URL");
  const supabaseAnonKey =
    getEnvValue("VITE_SUPABASE_ANON_KEY") ?? getEnvValue("SUPABASE_ANON_KEY");

  if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL");
  if (!supabaseAnonKey) throw new Error("Missing VITE_SUPABASE_ANON_KEY");

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({
          name,
          value,
        }));
      },
      setAll(
        cookies: Array<{
          name: string;
          value: string;
          options?: Parameters<typeof setCookie>[2];
        }>,
      ) {
        cookies.forEach(({ name, value, options }) => {
          setCookie(name, value, options);
        });
      },
    },
  });
}

export const auth = {
  signOut: async () => {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  getSession: async () => {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  },

  getUser: async () => {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  },
};
