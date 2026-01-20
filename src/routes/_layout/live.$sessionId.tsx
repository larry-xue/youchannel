import { createFileRoute } from "@tanstack/react-router";
import { LivePage } from "./live";

export const Route = createFileRoute("/_layout/live/$sessionId")({
  component: LiveSessionRoute,
});

function LiveSessionRoute() {
  return <LivePage />;
}
