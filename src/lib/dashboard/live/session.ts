import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

const messageSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(["user", "model"]),
  content: z.string().min(1),
  timestamp: z.string().datetime(),
});

const sessionSchema = z.object({
  sessionId: z.string().uuid(),
  personaId: z.string().min(1),
  personaName: z.string().min(1),
  voice: z.string().min(1),
  uiLocale: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
});

const storeLiveSessionSchema = z.object({
  session: sessionSchema,
  messages: z.array(messageSchema).min(1).max(200),
});

function formatTitleTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export const storeLiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => storeLiveSessionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();

    const title = `Live: ${data.session.personaName} (${formatTitleTimestamp(
      data.session.startedAt,
    )})`;

    const { data: liveSession, error: liveSessionError } = await supabase
      .from("live_sessions")
      .insert({
        user_id: user.id,
        title,
        metadata: {
          type: "live_session",
          sessionId: data.session.sessionId,
          personaId: data.session.personaId,
          personaName: data.session.personaName,
          voice: data.session.voice,
          uiLocale: data.session.uiLocale,
          startedAt: data.session.startedAt,
          endedAt: data.session.endedAt,
        },
      })
      .select("id")
      .single();

    if (liveSessionError || !liveSession) {
      throw new Error(liveSessionError?.message || "Failed to create live session");
    }

    const messageRows = data.messages.map((message) => ({
      live_session_id: liveSession.id,
      role: message.role === "model" ? "assistant" : "user",
      content: message.content,
      metadata: {
        sessionId: data.session.sessionId,
        source: "live",
      },
      created_at: message.timestamp,
    }));

    const { error: messageError } = await supabase
      .from("live_session_messages")
      .insert(messageRows);

    if (messageError) {
      throw new Error(messageError.message || "Failed to save live messages");
    }

    return { sessionId: liveSession.id };
  });
