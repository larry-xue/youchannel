import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeminiLiveStatus, Message } from "~/lib/gemini/useGeminiLive";
import { arrayBufferToBase64, float32ToInt16 } from "~/lib/gemini/utils";
import {
  runLiveObserverSidecarFn,
  type LiveObserverSidecarResponse,
} from "./observer.sidecar";

type LiveObserverAudioChunk = {
  pcm: Float32Array;
  sampleCount: number;
};

export type LiveObserverOutput = LiveObserverSidecarResponse & {
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
const MAX_AUDIO_SECONDS = 10;
const MIN_AUDIO_SECONDS = 6;
const MIN_WORDS = 18;
const MIN_CHARS = 60;
const MIN_INTERVAL_MS = 6000;
const INJECTION_COOLDOWN_MS = 15000;
const INJECTION_MIN_CONFIDENCE = 0.7;
const USER_TURN_DEBOUNCE_MS = 1500;

const logSidecar = (...args: unknown[]) => {
  console.debug("[ObserverSidecar]", ...args);
};

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

const mergeAudioChunks = (chunks: LiveObserverAudioChunk[]) => {
  const totalSamples = chunks.reduce(
    (sum, chunk) => sum + chunk.sampleCount,
    0,
  );
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.pcm, offset);
    offset += chunk.sampleCount;
  }
  return merged;
};

const encodePcmBase64 = (pcm: Float32Array) => {
  const pcm16 = float32ToInt16(pcm);
  return arrayBufferToBase64(pcm16.buffer);
};

