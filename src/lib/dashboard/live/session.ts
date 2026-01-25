import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseAndUser>>["supabase"];

let liveSessionMessagesUniqueConstraint: "unknown" | "missing" | "present" = "unknown";
let hasLoggedMissingLiveSessionMessagesUniqueConstraint = false;

async function writeLiveSessionMessages(
  supabase: SupabaseClient,
  messageRows: Array<Record<string, unknown>>,
  context: "append" | "finalize",
) {
  const insertFallback = async () => {
    const { error } = await supabase.from("live_session_messages").insert(messageRows);
    return { error };
  };

  if (liveSessionMessagesUniqueConstraint === "missing") {
    return insertFallback();
  }

  try {
    const { error } = await supabase.from("live_session_messages").upsert(messageRows, {
      onConflict: "live_session_id,client_message_id",
      ignoreDuplicates: true,
    });

    if (!error) {
      liveSessionMessagesUniqueConstraint = "present";
      return { error: null };
    }

    if (error.message?.includes("no unique or exclusion constraint")) {
      liveSessionMessagesUniqueConstraint = "missing";
      if (!hasLoggedMissingLiveSessionMessagesUniqueConstraint) {
        console.warn(
          `[LiveSync] Unique constraint not found (${context}); falling back to insert`,
        );
        hasLoggedMissingLiveSessionMessagesUniqueConstraint = true;
      }
      return insertFallback();
    }

    return { error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("no unique or exclusion constraint")) {
      liveSessionMessagesUniqueConstraint = "missing";
      if (!hasLoggedMissingLiveSessionMessagesUniqueConstraint) {
        console.warn(
          `[LiveSync] Unique constraint not found (${context}); falling back to insert`,
        );
        hasLoggedMissingLiveSessionMessagesUniqueConstraint = true;
      }
      return insertFallback();
    }
    throw err;
  }
}

const messageSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  timestamp: z.string().datetime(),
  /** Monotonically increasing sequence number for ordering */
  sequenceNumber: z.number().int().positive().optional(),
});

const sessionSchema = z.object({
  sessionId: z.string().uuid(),
  uiLocale: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
});

const sessionStartSchema = sessionSchema.omit({ endedAt: true });

const storeLiveSessionSchema = z.object({
  session: sessionSchema,
  messages: z.array(messageSchema).min(1).max(200),
});

const createLiveSessionSchema = z.object({
  session: sessionStartSchema,
});

const finalizeLiveSessionSchema = storeLiveSessionSchema.extend({
  liveSessionId: z.string().uuid(),
});

const appendMessagesSchema = z.object({
  liveSessionId: z.string().uuid(),
  messages: z.array(messageSchema).min(1).max(50),
});

const closeLiveSessionSchema = z.object({
  liveSessionId: z.string().uuid(),
  session: sessionSchema,
});

function formatTitleTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export const createLiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => createLiveSessionSchema.parse(data))
  .handler(async ({ data }) => {
    console.log("[LiveSync] Server: createLiveSession", {
      sessionId: data.session.sessionId,
      uiLocale: data.session.uiLocale,
    });
    const { supabase, user } = await getSupabaseAndUser();

    const title = `${formatTitleTimestamp(data.session.startedAt)}`;

    const { data: liveSession, error: liveSessionError } = await supabase
      .from("live_sessions")
      .insert({
        user_id: user.id,
        title,
        metadata: {
          type: "live_session",
          sessionId: data.session.sessionId,
          uiLocale: data.session.uiLocale,
          startedAt: data.session.startedAt,
        },
      })
      .select("id")
      .single();

    if (liveSessionError || !liveSession) {
      throw new Error(liveSessionError?.message || "Failed to create live session");
    }

    return { liveSessionId: liveSession.id };
  });

