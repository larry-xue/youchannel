import {
  GoogleGenAI,
  type FunctionCall,
  type FunctionResponse,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
  type Session,
} from "@google/genai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGeminiLiveAudio } from "~/lib/gemini/live/useGeminiLiveAudio";
import { useGeminiLiveMessages } from "~/lib/gemini/live/useGeminiLiveMessages";
import type { GeminiLiveStatus } from "~/lib/gemini/live/types";
import { pcm16BytesToWavBuffer } from "~/lib/gemini/utils";

export type { GeminiLiveStatus, Message } from "~/lib/gemini/live/types";

const formatHandleForLog = (handle: string) => {
  const suffix = handle.slice(-6);
  return `${handle.length}:${suffix}`;
};

type GeminiLiveToolHandler = (
  args: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

interface UseGeminiLiveOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
  /** Initial sequence number to start from (useful for resuming sessions) */
  initialSequenceNumber?: number;
  /** Maximum number of messages to keep in memory (default: 200) */
  messageWindowSize?: number;
  onResumptionHandle?: (handle: string, resumable: boolean) => void;
  onAssistantOutputStart?: () => void;
  onAssistantOutputEnd?: () => void;
  tools?: LiveConnectConfig["tools"];
  toolHandlers?: Record<string, GeminiLiveToolHandler>;
}

type GeminiLiveConnectOptions = {
  sessionResumptionHandle?: string;
  preserveMessages?: boolean;
};

export function useGeminiLive({
  apiKey,
  model = "gemini-2.5-flash-native-audio-preview-12-2025",
  voiceName = "Orus",
  initialSequenceNumber = 0,
  messageWindowSize = 200,
  onResumptionHandle,
  onAssistantOutputStart,
  onAssistantOutputEnd,
  tools,
  toolHandlers,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<GeminiLiveStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const isManualDisconnectRef = useRef(false);

  const toolsRef = useRef<LiveConnectConfig["tools"] | undefined>(tools);
  const toolHandlersRef = useRef<Record<string, GeminiLiveToolHandler> | undefined>(
    toolHandlers,
  );

  useEffect(() => {
    toolsRef.current = tools;
  }, [tools]);

  useEffect(() => {
    toolHandlersRef.current = toolHandlers;
  }, [toolHandlers]);

  const handleInputAudio = useCallback((media: { mimeType: string; data: string }) => {
    if (sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ audio: media });
    }
  }, []);

  const {
    messages,
    appendTurns,
    appendUserMessage,
    ensureAssistantMessage,
    attachAudioToMessage,
    handleInputText,
    handleOutputText,
    handleTurnComplete,
    resetMessages,
  } = useGeminiLiveMessages({
    initialSequenceNumber,
    messageWindowSize,
  });

  const currentAssistantAudioMessageIdRef = useRef<string | null>(null);
  const assistantAudioChunksRef = useRef<Uint8Array[]>([]);

  const resetAssistantAudioCapture = useCallback(() => {
    currentAssistantAudioMessageIdRef.current = null;
    assistantAudioChunksRef.current = [];
  }, []);

  const handleToolCalls = useCallback(async (functionCalls: FunctionCall[]) => {
    const session = sessionRef.current;
    if (!session) return;

    const handlers = toolHandlersRef.current;

    const responsePromises = functionCalls.map(
      async (call): Promise<FunctionResponse | null> => {
        const id = call.id;
        const name = call.name;
        if (!id || !name) {
          console.warn("[GeminiLive] Tool call missing id/name", call);
          return null;
        }

        const handler = handlers?.[name];
        if (!handler) {
          return {
            id,
            name,
            response: { error: `No tool handler registered for ${name}` },
          };
        }

        try {
          const output = await handler(call.args ?? {});
          return { id, name, response: { output } };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { id, name, response: { error: message } };
        }
      },
    );

    const isFunctionResponse = (
      value: FunctionResponse | null,
    ): value is FunctionResponse => value !== null;

    const resolvedResponses = (await Promise.all(responsePromises)).filter(
      isFunctionResponse,
    );

    if (resolvedResponses.length === 0) return;

    if (typeof session.sendToolResponse === "function") {
      session.sendToolResponse({ functionResponses: resolvedResponses });
    } else {
      console.error("sendToolResponse not found on session");
    }
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
    onOutputAudioStart: onAssistantOutputStart,
    onOutputAudioEnd: onAssistantOutputEnd,
    onError: setError,
  });

  const connect = useCallback(
    async (
      systemInstruction?: string,
      authToken?: string,
      options?: GeminiLiveConnectOptions,
    ) => {
      const key = authToken || apiKey;
      if (!key) {
        setError("API Key or Token is required");
        return;
      }

      try {
        isManualDisconnectRef.current = false;
        setStatus("connecting");
        setError(null);
        ensureAudioContexts();

        clientRef.current = new GoogleGenAI({
          apiKey: key,
          httpOptions: { apiVersion: "v1alpha" },
        });

        const sessionResumption: LiveConnectConfig["sessionResumption"] | undefined =
          options?.sessionResumptionHandle
            ? { handle: options.sessionResumptionHandle }
            : onResumptionHandle
              ? {}
              : undefined;

        const config: LiveConnectConfig = {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: toolsRef.current,
          thinkingConfig: {
            includeThoughts: true,
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          enableAffectiveDialog: true,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          proactivity: { proactiveAudio: false },
          sessionResumption,
          temperature: 1,
        };

        sessionRef.current = await clientRef.current.live.connect({
          model,
          config,
          callbacks: {
            onopen: () => {
              console.debug("[GeminiLive] Connection opened");
              setStatus("connected");
              resetAssistantAudioCapture();
              if (!options?.preserveMessages) {
                resetMessages(initialSequenceNumber);
              }
            },
            onmessage: async (message: LiveServerMessage) => {
              if (message.toolCall?.functionCalls?.length) {
                await handleToolCalls(message.toolCall.functionCalls);
              }

              if (message.toolCallCancellation?.ids?.length) {
                console.debug("[GeminiLive] Tool calls cancelled", {
                  ids: message.toolCallCancellation.ids,
                });
              }

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
              const wasManual = isManualDisconnectRef.current;
              isManualDisconnectRef.current = false;
              console.error("[GeminiLive] Connection closed:", {
                code: e.code,
                reason: e.reason,
                wasClean: e.wasClean,
                timestamp: new Date().toISOString(),
              });
              stopAudioRecording();
              stopOutputAudio();
              resetAssistantAudioCapture();
              sessionRef.current = null;
              if (!wasManual) {
                const reason = e.reason || "Connection closed";
                setError(`Connection closed (${e.code}): ${reason}`);
              }
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
        const errorMessage = message || "Connection failed";
        setError(errorMessage);
        setStatus("error");
        throw err instanceof Error ? err : new Error(errorMessage);
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
      handleToolCalls,
      model,
      onResumptionHandle,
      resetAssistantAudioCapture,
      resetMessages,
      stopAudioRecording,
      stopOutputAudio,
      voiceName,
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
    isManualDisconnectRef.current = true;
    setError(null);
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
      stopOutputAudio,
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
      stopOutputAudio,
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
