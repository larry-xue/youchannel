import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

type LiveSessionMetadata = {
  personaId?: string;
  personaName?: string;
  voice?: string;
  uiLocale?: string;
  startedAt?: string;
  endedAt?: string;
};

export type LiveSessionHistoryEntry = {
  id: string;
  title: string;
  createdAt: string;
  metadata: LiveSessionMetadata | null;
  messageCount: number;
  lastMessage: {
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
  } | null;
};

export const getLiveSessionHistoryFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase } = await getSupabaseAndUser();

    const { data: sessions, error: sessionsError } = await supabase
      .from("live_sessions")
      .select("id,title,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (sessionsError) {
      throw new Error(sessionsError.message || "Failed to load live sessions");
    }

    if (!sessions || sessions.length === 0) {
      return { sessions: [] as LiveSessionHistoryEntry[] };
    }

    const sessionIds = sessions.map((session) => session.id);

    const { data: messages, error: messagesError } = await supabase
      .from("live_session_messages")
      .select("live_session_id,role,content,created_at")
      .in("live_session_id", sessionIds)
      .order("created_at", { ascending: false });

    if (messagesError) {
      throw new Error(messagesError.message || "Failed to load live messages");
    }

    const messageStats = new Map<
      string,
      {
        count: number;
        lastMessage: LiveSessionHistoryEntry["lastMessage"];
      }
    >();

    for (const message of messages ?? []) {
      const entry = messageStats.get(message.live_session_id) ?? {
        count: 0,
        lastMessage: null,
      };
      entry.count += 1;
      if (!entry.lastMessage) {
        entry.lastMessage = {
          role: message.role as "user" | "assistant" | "system",
          content: message.content,
          createdAt: message.created_at,
        };
      }
      messageStats.set(message.live_session_id, entry);
    }

    const history = sessions.map((session) => {
      const stats = messageStats.get(session.id) ?? {
        count: 0,
        lastMessage: null,
      };

      return {
        id: session.id,
        title: session.title,
        createdAt: session.created_at,
        metadata: (session.metadata as LiveSessionMetadata | null) ?? null,
        messageCount: stats.count,
        lastMessage: stats.lastMessage,
      };
    });

    return { sessions: history };
  },
);

const liveSessionDetailSchema = z.object({
  sessionId: z.string().uuid(),
});

export type LiveSessionDetailMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type LiveSessionDetail = {
  id: string;
  title: string;
  createdAt: string;
  metadata: LiveSessionMetadata | null;
  messages: LiveSessionDetailMessage[];
};

export const getLiveSessionDetailFn = createServerFn({ method: "POST" })
  .inputValidator((data) => liveSessionDetailSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();

    const { data: session, error: sessionError } = await supabase
      .from("live_sessions")
      .select("id,title,metadata,created_at")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error(sessionError?.message || "Live session not found");
    }

    const { data: messages, error: messagesError } = await supabase
      .from("live_session_messages")
      .select("id,role,content,metadata,created_at")
      .eq("live_session_id", session.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw new Error(messagesError.message || "Failed to load live session");
    }

    return {
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.created_at,
        metadata: (session.metadata as LiveSessionMetadata | null) ?? null,
      },
      messages: (messages ?? []).map((message) => ({
        id: message.id,
        role: message.role as "user" | "assistant" | "system",
        content: message.content,
        createdAt: message.created_at,
        metadata: (message.metadata as Record<string, unknown> | null) ?? null,
      })),
    };
  });
