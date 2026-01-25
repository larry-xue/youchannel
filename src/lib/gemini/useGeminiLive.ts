import {
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
  type Session,
} from "@google/genai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGeminiLiveAudio } from "~/lib/gemini/live/useGeminiLiveAudio";
import { useGeminiLiveMessages } from "~/lib/gemini/live/useGeminiLiveMessages";
import type { GeminiLiveStatus } from "~/lib/gemini/live/types";
import { float32ToWavBuffer, pcm16BytesToWavBuffer } from "~/lib/gemini/utils";

export type { GeminiLiveStatus, Message } from "~/lib/gemini/live/types";

const formatHandleForLog = (handle: string) => {
  const suffix = handle.slice(-6);
  return `${handle.length}:${suffix}`;
};

interface UseGeminiLiveOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
  /** Initial sequence number to start from (useful for resuming sessions) */
  initialSequenceNumber?: number;
  /** Maximum number of messages to keep in memory (default: 200) */
  messageWindowSize?: number;
  onResumptionHandle?: (handle: string, resumable: boolean) => void;
  onInputAudioChunk?: (chunk: {
    pcm: Float32Array;
    sampleCount: number;
  }) => void;
  onUserSpeechEnd?: (chunk: { pcm: Float32Array; sampleCount: number }) => void;
}

