import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

const suggestionTypeSchema = z.enum([
  "grammar",
  "vocabulary",
  "pronunciation",
  "fluency",
  "comprehension",
  "other",
]);

const suggestionSchema = z.object({
  type: suggestionTypeSchema,
  text: z.string().min(1).max(220),
  example: z.string().min(1).max(120).optional().nullable(),
  confidence: z.number().min(0).max(1),
});

const observerOutputSchema = z.object({
  clientOutputId: z.string().uuid(),
  transcript: z.string().min(1),
  suggestions: z.array(suggestionSchema).max(6),
  confidence: z.number().min(0).max(1),
  uiLocale: z.string().min(2),
  createdAt: z.string().datetime(),
});

const appendObserverOutputSchema = z.object({
  liveSessionId: z.string().uuid(),
  output: observerOutputSchema,
});

const observerOutputsQuerySchema = z.object({
  liveSessionId: z.string().uuid(),
});

type ObserverSuggestion = z.infer<typeof suggestionSchema>;

export type LiveObserverOutputRecord = {
  id: string;
  clientOutputId: string;
  transcript: string;
  suggestions: ObserverSuggestion[];
  confidence: number;
  uiLocale: string;
  createdAt: string;
};

export const appendLiveObserverOutputFn = createServerFn({ method: "POST" })
  .inputValidator((data) => appendObserverOutputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();
    const { output } = data;

    const { error } = await supabase
      .from("live_session_observer_outputs")
      .upsert(
        {
          live_session_id: data.liveSessionId,
          client_output_id: output.clientOutputId,
          transcript: output.transcript,
          suggestions: output.suggestions,
          confidence: output.confidence,
          ui_locale: output.uiLocale,
          created_at: output.createdAt,
        },
        { onConflict: "live_session_id,client_output_id" },
      );

    if (error) {
      throw new Error(error.message || "Failed to save observer output");
    }

    return { saved: true };
  });

export const getLiveObserverOutputsFn = createServerFn({ method: "POST" })
  .inputValidator((data) => observerOutputsQuerySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();

    const { data: rows, error } = await supabase
      .from("live_session_observer_outputs")
      .select(
        "id,client_output_id,transcript,suggestions,confidence,ui_locale,created_at",
      )
      .eq("live_session_id", data.liveSessionId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Failed to load observer outputs");
    }

    const outputs: LiveObserverOutputRecord[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      clientOutputId: row.client_output_id as string,
      transcript: row.transcript as string,
      suggestions: (row.suggestions as ObserverSuggestion[]) ?? [],
      confidence: row.confidence as number,
      uiLocale: row.ui_locale as string,
      createdAt: row.created_at as string,
    }));

    return { outputs };
  });
