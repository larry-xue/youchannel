import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tasks")({
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
