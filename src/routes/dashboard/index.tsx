import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  loader: ({ location }) => {
    const search = location.search as { code?: string; state?: string; error?: string };
    if (search?.code && search?.state) {
      throw redirect({ to: "/dashboard/channels", search });
    }
    throw redirect({ to: "/dashboard/channels" });
  },
});
