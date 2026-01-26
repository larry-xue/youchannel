import { createFileRoute } from "@tanstack/react-router";
import { FullPageLoader } from "~/lib/components/FullPageLoader";
import { LivePage } from "./live";

export const Route = createFileRoute("/_layout/live/$sessionId")({
  component: LiveSessionRoute,
  pendingComponent: () => <FullPageLoader />,
});

function LiveSessionRoute() {
  const { sessionId } = Route.useParams();
  return <LivePage key={sessionId} />;
}