const buildTranscriptWindow = (messages: Message[]) => {
  const finalMessages = messages.filter((message) => !message.isStreaming);
  const windowMessages = finalMessages.slice(-10);
  const transcript = windowMessages
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
    )
    .join("\n");
  const trimmedTranscript =
    transcript.length > 4000 ? transcript.slice(-4000) : transcript;
  const latestUserUtterance =
    [...windowMessages].reverse().find((message) => message.role === "user")
      ?.content ?? "";
  const trimmedLatestUserUtterance =
    latestUserUtterance.length > 800
      ? latestUserUtterance.slice(-800)
      : latestUserUtterance;
  const userText = windowMessages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");
  return {
    transcript: trimmedTranscript,
    latestUserUtterance: trimmedLatestUserUtterance,
    wordCount: countWords(userText),
    charCount: userText.replace(/\s+/g, "").length,
  };
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

  const messagesRef = useRef<Message[]>([]);
  const isRunningRef = useRef(false);
  const lastFinalUserMessageIdRef = useRef<string | null>(null);
  const lastTriggeredAssistantIdRef = useRef<string | null>(null);
  const pendingTurnAssistantIdRef = useRef<string | null>(null);
  const pendingTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTriggerAtRef = useRef<number>(0);
  const lastInjectionAtRef = useRef<number>(0);
  const lastInjectionTextRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const audioChunksRef = useRef<LiveObserverAudioChunk[]>([]);
  const audioSamplesRef = useRef<number>(0);

  const isActiveSession = status === "connected";
  const maxAudioSamples = MAX_AUDIO_SECONDS * SAMPLE_RATE;
  const minAudioSamples = MIN_AUDIO_SECONDS * SAMPLE_RATE;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const resetAudioBuffer = useCallback(() => {
    audioChunksRef.current = [];
    audioSamplesRef.current = 0;
  }, []);

  const reset = useCallback(() => {
    setOutputs([]);
    setError(null);
    lastFinalUserMessageIdRef.current = null;
    lastTriggeredAssistantIdRef.current = null;
    pendingTurnAssistantIdRef.current = null;
    if (pendingTurnTimerRef.current) {
      clearTimeout(pendingTurnTimerRef.current);
      pendingTurnTimerRef.current = null;
    }
    lastTriggerAtRef.current = 0;
    lastInjectionAtRef.current = 0;
    lastInjectionTextRef.current = null;
    sessionIdRef.current = crypto.randomUUID();
    resetAudioBuffer();
  }, [resetAudioBuffer]);

  useEffect(() => {
    if (!isActiveSession) {
      resetAudioBuffer();
      pendingTurnAssistantIdRef.current = null;
      if (pendingTurnTimerRef.current) {
        clearTimeout(pendingTurnTimerRef.current);
        pendingTurnTimerRef.current = null;
      }
    }
  }, [isActiveSession, resetAudioBuffer]);

  const ingestAudioChunk = useCallback(
    (chunk: LiveObserverAudioChunk) => {
      if (!isActiveSession || isReadOnlyHistory) return;
      const pcm = new Float32Array(chunk.pcm);
      audioChunksRef.current.push({ pcm, sampleCount: pcm.length });
      audioSamplesRef.current += pcm.length;

      while (
        audioSamplesRef.current > maxAudioSamples &&
        audioChunksRef.current.length > 0
      ) {
        const removed = audioChunksRef.current.shift();
        if (removed) {
          audioSamplesRef.current -= removed.sampleCount;
        }
      }
    },
    [isActiveSession, isReadOnlyHistory, maxAudioSamples],
  );

  const runSidecar = useCallback(
    async (force: boolean) => {
      if (!isActiveSession || isReadOnlyHistory || isRunningRef.current) {
        logSidecar("skip", {
          force,
          isActiveSession,
          isReadOnlyHistory,
          isRunning: isRunningRef.current,
        });
        return;
      }
      const now = Date.now();
      if (!force && now - lastTriggerAtRef.current < MIN_INTERVAL_MS) {
        logSidecar("skip_interval", {
          sinceLastMs: now - lastTriggerAtRef.current,
        });
        return;
      }

      const snapshot = buildTranscriptWindow(messagesRef.current);
      if (!snapshot.transcript.trim()) {
        logSidecar("skip_empty_transcript");
        return;
      }

      const shouldTrigger =
        audioSamplesRef.current >= minAudioSamples ||
        snapshot.wordCount >= MIN_WORDS ||
        snapshot.charCount >= MIN_CHARS;

      if (!force && !shouldTrigger) {
        logSidecar("skip_thresholds", {
          audioSamples: audioSamplesRef.current,
          wordCount: snapshot.wordCount,
          charCount: snapshot.charCount,
        });
        return;
      }
      if (audioChunksRef.current.length === 0 && !force) {
        logSidecar("skip_no_audio");
        return;
      }

      const audioChunks = audioChunksRef.current;
      resetAudioBuffer();
      lastTriggerAtRef.current = now;

      isRunningRef.current = true;
      setIsRunning(true);
      setError(null);

      try {
        logSidecar("request_start", {
          audioSeconds: audioChunks.reduce((sum, chunk) => sum + chunk.sampleCount, 0)
            / SAMPLE_RATE,
          transcriptLength: snapshot.transcript.length,
          wordCount: snapshot.wordCount,
          charCount: snapshot.charCount,
          force,
        });
        const pcm = audioChunks.length > 0 ? mergeAudioChunks(audioChunks) : null;
        const encodedAudio = pcm
          ? [
              {
                mimeType: "audio/pcm;rate=16000",
                data: encodePcmBase64(pcm),
              },
            ]
          : undefined;

        const result = await runLiveObserverSidecarFn({
          data: {
            sessionId: sessionIdRef.current,
            uiLocale,
            transcript: snapshot.transcript,
            latestUserUtterance: snapshot.latestUserUtterance,
            assistantName,
            assistantPrompt,
            audioChunks: encodedAudio,
          },
        });

        const output: LiveObserverOutput = {
          id: crypto.randomUUID(),
          createdAt: now,
          ...result,
        };

        setOutputs((prev) => {
          const next = [...prev, output];
          return next.slice(-12);
        });
        if (onOutput) {
          Promise.resolve(onOutput(output)).catch((persistError) => {
            logSidecar("persist_error", { message: String(persistError) });
          });
        }

        logSidecar("response", {
          confidence: result.confidence,
          suggestions: result.suggestions.length,
          injection: Boolean(result.injection?.text),
        });
        const injection = result.injection;
        if (
          injection &&
          result.confidence >= INJECTION_MIN_CONFIDENCE &&
          now - lastInjectionAtRef.current >= INJECTION_COOLDOWN_MS &&
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
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error(String(err));
        logSidecar("error", { message: nextError.message });
        setError(nextError);
      } finally {
        isRunningRef.current = false;
        setIsRunning(false);
      }
    },
    [
      isActiveSession,
      isReadOnlyHistory,
      minAudioSamples,
      onInjectPrompt,
      assistantName,
      assistantPrompt,
      resetAudioBuffer,
      uiLocale,
      onOutput,
    ],
  );

  useEffect(() => {
    if (!isActiveSession || isReadOnlyHistory) return;
    const finalMessages = messages.filter(
      (message) =>
        !message.isStreaming && message.sequenceNumber > minSequenceNumber,
    );
    if (finalMessages.length === 0) return;

    let lastFinalUser: Message | undefined;
    let lastAssistantBeforeUser: Message | undefined;
    // Walk backward to find the latest finalized user message and its prior assistant.
    for (let i = finalMessages.length - 1; i >= 0; i -= 1) {
      const message = finalMessages[i];
      if (!lastFinalUser && message.role === "user") {
        lastFinalUser = message;
        continue;
      }
      if (
        lastFinalUser &&
        message.role === "assistant" &&
        message.sequenceNumber < lastFinalUser.sequenceNumber
      ) {
        lastAssistantBeforeUser = message;
        break;
      }
    }

    if (!lastFinalUser) return;
    if (lastFinalUser.id === lastFinalUserMessageIdRef.current) return;

    lastFinalUserMessageIdRef.current = lastFinalUser.id;

    const assistantId = lastAssistantBeforeUser?.id ?? null;
    if (!assistantId) {
      logSidecar("turn_trigger_no_assistant", { messageId: lastFinalUser.id });
    } else if (assistantId === lastTriggeredAssistantIdRef.current) {
      logSidecar("turn_skip_already_triggered", { assistantId });
      return;
    }

    pendingTurnAssistantIdRef.current = assistantId;
    if (pendingTurnTimerRef.current) {
      clearTimeout(pendingTurnTimerRef.current);
    }

    const userMessageId = lastFinalUser.id;
    pendingTurnTimerRef.current = setTimeout(() => {
      if (pendingTurnAssistantIdRef.current !== assistantId) return;
      if (assistantId) {
        lastTriggeredAssistantIdRef.current = assistantId;
      }
      pendingTurnAssistantIdRef.current = null;
      pendingTurnTimerRef.current = null;
      logSidecar("turn_trigger", {
        assistantId,
        userMessageId,
      });
      void runSidecar(true);
    }, USER_TURN_DEBOUNCE_MS);
  }, [
    isActiveSession,
    isReadOnlyHistory,
    messages,
    minSequenceNumber,
    runSidecar,
  ]);

  const triggerNow = useCallback(() => {
    void runSidecar(true);
  }, [runSidecar]);

  const canTrigger = useMemo(() => {
    return (
      isActiveSession &&
      !isReadOnlyHistory &&
      !isRunning &&
      messages.length > 0
    );
  }, [isActiveSession, isReadOnlyHistory, isRunning, messages.length]);

  return {
    outputs,
    error,
    isRunning,
    ingestAudioChunk,
    triggerNow,
    canTrigger,
    reset,
  };
}
