import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "~/lib/components/NotFound";

export const Route = createFileRoute("/$")({
  component: NotFound,
});