export function useGeminiLive({
  apiKey,
  model = "gemini-2.5-flash-native-audio-preview-12-2025",
  voiceName = "Orus",
  initialSequenceNumber = 0,
  messageWindowSize = 200,
  onResumptionHandle,
  onInputAudioChunk,
  onUserSpeechEnd,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<GeminiLiveStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const handleInputAudio = useCallback((media: { mimeType: string; data: string }) => {
    if (sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ audio: media });
    }
  }, []);

  const {
    messages,
    appendTurns,
    appendUserMessage,
    beginUserAudioMessage,
    ensureAssistantMessage,
    attachAudioToMessage,
    removeMessage,
    handleInputText,
    handleOutputText,
    handleTurnComplete,
    resetMessages,
  } = useGeminiLiveMessages({
    initialSequenceNumber,
    messageWindowSize,
  });

  const currentUserAudioMessageIdRef = useRef<string | null>(null);
  const currentAssistantAudioMessageIdRef = useRef<string | null>(null);
  const assistantAudioChunksRef = useRef<Uint8Array[]>([]);

  const resetAssistantAudioCapture = useCallback(() => {
    currentAssistantAudioMessageIdRef.current = null;
    assistantAudioChunksRef.current = [];
  }, []);

  const finalizeAssistantAudioCapture = useCallback(() => {
    const messageId = currentAssistantAudioMessageIdRef.current;
    const chunks = assistantAudioChunksRef.current;
    resetAssistantAudioCapture();

    if (!messageId || chunks.length === 0) return;
    if (typeof URL === "undefined") return;

    let totalLength = 0;
    chunks.forEach((chunk) => {
      totalLength += chunk.length;
    });

    const pcm16Bytes = new Uint8Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
      pcm16Bytes.set(chunk, offset);
      offset += chunk.length;
    });

    const wavBuffer = pcm16BytesToWavBuffer(pcm16Bytes, 24000, 1);
    const audioUrl = URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
    attachAudioToMessage(messageId, audioUrl);
  }, [attachAudioToMessage, resetAssistantAudioCapture]);

  const handleSpeechStart = useCallback(() => {
    if (!sessionRef.current) return;
    if (currentUserAudioMessageIdRef.current) return;
    currentUserAudioMessageIdRef.current = beginUserAudioMessage();
    sessionRef.current.sendRealtimeInput({ activityStart: {} });
  }, [beginUserAudioMessage]);

  const handleSpeechEnd = useCallback(
    (chunk: { pcm: Float32Array; sampleCount: number }) => {
      if (!sessionRef.current) return;
      sessionRef.current.sendRealtimeInput({ activityEnd: {} });

      const messageId = currentUserAudioMessageIdRef.current;
      currentUserAudioMessageIdRef.current = null;

      if (messageId && typeof URL !== "undefined") {
        const wavBuffer = float32ToWavBuffer(chunk.pcm, 16000, 1);
        const audioUrl = URL.createObjectURL(
          new Blob([wavBuffer], { type: "audio/wav" }),
        );
        attachAudioToMessage(messageId, audioUrl);
      }

      onUserSpeechEnd?.(chunk);
    },
    [attachAudioToMessage, onUserSpeechEnd],
  );

  const {
    ensureAudioContexts,
    handleAudioChunk,
    inputLevel,
    isRecording,
    outputLevel,
    releaseAudioContexts,
    resetLevels,
    startRecording: startAudioRecording,
    stopOutputAudio,
    stopRecording: stopAudioRecording,
  } = useGeminiLiveAudio({
    onInputAudio: handleInputAudio,
    onInputAudioChunk,
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
    onVADMisfire: () => {
      const messageId = currentUserAudioMessageIdRef.current;
      currentUserAudioMessageIdRef.current = null;
      if (messageId) {
        removeMessage(messageId);
      }
      if (sessionRef.current) {
        sessionRef.current.sendRealtimeInput({ activityEnd: {} });
      }
    },
    onError: setError,
  });

  const connect = useCallback(
    async (systemInstruction?: string, authToken?: string) => {
      const key = authToken || apiKey;
      if (!key) {
        setError("API Key or Token is required");
        return;
      }

      try {
        setStatus("connecting");
        setError(null);
        ensureAudioContexts();

        clientRef.current = new GoogleGenAI({
          apiKey: key,
          httpOptions: { apiVersion: "v1alpha" },
        });

        const config: LiveConnectConfig = {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          thinkingConfig: {
            thinkingBudget: 1024,
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          enableAffectiveDialog: true,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          sessionResumption: onResumptionHandle ? {} : undefined,
          realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
          temperature: 0.4,
        };

        sessionRef.current = await clientRef.current.live.connect({
          model,
          config,
          callbacks: {
            onopen: () => {
              console.debug("[GeminiLive] Connection opened");
              setStatus("connected");
              resetAssistantAudioCapture();
              resetMessages(initialSequenceNumber);
            },
            onmessage: async (message: LiveServerMessage) => {
              const outputPcm16Bytes = await handleAudioChunk(message);
              if (outputPcm16Bytes) {
                const messageId =
                  currentAssistantAudioMessageIdRef.current || ensureAssistantMessage();
                currentAssistantAudioMessageIdRef.current = messageId;
                assistantAudioChunksRef.current.push(outputPcm16Bytes);
              }
              handleOutputText(message);
              handleInputText(message);

              const resumptionUpdate = (
                message as {
                  sessionResumptionUpdate?: {
                    resumable?: boolean;
                    newHandle?: string;
                  };
                }
              ).sessionResumptionUpdate;

              if (resumptionUpdate) {
                console.debug("[GeminiLive] Resumption update", {
                  resumable: resumptionUpdate.resumable ?? false,
                  handle: resumptionUpdate.newHandle
                    ? formatHandleForLog(resumptionUpdate.newHandle)
                    : null,
                });

                if (resumptionUpdate.newHandle && onResumptionHandle) {
                  onResumptionHandle(
                    resumptionUpdate.newHandle,
                    resumptionUpdate.resumable ?? false,
                  );
                }
              }

              if (message.serverContent?.interrupted) {
                stopOutputAudio();
              }

              handleTurnComplete(message);

              if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
                finalizeAssistantAudioCapture();
              }
            },

            onclose: (e) => {
              console.error("[GeminiLive] Connection closed:", {
                code: e.code,
                reason: e.reason,
                wasClean: e.wasClean,
                timestamp: new Date().toISOString(),
              });
              setStatus("disconnected");
            },
            onerror: (e) => {
              console.error("[GeminiLive] Connection error:", {
                message: e.message,
                timestamp: new Date().toISOString(),
              });
              setError(e.message || "Session error");
              setStatus("error");
            },
          },
        });
      } catch (err: unknown) {
        console.error(err);
        const message = err instanceof Error ? err.message : "";
        setError(message || "Connection failed");
        setStatus("error");
      }
    },
    [
      apiKey,
      ensureAudioContexts,
      ensureAssistantMessage,
      finalizeAssistantAudioCapture,
      handleAudioChunk,
      handleInputText,
      handleOutputText,
      handleTurnComplete,
      initialSequenceNumber,
      model,
      resetAssistantAudioCapture,
      resetMessages,
      stopOutputAudio,
      voiceName,
      onResumptionHandle,
    ],
  );

  const startRecording = useCallback(async () => {
    if (!sessionRef.current) return;
    await startAudioRecording();
  }, [startAudioRecording]);

  const stopRecording = useCallback(() => {
    stopAudioRecording();
  }, [stopAudioRecording]);

  const disconnect = useCallback(() => {
    stopAudioRecording();
    stopOutputAudio();
    releaseAudioContexts();
    resetAssistantAudioCapture();

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setStatus("disconnected");
    resetLevels();
  }, [
    releaseAudioContexts,
    resetAssistantAudioCapture,
    resetLevels,
    stopAudioRecording,
    stopOutputAudio,
  ]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const sendText = useCallback(
    (text: string, hideFromUI: boolean = false) => {
      if (sessionRef.current) {
        if (!hideFromUI) {
          appendUserMessage(text);
        }

        if (typeof (sessionRef.current).sendClientContent === "function") {
          (sessionRef.current).sendClientContent({
            turns: [{ role: "user", parts: [{ text }] }],
            turnComplete: true,
          });
        } else {
          console.error("sendClientContent not found on session");
        }
      }
    },
    [appendUserMessage],
  );

  const sendContext = useCallback((text: string) => {
    if (!sessionRef.current) return;
    if (typeof (sessionRef.current).sendClientContent === "function") {
      (sessionRef.current).sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: false,
      });
    } else {
      console.error("sendClientContent not found on session");
    }
  }, []);

  const sendTurns = useCallback(
    async (
      turns: Array<{ role: "user" | "assistant"; content: string }>,
      hideFromUI: boolean = false,
    ) => {
      if (!sessionRef.current || turns.length === 0) return;

      if (!hideFromUI) {
        appendTurns(turns);
      }

      if (typeof (sessionRef.current).sendClientContent === "function") {
        await (sessionRef.current).sendClientContent({
          turns: turns.map((turn) => ({
            role: turn.role === "assistant" ? "model" : turn.role,
            parts: [{ text: turn.content }],
          })),
          turnComplete: turns.length ? turns[turns.length - 1].role === "user" : true,
        });
      } else {
        console.error("sendClientContent not found on session");
      }
    },
    [appendTurns],
  );

  const resume = useCallback(() => {
    void startRecording();
  }, [startRecording]);

  return useMemo(
    () => ({
      connect,
      disconnect,
      startRecording,
      stopRecording,
      sendText,
      sendContext,
      sendTurns,
      status,
      error,
      isRecording,
      messages,
      inputLevel,
      outputLevel,
      resume,
    }),
    [
      connect,
      disconnect,
      startRecording,
      stopRecording,
      sendText,
      sendContext,
      sendTurns,
      status,
      error,
      isRecording,
      messages,
      inputLevel,
      outputLevel,
      resume,
    ],
  );
}
