import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeminiLiveStatus, Message } from "~/lib/gemini/useGeminiLive";
import { createWavBlob } from "~/lib/gemini/utils";
import {
  runLiveObserverSidecarFn,
  type LiveObserverSidecarResponse,
} from "./observer.sidecar";

type LiveObserverSpeechChunk = {
  pcm: Float32Array;
  sampleCount: number;
};

type ObserverTurn = {
  assistantTranscript: string;
  userPcm: Float32Array;
};

export type LiveObserverOutput = Omit<LiveObserverSidecarResponse, "summary"> & {
  /**
   * The sidecar always returns a running summary, but persisted history rows may
   * not include it (we only store transcript/suggestions/confidence).
   */
  summary?: LiveObserverSidecarResponse["summary"];
  id: string;
  createdAt: number;
};

type UseLiveObserverSidecarOptions = {
  uiLocale: string;
  assistantName: string;
  assistantPrompt: string;
  status: GeminiLiveStatus;
  isReadOnlyHistory: boolean;
  messages: Message[];
  minSequenceNumber?: number;
  onInjectPrompt: (text: string) => void;
  onOutput?: (output: LiveObserverOutput) => void | Promise<void>;
};

const SAMPLE_RATE = 16000;
const INJECTION_RULES = {
  high: { minConfidence: 0.55, cooldownMs: 4000 },
  medium: { minConfidence: 0.65, cooldownMs: 8000 },
  low: { minConfidence: 0.75, cooldownMs: 15000 },
} as const;

const logSidecar = (...args: unknown[]) => {
  console.debug("[ObserverSidecar]", ...args);
};

export function useLiveObserverSidecar({
  uiLocale,
  assistantName,
  assistantPrompt,
  status,
  isReadOnlyHistory,
  messages,
  minSequenceNumber = 0,
  onInjectPrompt,
  onOutput,
}: UseLiveObserverSidecarOptions) {
  const [outputs, setOutputs] = useState<LiveObserverOutput[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const isRunningRef = useRef(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const summaryRef = useRef<string | null>(null);
  const turnQueueRef = useRef<ObserverTurn[]>([]);

  const lastAssistantTranscriptRef = useRef<string | null>(null);
  const lastInjectionAtRef = useRef<number>(0);
  const lastInjectionTextRef = useRef<string | null>(null);

  const isActiveSession = status === "connected";

  const reset = useCallback(() => {
    setOutputs([]);
    setError(null);
    setIsRunning(false);
    isRunningRef.current = false;
    lastInjectionAtRef.current = 0;
    lastInjectionTextRef.current = null;
    sessionIdRef.current = crypto.randomUUID();
    summaryRef.current = null;
    turnQueueRef.current = [];
    lastAssistantTranscriptRef.current = null;
  }, []);

  useEffect(() => {
    if (isActiveSession) return;

    turnQueueRef.current = [];
    summaryRef.current = null;
    lastAssistantTranscriptRef.current = null;
  }, [isActiveSession]);

  useEffect(() => {
    if (!isActiveSession || isReadOnlyHistory) return;

    const scopedMessages = messages.filter(
      (message) => message.sequenceNumber > minSequenceNumber,
    );
    const reversed = [...scopedMessages].reverse();
    const lastAssistant = reversed.find(
      (message) => message.role === "assistant" && message.isStreaming !== true,
    );
    if (lastAssistant) {
      lastAssistantTranscriptRef.current = lastAssistant.content;
    }
  }, [isActiveSession, isReadOnlyHistory, messages, minSequenceNumber]);

  const processQueue = useCallback(async () => {
    if (!isActiveSession || isReadOnlyHistory || isRunningRef.current) return;
    if (turnQueueRef.current.length === 0) return;

    isRunningRef.current = true;
    setIsRunning(true);
    setError(null);

    try {
      while (turnQueueRef.current.length > 0) {
        const turns = turnQueueRef.current.slice(0, 2);
        const summary = summaryRef.current ?? undefined;
        const requestAt = Date.now();

        logSidecar("request_start", {
          turns: turns.length,
          summaryLength: summary?.length ?? 0,
        });

        const turnsForRequest = turns.map((turn) => ({
          assistantTranscript: turn.assistantTranscript,
          userAudioChunks: [createWavBlob(turn.userPcm, SAMPLE_RATE, 1)],
        }));

        const result = await runLiveObserverSidecarFn({
          data: {
            sessionId: sessionIdRef.current,
            uiLocale,
            summary,
            turns: turnsForRequest,
            assistantName,
            assistantPrompt,
          },
        });

        summaryRef.current = result.summary;
        turnQueueRef.current = turnQueueRef.current.slice(turns.length);

        const output: LiveObserverOutput = {
          id: crypto.randomUUID(),
          createdAt: requestAt,
          ...result,
        };

        setOutputs((prev) => [...prev, output].slice(-12));
        if (onOutput) {
          Promise.resolve(onOutput(output)).catch((persistError) => {
            logSidecar("persist_error", { message: String(persistError) });
          });
        }

        const injection = result.injection;
        const now = Date.now();
        if (
          injection &&
          result.confidence >= INJECTION_RULES[injection.priority].minConfidence &&
          now - lastInjectionAtRef.current >=
            INJECTION_RULES[injection.priority].cooldownMs &&
          injection.text !== lastInjectionTextRef.current
        ) {
          lastInjectionAtRef.current = now;
          lastInjectionTextRef.current = injection.text;
          logSidecar("inject", {
            priority: injection.priority,
            confidence: result.confidence,
          });
          onInjectPrompt(injection.text);
        }
      }
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error(String(err));
      logSidecar("error", { message: nextError.message });
      setError(nextError);
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, [
    assistantName,
    assistantPrompt,
    isActiveSession,
    isReadOnlyHistory,
    onInjectPrompt,
    onOutput,
    uiLocale,
  ]);

  const ingestSpeechSegment = useCallback(
    (chunk: LiveObserverSpeechChunk) => {
      if (!isActiveSession || isReadOnlyHistory) return;

      const assistantTranscript = lastAssistantTranscriptRef.current?.trim() ?? "";
      if (!assistantTranscript) {
        logSidecar("turn_skip", { reason: "assistant_transcript_empty" });
        return;
      }

      const safeAssistantTranscript =
        assistantTranscript.length > 2200
          ? assistantTranscript.slice(-2200)
          : assistantTranscript;

      const pcm = new Float32Array(chunk.pcm);
      if (pcm.length === 0) {
        logSidecar("turn_skip", { reason: "no_audio" });
        return;
      }

      const turn: ObserverTurn = {
        assistantTranscript: safeAssistantTranscript,
        userPcm: pcm,
      };

      turnQueueRef.current = [...turnQueueRef.current, turn];
      logSidecar("turn_enqueued", { audioSeconds: pcm.length / SAMPLE_RATE });
      void processQueue();
    },
    [isActiveSession, isReadOnlyHistory, processQueue],
  );

  const triggerNow = useCallback(() => {
    if (!isActiveSession || isReadOnlyHistory) return;
    void processQueue();
  }, [isActiveSession, isReadOnlyHistory, processQueue]);

  const canTrigger = useMemo(() => {
    return isActiveSession && !isReadOnlyHistory && !isRunning && messages.length > 0;
  }, [isActiveSession, isReadOnlyHistory, isRunning, messages.length]);

  return {
    outputs,
    error,
    isRunning,
    ingestSpeechSegment,
    triggerNow,
    canTrigger,
    reset,
  };
}
