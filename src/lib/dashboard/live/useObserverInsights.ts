import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { runObserverFn, type ObserverResponse, type ObserverTurn } from "./observer";
import type { Message } from "~/lib/gemini/useGeminiLive";

type ObserverOutput = {
  id: string;
  createdAt: number;
  toolName: string;
  payload: NonNullable<ObserverResponse["toolResult"]>;
};

function asTurns(messages: Message[]): ObserverTurn[] {
  return messages.slice(-12).map((message) => ({
    turnId: message.id,
    speaker: message.role === "user" ? "USER" : "AI",
    text: message.content,
    timestamp: message.timestamp.toISOString(),
  }));
}

function buildHash(payload: NonNullable<ObserverResponse["toolResult"]>) {
  return `tool:${payload.toolName}:${JSON.stringify(payload.output)}`.slice(0, 128);
}

export function useObserverInsights(uiLocale: string) {
  const [outputs, setOutputs] = useState<ObserverOutput[]>([]);
  const [sessionId] = useState(() => crypto.randomUUID());

  const mutation = useMutation({
    mutationFn: async (turns: ObserverTurn[]) => {
      if (turns.length === 0) return { toolResult: null } as ObserverResponse;

      const recentOutputs = outputs.slice(-5).map((entry) => ({
        toolName: entry.payload.toolName,
        hash: buildHash(entry.payload),
        turnId:
          typeof entry.payload.output.turnId === "string"
            ? entry.payload.output.turnId
            : entry.id,
        ts: entry.createdAt,
      }));

      return runObserverFn({
        data: {
          sessionId,
          uiLocale,
          turns,
          recentOutputs,
        },
      });
    },
    onSuccess: (result) => {
      const toolResult = result?.toolResult;
      if (!toolResult) return;
      setOutputs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          toolName: toolResult.toolName,
          payload: toolResult,
        },
      ]);
    },
    onError: (error) => {
      console.error("Observer mutation failed", error);
    },
  });

  const lastError = mutation.error;
  const lastResult = mutation.data;

  const triggerFromMessages = useMemo(
    () => (messages: Message[]) => {
      const turns = asTurns(messages);
      mutation.mutate(turns);
    },
    [mutation],
  );

  return {
    outputs,
    lastResult,
    error: lastError,
    isRunning: mutation.isPending,
    triggerFromMessages,
  };
}
