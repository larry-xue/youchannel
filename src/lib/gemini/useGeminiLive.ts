import { GoogleGenAI, LiveConnectConfig, LiveServerMessage, Modality, Session } from "@google/genai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUDIO_WORKLET_PROCESSOR_CODE } from "./audio-processor";
import { createBlob, decode, decodeAudioData } from "./utils";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const LEVEL_UPDATE_INTERVAL = 33;
const LEVEL_MULTIPLIER = 5;

export type GeminiLiveStatus = "disconnected" | "connecting" | "connected" | "error";

// Types removed for simplification

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** Monotonically increasing sequence number for ordering */
  sequenceNumber: number;
  /** Whether this message is still being streamed (content may change) */
  isStreaming?: boolean;
}

type InlineAudioPart = {
  inlineData?: {
    data?: string;
  };
};

const calcRmsLevel = (samples: Float32Array, multiplier = LEVEL_MULTIPLIER) => {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, rms * multiplier);
};

const finalizeStreamingMessage = (messages: Message[], messageId: string | null) => {
  if (!messageId) return messages;
  const idx = messages.findIndex((message) => message.id === messageId);
  if (idx < 0 || messages[idx].isStreaming === false) return messages;

  const next = [...messages];
  next[idx] = { ...next[idx], isStreaming: false };
  return next;
};

