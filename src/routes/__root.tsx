import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import appCss from "~/lib/styles/app.css?url";
import { Toaster } from "~/lib/components/ui/sonner";
import { getUserFn } from "~/lib/server/user";
import { setAuthUser, type AuthStore } from "~/lib/store/auth";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  authStore: AuthStore;
}>()({
  beforeLoad: async ({ context }) => {
    const isServer = typeof window === "undefined";
    if (!isServer && context.authStore.state.status !== "unknown") {
      return { user: context.authStore.state.user };
    }
    const user = await getUserFn();
    setAuthUser(context.authStore, user);
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

        <Toaster />

        <ReactQueryDevtools buttonPosition="bottom-left" />
        <TanStackRouterDevtools position="bottom-right" />

        <Scripts />
      </body>
    </html>
  );
}
