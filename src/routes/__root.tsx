import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import appCss from "~/lib/styles/app.css?url";

interface UserData {
  id: string;
  email?: string;
  user_metadata: { [key: string]: object };
  app_metadata: { [key: string]: object };
}

const getUser = createServerFn({ method: "GET" }).handler(async () => {
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

  // Return only serializable user data
  const { id, email, user_metadata, app_metadata } = user;
  return { id, email, user_metadata, app_metadata } as UserData;
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  beforeLoad: async ({ context }) => {
    // Use ensureQueryData to avoid redundant requests on every navigation
    // User data will be considered fresh for 24 hours
    // For "force refresh", explicitly call invalidateQueries(["user"]) on login/logout/oauth callback
    const user = await context.queryClient.ensureQueryData({
      queryKey: ["user"],
      queryFn: ({ signal }) => getUser({ signal }),
      staleTime: 24 * 60 * 60 * 1000, // 24 hours - avoids request on every navigation
    });
    return { user };
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "TanStack Supabase Router",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { readonly children: React.ReactNode }) {
  return (
    // suppress since we're updating the "dark" class in a custom script below
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ScriptOnce>
          {`document.documentElement.classList.toggle(
            'dark',
            localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
            )`}
        </ScriptOnce>

        <div className="app-shell">{children}</div>

        <ReactQueryDevtools buttonPosition="bottom-left" />
        <TanStackRouterDevtools position="bottom-right" />

        <Scripts />
      </body>
    </html>
  );
}
