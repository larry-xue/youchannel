import { GoogleGenAI, LiveServerMessage, Modality, Session } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_WORKLET_PROCESSOR_CODE } from "./audio-processor";
import { createBlob, decode, decodeAudioData } from "./utils";

export type GeminiLiveStatus = "disconnected" | "connecting" | "connected" | "error";

// Types removed for simplification

export interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: Date;
  /** Monotonically increasing sequence number for ordering */
  sequenceNumber: number;
  /** Whether this message is still being streamed (content may change) */
  isStreaming?: boolean;
}

interface UseGeminiLiveOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
  uiLanguage?: string;
}
/*  */
export function useGeminiLive({
  apiKey,
  model = "gemini-2.5-flash-native-audio-preview-12-2025",
  voiceName = "Orus",
  uiLanguage = "en",
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

  const processorRef = useRef<AudioWorkletNode | null>(null);

  // Sequence counter for message ordering - monotonically increasing
  const sequenceCounterRef = useRef<number>(0);
  // Track current streaming message IDs to properly handle incremental updates
  const currentUserMessageIdRef = useRef<string | null>(null);
  const currentModelMessageIdRef = useRef<string | null>(null);

  const getNextSequenceNumber = useCallback(() => {
    sequenceCounterRef.current += 1;
    return sequenceCounterRef.current;
  }, []);

  const ensureAudioContexts = useCallback(() => {
    if (!inputContextRef.current) {
      inputContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 16000 });
    }
    if (!outputContextRef.current) {
      outputContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 24000 });
      outputNodeRef.current = outputContextRef.current.createGain();
      outputNodeRef.current.connect(outputContextRef.current.destination);
    }
    // Resume contexts if suspended (browser autoplay policy)
    if (inputContextRef.current.state === "suspended") inputContextRef.current.resume();
    if (outputContextRef.current.state === "suspended") outputContextRef.current.resume();
  }, []);

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

        const config: any = {
          // Request BOTH audio + text to ensure we always have a persistable transcript.
          // Relying solely on outputAudioTranscription is not always reliable.
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          thinkingConfig: {
            thinkingBudget: 1024,
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          enableAffectiveDialog: true,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [],
        };

        if (systemInstruction) {
          config.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        sessionRef.current = await clientRef.current.live.connect({
          model,
          config,
          callbacks: {
            onopen: () => {
              setStatus("connected");
              setMessages([]); // Clear previous messages on new session
              // Reset sequence counter and streaming message refs for new session
              sequenceCounterRef.current = 0;
              currentUserMessageIdRef.current = null;
              currentModelMessageIdRef.current = null;
            },
            onmessage: async (message: LiveServerMessage) => {
              // Log modelTurn parts
              const parts = message.serverContent?.modelTurn?.parts;

              // Audio handling
              const audioPart = parts?.find((p) => (p as any).inlineData);
              if (
                audioPart?.inlineData &&
                outputContextRef.current &&
                outputNodeRef.current
              ) {
                const ctx = outputContextRef.current;
                nextStartTimeRef.current = Math.max(
                  nextStartTimeRef.current,
                  ctx.currentTime,
                );

                try {
                  const audioBuffer = await decodeAudioData(
                    decode(audioPart.inlineData.data || ""),
                    ctx,
                    24000,
                    1,
                  );

                  // Calculate RMS for output level visualization
                  const channelData = audioBuffer.getChannelData(0);
                  let outSum = 0;
                  for (let i = 0; i < channelData.length; i++) {
                    outSum += channelData[i] * channelData[i];
                  }
                  const outRms = Math.sqrt(outSum / channelData.length);
                  const outLevel = Math.min(1, outRms * 5);

                  const outNow = performance.now();
                  if (outNow - lastOutputUpdateRef.current > 33) {
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
              }

              // Handle output transcription (model's audio -> text)
              // Note: outputTranscription is not guaranteed to arrive in lockstep with turnComplete.
              // Keep `isStreaming` sticky-false once finalized.
              const outputText =
                message.serverContent?.outputTranscription?.text ??
                (typeof message.text === "string" ? message.text : undefined);
              if (outputText) {
                const isFinalChunk = Boolean(message.serverContent?.turnComplete);

                setMessages((prev) => {
                  // Find if we have a current streaming model message
                  const currentModelId = currentModelMessageIdRef.current;
                  const existingIdx = currentModelId
                    ? prev.findIndex((m) => m.id === currentModelId)
                    : -1;

                  if (existingIdx >= 0) {
                    // Append to existing model message
                    const existing = prev[existingIdx];
                    const updated: Message = {
                      ...existing,
                      content: existing.content + outputText,
                      isStreaming:
                        isFinalChunk || existing.isStreaming === false ? false : true,
                    };
                    const newArr = [...prev];
                    newArr[existingIdx] = updated;
                    return newArr;
                  } else {
                    // Create new model message
                    const newId = crypto.randomUUID();
                    currentModelMessageIdRef.current = newId;

                    // When model starts speaking, finalize any streaming user message
                    const prevUserMsgId = currentUserMessageIdRef.current;
                    currentUserMessageIdRef.current = null;

                    // Mark the previous user message as non-streaming
                    let updatedPrev = prev;
                    if (prevUserMsgId) {
                      const prevUserIdx = prev.findIndex((m) => m.id === prevUserMsgId);
                      if (prevUserIdx >= 0 && prev[prevUserIdx].isStreaming) {
                        updatedPrev = [...prev];
                        updatedPrev[prevUserIdx] = {
                          ...updatedPrev[prevUserIdx],
                          isStreaming: false,
                        };
                      }
                    }

                    const newMessage: Message = {
                      id: newId,
                      role: "model",
                      content: outputText,
                      timestamp: new Date(),
                      sequenceNumber: getNextSequenceNumber(),
                      isStreaming: isFinalChunk ? false : true,
                    };
                    return [...updatedPrev, newMessage];
                  }
                });
              }

              // Handle input transcription (user's audio -> text)
              const inputText = message.serverContent?.inputTranscription?.text;
              if (inputText) {
                setMessages((prev) => {
                  // Find if we have a current streaming user message
                  const currentUserId = currentUserMessageIdRef.current;

                  // Ignore empty/whitespace-only input if it's the start of a new message
                  // This prevents spurious "user turns" (noise/echo) from cutting off the model
                  if (!currentUserId && !inputText.trim()) {
                    return prev;
                  }

                  const existingIdx = currentUserId
                    ? prev.findIndex((m) => m.id === currentUserId)
                    : -1;

                  if (existingIdx >= 0) {
                    // Append to existing streaming message
                    const existing = prev[existingIdx];
                    const updated: Message = {
                      ...existing,
                      content: existing.content + inputText,
                      isStreaming: true,
                    };
                    const newArr = [...prev];
                    newArr[existingIdx] = updated;
                    return newArr;
                  } else {
                    // Create new user message
                    const newId = crypto.randomUUID();
                    currentUserMessageIdRef.current = newId;

                    // When user starts speaking, finalize any streaming model message
                    const prevModelMsgId = currentModelMessageIdRef.current;
                    currentModelMessageIdRef.current = null;

                    // Mark the previous model message as non-streaming
                    let updatedPrev = prev;
                    if (prevModelMsgId) {
                      const prevModelIdx = prev.findIndex((m) => m.id === prevModelMsgId);
                      if (prevModelIdx >= 0 && prev[prevModelIdx].isStreaming) {
                        updatedPrev = [...prev];
                        updatedPrev[prevModelIdx] = {
                          ...updatedPrev[prevModelIdx],
                          isStreaming: false,
                        };
                      }
                    }

                    const newMessage: Message = {
                      id: newId,
                      role: "user",
                      content: inputText,
                      timestamp: new Date(),
                      sequenceNumber: getNextSequenceNumber(),
                      isStreaming: true,
                    };
                    return [...updatedPrev, newMessage];
                  }
                });
              }

              const interrupted = message.serverContent?.interrupted;
              if (interrupted) {
                audioSourcesRef.current.forEach((s) => s.stop());
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
              }

              // Mark end-of-turn so downstream sync can persist the final transcript.
              // Gemini Live indicates completion with serverContent.turnComplete.
              const turnComplete = message.serverContent?.turnComplete;
              if (turnComplete) {
                const currentModelId = currentModelMessageIdRef.current;

                if (import.meta.env.DEV) {
                  console.log("[GeminiLive] turnComplete", {
                    currentModelId,
                    hasOutputTranscription: Boolean(
                      message.serverContent?.outputTranscription?.text,
                    ),
                    hasModelTurnText: typeof message.text === "string",
                  });
                }

                if (currentModelId) {
                  setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.id === currentModelId);
                    if (idx < 0) return prev;
                    if (prev[idx].isStreaming === false) return prev;

                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], isStreaming: false };
                    return updated;
                  });
                }
                // Keep currentModelMessageIdRef until the next user activity starts.
                // This avoids splitting the model transcript if late chunks arrive.
              }
            },

            onclose: (e) => {
              setStatus("disconnected");
            },
            onerror: (e) => {
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
    [apiKey, model, voiceName, ensureAudioContexts, getNextSequenceNumber],
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

        try {
          await inputContextRef.current.audioWorklet.addModule(url);
          audioContextInitializedRef.current = true;
        } catch (err: any) {
          // Ignore if already added (though we try to prevent this with the ref)
          if (!err.message.includes("already registered")) {
            throw err;
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
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const level = Math.min(1, rms * 5); // Amplify for better visual response

        // Throttle to ~30fps to avoid excessive re-renders
        const now = performance.now();
        if (now - lastInputUpdateRef.current > 33) {
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
    audioSourcesRef.current.forEach((s) => s.stop());
    audioSourcesRef.current.clear();

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setStatus("disconnected");
    setInputLevel(0);
    setOutputLevel(0);
  }, [stopRecording]);

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
            return [...prev, newMessage];
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
    [getNextSequenceNumber],
  );

  const sendTurns = useCallback(
    (
      turns: Array<{ role: "user" | "model"; content: string }>,
      hideFromUI: boolean = false,
    ) => {
      if (!sessionRef.current || turns.length === 0) return;

      if (!hideFromUI) {
        setMessages((prev) => [
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
        ]);
      }

      if (typeof (sessionRef.current as any).sendClientContent === "function") {
        (sessionRef.current as any).sendClientContent({
          turns: turns.map((turn) => ({
            role: turn.role,
            parts: [{ text: turn.content }],
          })),
          turnComplete: true,
        });
      } else {
        console.error("sendClientContent not found on session");
      }
    },
    [getNextSequenceNumber],
  );

  return {
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
    resume: useCallback(() => {
      startRecording();
    }, [startRecording]),
  };
}
