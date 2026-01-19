import { z } from "zod";

const turnSchema = z.object({
  turnId: z.string(),
  speaker: z.enum(["USER", "AI"]),
  text: z.string(),
  timestamp: z.union([z.string(), z.number(), z.date()]),
});

const observerRequestSchema = z.object({
  sessionId: z.string().min(1),
  uiLocale: z.string().min(2),
  turns: z.array(turnSchema).min(1).max(12),
  recentOutputs: z
    .array(
      z.object({
        toolName: z.string(),
        hash: z.string(),
        turnId: z.string(),
        ts: z.number(),
      }),
    )
    .max(5)
    .optional(),
});

export type ObserverRequest = z.infer<typeof observerRequestSchema>;
export type ObserverTurn = z.infer<typeof turnSchema>;

export { observerRequestSchema, turnSchema };