interface UseGeminiLiveOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
  /** Initial sequence number to start from (useful for resuming sessions) */
  initialSequenceNumber?: number;
  /** Maximum number of messages to keep in memory (default: 200) */
  messageWindowSize?: number;
}
/*  */
export function useGeminiLive({
  apiKey,
  model = "gemini-2.5-flash-native-audio-preview-12-2025",
  voiceName = "Orus",
  initialSequenceNumber = 0,
  messageWindowSize = 200,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<GeminiLiveStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const lastInputUpdateRef = useRef(0);
  const lastOutputUpdateRef = useRef(0);

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioContextInitializedRef = useRef<boolean>(false);
  const workletModuleUrlRef = useRef<string | null>(null);

  const processorRef = useRef<AudioWorkletNode | null>(null);

  // Sequence counter for message ordering - monotonically increasing
  const sequenceCounterRef = useRef<number>(initialSequenceNumber);
  // Track current streaming message IDs to properly handle incremental updates
  const currentUserMessageIdRef = useRef<string | null>(null);
  const currentModelMessageIdRef = useRef<string | null>(null);

  const getNextSequenceNumber = useCallback(() => {
    sequenceCounterRef.current += 1;
    return sequenceCounterRef.current;
  }, []);

  // Helper to apply message window size limit
  const applyMessageWindow = useCallback(
    (messages: Message[]): Message[] => {
      if (messages.length <= messageWindowSize) {
        return messages;
      }
      // Keep the most recent messages
      return messages.slice(-messageWindowSize);
    },
    [messageWindowSize],
  );

  const stopOutputAudio = useCallback(() => {
    audioSourcesRef.current.forEach((source) => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const releaseAudioContexts = useCallback(() => {
    const inputContext = inputContextRef.current;
    const outputContext = outputContextRef.current;

    inputContextRef.current = null;
    outputContextRef.current = null;
    outputNodeRef.current = null;
    audioContextInitializedRef.current = false;

    if (inputContext && inputContext.state !== "closed") {
      void inputContext.close().catch((err) => {
        console.warn("[GeminiLive] Failed to close input audio context", err);
      });
    }

    if (outputContext && outputContext.state !== "closed") {
      void outputContext.close().catch((err) => {
        console.warn("[GeminiLive] Failed to close output audio context", err);
      });
    }
  }, []);

  const resolveStreamingAssistantIndex = useCallback((messages: Message[]) => {
    const currentModelId = currentModelMessageIdRef.current;
    if (currentModelId) {
      const idx = messages.findIndex((message) => message.id === currentModelId);
      if (idx >= 0) return idx;
    }

    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant" && lastMessage.isStreaming) {
        currentModelMessageIdRef.current = lastMessage.id;
        return messages.length - 1;
      }
    }

    return -1;
  }, []);

  const ensureAudioContexts = useCallback(() => {
    if (!inputContextRef.current) {
      inputContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: INPUT_SAMPLE_RATE });
    }
    if (!outputContextRef.current) {
      outputContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: OUTPUT_SAMPLE_RATE });
      outputNodeRef.current = outputContextRef.current.createGain();
      outputNodeRef.current.connect(outputContextRef.current.destination);
    }
    // Resume contexts if suspended (browser autoplay policy)
    if (inputContextRef.current.state === "suspended") inputContextRef.current.resume();
    if (outputContextRef.current.state === "suspended") outputContextRef.current.resume();
  }, []);

  const handleAudioChunk = useCallback(async (message: LiveServerMessage) => {
    const parts = message.serverContent?.modelTurn?.parts;
    const audioPart = parts?.find((part) => (part as InlineAudioPart).inlineData);
    if (!audioPart?.inlineData || !outputContextRef.current || !outputNodeRef.current) {
      return;
    }

    const ctx = outputContextRef.current;
    nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

    try {
      const audioBuffer = await decodeAudioData(
        decode(audioPart.inlineData.data || ""),
        ctx,
        OUTPUT_SAMPLE_RATE,
        1,
      );

      const outLevel = calcRmsLevel(audioBuffer.getChannelData(0));
      const outNow = performance.now();
      if (outNow - lastOutputUpdateRef.current > LEVEL_UPDATE_INTERVAL) {
        setOutputLevel(outLevel);
        lastOutputUpdateRef.current = outNow;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputNodeRef.current);
      source.addEventListener("ended", () => {
        audioSourcesRef.current.delete(source);
      });

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      audioSourcesRef.current.add(source);
    } catch (err) {
      console.error("Error decoding audio", err);
    }
  }, []);

  const handleOutputText = useCallback(
    (message: LiveServerMessage) => {
      const outputText =
        message.serverContent?.outputTranscription?.text ??
        (typeof message.text === "string" ? message.text : undefined);
      if (!outputText) return;

      const isFinalChunk = Boolean(message.serverContent?.turnComplete);

      setMessages((prev) => {
        const existingIdx = resolveStreamingAssistantIndex(prev);

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const updated: Message = {
            ...existing,
            content: existing.content + outputText,
            isStreaming: isFinalChunk || existing.isStreaming === false ? false : true,
          };
          const newArr = [...prev];
          newArr[existingIdx] = updated;
          return applyMessageWindow(newArr);
        }

        const newId = crypto.randomUUID();
        currentModelMessageIdRef.current = newId;

        const prevUserMsgId = currentUserMessageIdRef.current;
        currentUserMessageIdRef.current = null;

        const updatedPrev = finalizeStreamingMessage(prev, prevUserMsgId);

        const newMessage: Message = {
          id: newId,
          role: "assistant",
          content: outputText,
          timestamp: new Date(),
          sequenceNumber: getNextSequenceNumber(),
          isStreaming: isFinalChunk ? false : true,
        };
        return applyMessageWindow([...updatedPrev, newMessage]);
      });
    },
    [applyMessageWindow, getNextSequenceNumber, resolveStreamingAssistantIndex],
  );

  const handleInputText = useCallback(
    (message: LiveServerMessage) => {
      const inputText = message.serverContent?.inputTranscription?.text;
      if (!inputText) return;

      setMessages((prev) => {
        const currentUserId = currentUserMessageIdRef.current;

        if (!currentUserId && !inputText.trim()) {
          return prev;
        }

        const existingIdx = currentUserId
          ? prev.findIndex((m) => m.id === currentUserId)
          : -1;

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const updated: Message = {
            ...existing,
            content: existing.content + inputText,
            isStreaming: true,
          };
          const newArr = [...prev];
          newArr[existingIdx] = updated;
          return applyMessageWindow(newArr);
        }

        const newId = crypto.randomUUID();
        currentUserMessageIdRef.current = newId;

        const prevModelMsgId = currentModelMessageIdRef.current;
        currentModelMessageIdRef.current = null;

        const updatedPrev = finalizeStreamingMessage(prev, prevModelMsgId);

        const newMessage: Message = {
          id: newId,
          role: "user",
          content: inputText,
          timestamp: new Date(),
          sequenceNumber: getNextSequenceNumber(),
          isStreaming: true,
        };
        return applyMessageWindow([...updatedPrev, newMessage]);
      });
    },
    [applyMessageWindow, getNextSequenceNumber],
  );

  const handleTurnComplete = useCallback(
    (message: LiveServerMessage) => {
      if (!message.serverContent?.turnComplete) return;
      const currentModelId = currentModelMessageIdRef.current;
      if (!currentModelId) return;

      setMessages((prev) =>
        applyMessageWindow(finalizeStreamingMessage(prev, currentModelId)),
      );
    },
    [applyMessageWindow],
  );

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
          // Ephemeral tokens require v1alpha
          httpOptions: { apiVersion: "v1alpha" },
        });

        const config: LiveConnectConfig = {
          // responseModalities only support one type
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
        };

        sessionRef.current = await clientRef.current.live.connect({
          model,
          config,
          callbacks: {
            onopen: () => {
              setStatus("connected");
              setMessages([]); // Clear previous messages on new session
              // Reset sequence counter and streaming message refs for new session
              sequenceCounterRef.current = initialSequenceNumber;
              currentUserMessageIdRef.current = null;
              currentModelMessageIdRef.current = null;
            },
            onmessage: async (message: LiveServerMessage) => {
              await handleAudioChunk(message);
              handleOutputText(message);
              handleInputText(message);

              if (message.serverContent?.interrupted) {
                stopOutputAudio();
              }

              // Mark end-of-turn so downstream sync can persist the final transcript.
              // Gemini Live indicates completion with serverContent.turnComplete.
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
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Connection failed");
        setStatus("error");
      }
    },
    [
      apiKey,
      model,
      voiceName,
      ensureAudioContexts,
      handleAudioChunk,
      handleInputText,
      handleOutputText,
      handleTurnComplete,
      stopOutputAudio,
      initialSequenceNumber,
    ],
  );

  const startRecording = useCallback(async () => {
    if (!inputContextRef.current || !sessionRef.current) return;

    try {
      inputContextRef.current.resume();
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      sourceNodeRef.current = inputContextRef.current.createMediaStreamSource(
        streamRef.current,
      );

      // Add AudioWorklet module
      if (!inputContextRef.current.audioWorklet) {
        throw new Error("AudioWorklet not supported");
      }

      if (!audioContextInitializedRef.current) {
        // Create a Blob URL for the processor code
        const blob = new Blob([AUDIO_WORKLET_PROCESSOR_CODE], {
          type: "application/javascript",
        });
        const url = URL.createObjectURL(blob);
        workletModuleUrlRef.current = url;

        try {
          await inputContextRef.current.audioWorklet.addModule(url);
          audioContextInitializedRef.current = true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "";
          // Ignore if already added (though we try to prevent this with the ref)
          if (message.includes("already registered")) {
            audioContextInitializedRef.current = true;
          } else {
            throw err;
          }
        } finally {
          if (workletModuleUrlRef.current) {
            URL.revokeObjectURL(workletModuleUrlRef.current);
            workletModuleUrlRef.current = null;
          }
        }
      }

      const workletNode = new AudioWorkletNode(
        inputContextRef.current,
        "gemini-audio-processor",
      );
      processorRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const inputData = event.data as Float32Array;

        // Calculate RMS for input level visualization
        const level = calcRmsLevel(inputData); // Amplify for better visual response

        // Throttle to ~30fps to avoid excessive re-renders
        const now = performance.now();
        if (now - lastInputUpdateRef.current > LEVEL_UPDATE_INTERVAL) {
          setInputLevel(level);
          lastInputUpdateRef.current = now;
        }

        // Send off to session
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({ media: createBlob(inputData) });
        }
      };

      sourceNodeRef.current.connect(workletNode);
      workletNode.connect(inputContextRef.current.destination); // Keep alive

      setIsRecording(true);
    } catch (err: any) {
      console.error("Mic error", err);
      setError("Microphone access failed: " + err.message);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (processorRef.current && sourceNodeRef.current) {
      processorRef.current.disconnect();
      sourceNodeRef.current.disconnect();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    sourceNodeRef.current = null;
    processorRef.current = null;

    setIsRecording(false);
  }, []);

  const disconnect = useCallback(() => {
    stopRecording();
    stopOutputAudio();
    releaseAudioContexts();

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setStatus("disconnected");
    setInputLevel(0);
    setOutputLevel(0);
  }, [releaseAudioContexts, stopOutputAudio, stopRecording]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const sendText = useCallback(
    (text: string, hideFromUI: boolean = false) => {
      if (sessionRef.current) {
        // Append user text to messages immediately
        if (!hideFromUI) {
          setMessages((prev) => {
            // For manual text input, always create a new message (distinct from audio streaming)
            const newId = crypto.randomUUID();
            currentUserMessageIdRef.current = newId;
            currentModelMessageIdRef.current = null;

            const newMessage: Message = {
              id: newId,
              role: "user",
              content: text,
              timestamp: new Date(),
              sequenceNumber: getNextSequenceNumber(),
              isStreaming: false,
            };
            return applyMessageWindow([...prev, newMessage]);
          });
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
    [getNextSequenceNumber, applyMessageWindow],
  );

  const sendTurns = useCallback(
    async (
      turns: Array<{ role: "user" | "assistant"; content: string }>,
      hideFromUI: boolean = false,
    ) => {
      if (!sessionRef.current || turns.length === 0) return;

      if (!hideFromUI) {
        setMessages((prev) =>
          applyMessageWindow([
            ...prev,
            ...turns.map(
              (turn): Message => ({
                id: crypto.randomUUID(),
                role: turn.role,
                content: turn.content,
                timestamp: new Date(),
                sequenceNumber: getNextSequenceNumber(),
                isStreaming: false,
              }),
            ),
          ]),
        );
      }

      if (typeof (sessionRef.current as any).sendClientContent === "function") {
        await (sessionRef.current as any).sendClientContent({
          turns: turns.map((turn) => ({
            // Convert "assistant" back to "model" for Gemini API
            role: turn.role === "assistant" ? "model" : turn.role,
            parts: [{ text: turn.content }],
          })),
          turnComplete: turns.length ? turns[turns.length - 1].role === "user" : true,
        });
      } else {
        console.error("sendClientContent not found on session");
      }
    },
    [getNextSequenceNumber, applyMessageWindow],
  );

  const resume = useCallback(() => {
    startRecording();
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
