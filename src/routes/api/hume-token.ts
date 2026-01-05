import { fetchAccessToken } from "hume";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hume-token")({
  server: {
    handlers: {
      POST: () => new Response("Method Not Allowed", { status: 405 }),
      GET: async () => {
        const apiKey = process.env.HUME_API_KEY;
        const secretKey = process.env.HUME_SECRET_KEY;
        if (!apiKey || !secretKey) {
          return new Response("Hume credentials are not configured", { status: 500 });
        }
        try {
          const accessToken = await fetchAccessToken({
            apiKey,
            secretKey,
          });
          return Response.json({ accessToken });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch access token";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