export const finalizeLiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => finalizeLiveSessionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();

    const title = `${formatTitleTimestamp(data.session.startedAt)}`;

    const { error: updateError } = await supabase
      .from("live_sessions")
      .update({
        title,
        metadata: {
          type: "live_session",
          sessionId: data.session.sessionId,
          uiLocale: data.session.uiLocale,
          startedAt: data.session.startedAt,
          endedAt: data.session.endedAt,
        },
      })
      .eq("id", data.liveSessionId);

    if (updateError) {
      throw new Error(updateError.message || "Failed to update live session");
    }

    const messageRows = data.messages.map((message, index) => ({
      live_session_id: data.liveSessionId,
      role: message.role, // Already "user" | "assistant" from client
      content: message.content,
      metadata: {
        source: "live",
      },
      created_at: message.timestamp,
      sequence_number: message.sequenceNumber ?? index + 1,
      client_message_id: message.id ?? null,
    }));

    const { error: messageError } = await writeLiveSessionMessages(
      supabase,
      messageRows,
      "finalize",
    );

    if (messageError) {
      throw new Error(messageError.message || "Failed to save live messages");
    }

    return { liveSessionId: data.liveSessionId };
  });

export const appendLiveSessionMessagesFn = createServerFn({ method: "POST" })
  .inputValidator((data) => appendMessagesSchema.parse(data))
  .handler(async ({ data }) => {
    console.log("[LiveSync] Server: appendLiveSessionMessages", {
      liveSessionId: data.liveSessionId,
      messageCount: data.messages.length,
      roles: data.messages.map((m) => m.role),
      firstMessageId: data.messages[0]?.id,
    });
    const { supabase } = await getSupabaseAndUser();

    const messageRows = data.messages.map((message) => ({
      live_session_id: data.liveSessionId,
      role: message.role, // Already "user" | "assistant" from client
      content: message.content,
      metadata: {
        source: "live",
      },
      created_at: message.timestamp,
      // Include sequence_number and client_message_id for ordering and deduplication
      sequence_number: message.sequenceNumber ?? null,
      client_message_id: message.id ?? null,
    }));

    const { error: messageError } = await writeLiveSessionMessages(
      supabase,
      messageRows,
      "append",
    );

    if (messageError) {
      // Log but don't throw on duplicate key violations - they're expected during retries
      // (only possible when the unique constraint exists)
      if (messageError.code === "23505") {
        console.warn("Duplicate messages detected, some may have been skipped");
        return { inserted: 0, skippedDuplicates: true };
      }
      throw new Error(messageError.message || "Failed to append live messages");
    }

    return { inserted: messageRows.length };
  });

export const closeLiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => closeLiveSessionSchema.parse(data))
  .handler(async ({ data }) => {
    console.log("[LiveSync] Server: closeLiveSession", {
      liveSessionId: data.liveSessionId,
    });
    const { supabase } = await getSupabaseAndUser();

    const title = `${formatTitleTimestamp(data.session.startedAt)}`;

    const { error: updateError } = await supabase
      .from("live_sessions")
      .update({
        title,
        metadata: {
          type: "live_session",
          sessionId: data.session.sessionId,
          uiLocale: data.session.uiLocale,
          startedAt: data.session.startedAt,
          endedAt: data.session.endedAt,
        },
      })
      .eq("id", data.liveSessionId);

    if (updateError) {
      throw new Error(updateError.message || "Failed to close live session");
    }

    return { liveSessionId: data.liveSessionId };
  });

export const storeLiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => storeLiveSessionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();

    const title = `${formatTitleTimestamp(data.session.startedAt)}`;

    const { data: liveSession, error: liveSessionError } = await supabase
      .from("live_sessions")
      .insert({
        user_id: user.id,
        title,
        metadata: {
          type: "live_session",
          sessionId: data.session.sessionId,
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

    const messageRows = data.messages.map((message, index) => ({
      live_session_id: liveSession.id,
      role: message.role, // Already "user" | "assistant" from client
      content: message.content,
      metadata: {
        source: "live",
      },
      created_at: message.timestamp,
      sequence_number: message.sequenceNumber ?? index + 1,
      client_message_id: message.id ?? null,
    }));

    const { error: messageError } = await supabase
      .from("live_session_messages")
      .insert(messageRows);

    if (messageError) {
      throw new Error(messageError.message || "Failed to save live messages");
    }

    return { sessionId: liveSession.id };
  });
