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
}

export function useGeminiLive({
  apiKey,
  model = "gemini-2.5-flash-native-audio-preview-12-2025",
  voiceName = "Orus",
  initialSequenceNumber = 0,
  messageWindowSize = 200,
  onResumptionHandle,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<GeminiLiveStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const handleInputAudio = useCallback((media: { mimeType: string; data: string }) => {
    if (sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ media });
    }
  }, []);

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
    onError: setError,
  });

  const {
    messages,
    appendTurns,
    appendUserMessage,
    handleInputText,
    handleOutputText,
    handleTurnComplete,
    resetMessages,
  } = useGeminiLiveMessages({
    initialSequenceNumber,
    messageWindowSize,
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
        };

        sessionRef.current = await clientRef.current.live.connect({
          model,
          config,
          callbacks: {
            onopen: () => {
              console.debug("[GeminiLive] Connection opened");
              setStatus("connected");
              resetMessages(initialSequenceNumber);
            },
            onmessage: async (message: LiveServerMessage) => {
              await handleAudioChunk(message);
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
      handleAudioChunk,
      handleInputText,
      handleOutputText,
      handleTurnComplete,
      initialSequenceNumber,
      model,
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

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setStatus("disconnected");
    resetLevels();
  }, [releaseAudioContexts, resetLevels, stopAudioRecording, stopOutputAudio]);

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

        if (typeof (sessionRef.current as any).sendClientContent === "function") {
          (sessionRef.current as any).sendClientContent({
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

  const sendTurns = useCallback(
    async (
      turns: Array<{ role: "user" | "assistant"; content: string }>,
      hideFromUI: boolean = false,
    ) => {
      if (!sessionRef.current || turns.length === 0) return;

      if (!hideFromUI) {
        appendTurns(turns);
      }

      if (typeof (sessionRef.current as any).sendClientContent === "function") {
        await (sessionRef.current as any).sendClientContent({
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
