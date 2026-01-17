import { GoogleGenAI, LiveServerMessage, Modality, Session } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_WORKLET_PROCESSOR_CODE } from "./audio-processor";
import { createBlob, decode, decodeAudioData } from "./utils";

export type GeminiLiveStatus = "disconnected" | "connecting" | "connected" | "error";

// Add GrammarCheck type
export interface GrammarCheck {
  original: string;
  corrected: string;
  explanation: string;
}

export interface Explanation {
  original: string;
  explanation: string;
}

export interface Correction {
  original: string;
  corrected: string;
  ruleId?: string;
}

export interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: Date;
  corrections?: Correction[];
  explanations?: Explanation[];
  grammarChecks?: GrammarCheck[];
}

interface UseGeminiLiveOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
  uiLanguage?: string;
  tools?: Array<{ functionDeclarations: Array<any> }>;
  onToolCall?: (toolCall: any) => Promise<any> | any;
}

export function useGeminiLive({
  apiKey,
  model = "gemini-2.5-flash-native-audio-preview-09-2025",
  voiceName = "Orus",
  uiLanguage = "en",
  tools,
  onToolCall,
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

  // Track processed function call IDs to prevent duplicate execution
  const processedToolCallIdsRef = useRef<Set<string>>(new Set());

  // Track user message IDs that have already been analyzed
  const grammarCheckedMessageIdsRef = useRef<Set<string>>(new Set());

  // Trigger user input analysis (ASR calibration + grammar check + annotations) asynchronously
  const triggerUserInputAnalysis = useCallback(async (messageId: string, content: string, allMessages: Message[]) => {
    // Skip very short messages (likely not meaningful for analysis)
    if (content.trim().length < 5) return;

    try {
      const { analyzeUserInput } = await import("./actions");

      // Get recent conversation history (last 6 messages for context)
      const recentMessages = allMessages
        .slice(-6)
        .filter(m => m.id !== messageId) // Exclude the current message being analyzed
        .map(m => ({ role: m.role, content: m.content }));

      // @ts-ignore - bypassing strict type check for server fn
      const result = await analyzeUserInput({
        data: {
          sentence: content,
          conversationHistory: recentMessages,
          uiLanguage
        }
      });

      setMessages((prev) => {
        const msgIndex = prev.findIndex((m) => m.id === messageId);
        if (msgIndex === -1) return prev;

        const msgs = [...prev];
        const msg = { ...msgs[msgIndex] };
        let hasChanges = false;

        // Handle ASR calibration - update message content if calibrated differently
        const calibrated = result.calibrated || content;
        if (calibrated !== content) {
          msg.content = calibrated;
          hasChanges = true;
        }

        // Handle grammar check result (compared against calibrated sentence)
        if (result.grammar && result.grammar.corrected) {
          const currentChecks = msg.grammarChecks || [];
          const grammarCorrected = result.grammar.corrected;
          const grammarExplanation = result.grammar.explanation || "";
          const alreadyExists = currentChecks.some(
            (c) => c.original === calibrated || c.corrected === grammarCorrected
          );
          if (!alreadyExists) {
            msg.grammarChecks = [
              ...currentChecks,
              {
                original: calibrated,
                corrected: grammarCorrected,
                explanation: grammarExplanation
              }
            ];
            hasChanges = true;
          }
        }

        // Handle phrase explanations
        if (result.phrases && result.phrases.length > 0) {
          const currentExplanations = msg.explanations || [];
          for (const phrase of result.phrases) {
            const alreadyExists = currentExplanations.some(
              (e) => e.original === phrase.phrase
            );
            if (!alreadyExists) {
              currentExplanations.push({
                original: phrase.phrase,
                explanation: phrase.explanation
              });
              hasChanges = true;
            }
          }
          if (hasChanges) {
            msg.explanations = currentExplanations;
          }
        }

        if (!hasChanges) return prev;
        msgs[msgIndex] = msg;
        return msgs;
      });
    } catch (err) {
      console.error("[GeminiLive] User input analysis failed:", err);
    }
  }, [uiLanguage]);

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
          responseModalities: [Modality.AUDIO],
          thinkingConfig: {
            thinkingBudget: 1024,
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          enableAffectiveDialog: true,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [
            {
              googleSearch: {},
            },
            ...(tools || []),
          ],
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
              processedToolCallIdsRef.current.clear(); // Clear processed tool call IDs
              grammarCheckedMessageIdsRef.current.clear(); // Clear grammar-checked message IDs
            },
            onmessage: async (message: LiveServerMessage) => {
              // Log modelTurn parts
              const parts = message.serverContent?.modelTurn?.parts;

              // Log legacy toolCall envelope if present
              const toolEnvelope = (message as any).toolCall;

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
              const outputText = message.serverContent?.outputTranscription?.text;
              if (outputText) {
                console.log("onmessage outputText", message.serverContent?.outputTranscription);

                // When model starts outputting, it means user's turn has ended
                // Trigger grammar check for the last user message (if not already checked)
                setMessages((prev) => {
                  // Find the last user message
                  let lastUserMsg: Message | null = null;
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].role === "user") {
                      lastUserMsg = prev[i];
                      break;
                    }
                  }

                  // Trigger user input analysis if we haven't already analyzed this message
                  if (lastUserMsg && !grammarCheckedMessageIdsRef.current.has(lastUserMsg.id)) {
                    grammarCheckedMessageIdsRef.current.add(lastUserMsg.id);
                    // Trigger analysis asynchronously (don't await inside setMessages)
                    // Pass the current messages array for conversation context
                    triggerUserInputAnalysis(lastUserMsg.id, lastUserMsg.content, prev);
                  }

                  // Continue with normal message update
                  const last = prev[prev.length - 1];
                  if (last && last.role === "model") {
                    const updated = { ...last, content: last.content + outputText };
                    return [...prev.slice(0, -1), updated];
                  } else {
                    return [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        role: "model",
                        content: outputText,
                        timestamp: new Date(),
                      },
                    ];
                  }
                });
              }

              // Handle input transcription (user's audio -> text)
              const inputText = message.serverContent?.inputTranscription?.text;
              if (inputText) {
                console.log("onmessage inputText", message.serverContent?.inputTranscription);
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === "user") {
                    const updated = { ...last, content: last.content + inputText };
                    return [...prev.slice(0, -1), updated];
                  } else {
                    return [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        role: "user",
                        content: inputText,
                        timestamp: new Date(),
                      },
                    ];
                  }
                });
              }

              const interrupted = message.serverContent?.interrupted;
              if (interrupted) {
                audioSourcesRef.current.forEach((s) => s.stop());
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
              }

              // Handle tool calls from the model (client-side execution)
              const toolPart = message.serverContent?.modelTurn?.parts?.find(
                (part) => (part as any).functionCall,
              );
              const envelopeToolCalls = (message as any).toolCall?.functionCalls;

              // Prefer modelTurn.functionCall, but fall back to toolCall envelope if present
              const toolCalls = [] as any[];
              if (toolPart && (toolPart as any).functionCall) {
                toolCalls.push((toolPart as any).functionCall);
              }
              if (Array.isArray(envelopeToolCalls)) {
                toolCalls.push(...envelopeToolCalls);
              }

              for (const toolCall of toolCalls) {
                if (!onToolCall) break;
                // Skip if this function call ID has already been processed
                if (processedToolCallIdsRef.current.has(toolCall.id)) {
                  continue;
                }
                processedToolCallIdsRef.current.add(toolCall.id);

                try {
                  const result = await onToolCall(toolCall);
                  if (
                    sessionRef.current &&
                    typeof (sessionRef.current as any).sendToolResponse === "function"
                  ) {
                    (sessionRef.current as any).sendToolResponse({
                      functionResponses: [
                        {
                          id: toolCall.id,
                          name: toolCall.name,
                          response: result ?? { success: true },
                        },
                      ],
                    });
                  }
                } catch (err) {
                  console.error("[GeminiLive] Client tool execution failed", err);
                }
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
    [apiKey, model, voiceName, ensureAudioContexts, tools, onToolCall],
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

  const sendText = useCallback((text: string, hideFromUI: boolean = false) => {
    if (sessionRef.current) {
      // Append user text to messages immediately
      if (!hideFromUI) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "user") {
            // If last was user, we probably want a NEW message for a distinct text action,
            // OR append if it feels like continuation. Use new message for sendText to be safe/clear.
            // Actually, discord merges if same user.
            // But for manual text send, let's just properly append or new.
            // Let's force new message for sendText to distinguish from audio stream chunks?
            // No, consistency is key.
            const updated = { ...last, content: last.content + " " + text };
            return [...prev.slice(0, -1), updated];
          } else {
            return [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "user",
                content: text,
                timestamp: new Date(),
              },
            ];
          }
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
  }, []);

  return {
    connect,
    disconnect,
    startRecording,
    stopRecording,
    sendText,
    status,
    error,
    isRecording,
    messages,
    inputLevel,
    outputLevel,
    addCorrection: (original: string, corrected: string, ruleId?: string) => {
      setMessages((prev) => {
        let lastUserMsgIndex = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === "user") {
            lastUserMsgIndex = i;
            break;
          }
        }

        if (lastUserMsgIndex === -1) return prev;

        const msgs = [...prev];
        const msg = { ...msgs[lastUserMsgIndex] };

        const currentCorrections = msg.corrections || [];
        // Avoid duplicates if needed, or just append
        msg.corrections = [
          ...currentCorrections,
          { original, corrected, ruleId }
        ];

        msgs[lastUserMsgIndex] = msg;
        return msgs;
      });
    },
    addExplanation: (original: string, explanation: string) => {
      setMessages((prev) => {
        // Explanations usually come from the model using a tool to explain ITS OWN words
        // OR explain user words. The user request says "when the model thinks a word needs explanation".
        // Usually this refers to the MODEL'S output.
        // Let's attach to the last MODEL message.
        let lastModelMsgIndex = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === "model") {
            lastModelMsgIndex = i;
            break;
          }
        }

        if (lastModelMsgIndex === -1) return prev;

        const msgs = [...prev];
        const msg = { ...msgs[lastModelMsgIndex] };

        const currentExplanations = msg.explanations || [];
        msg.explanations = [
          ...currentExplanations,
          { original, explanation }
        ];

        msgs[lastModelMsgIndex] = msg;
        return msgs;
      });
    },
    addGrammarCheck: (original: string, corrected: string, explanation: string) => {
      setMessages((prev) => {
        // Grammar checks are usually for the USER'S speech.
        // So we attach to the last USER message.
        let lastUserMsgIndex = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === "user") {
            lastUserMsgIndex = i;
            break;
          }
        }

        if (lastUserMsgIndex === -1) return prev;

        const msgs = [...prev];
        const msg = { ...msgs[lastUserMsgIndex] };

        const currentChecks = msg.grammarChecks || [];

        // Deduplicate: Don't add if we already have a check for this "original" text snippet
        // or effectively the same correction.
        const alreadyExists = currentChecks.some(c => c.original === original || c.corrected === corrected);
        if (alreadyExists) return prev;

        msg.grammarChecks = [
          ...currentChecks,
          { original, corrected, explanation }
        ];

        msgs[lastUserMsgIndex] = msg;
        return msgs;
      });
    },
    // Pause/Resume
    pause: useCallback(() => {
      stopRecording(); // Stop mic
      // Stop current audio output
      audioSourcesRef.current.forEach((s) => {
        try { s.stop(); } catch (e) { /* ignore */ }
      });
      audioSourcesRef.current.clear();
      // Reset timing to avoid sync issues on resume?
      // Next audio chunk will calculate a new start time based on context.currentTime or use delay.
      // But we just stopped everything.
    }, [stopRecording]),
    resume: useCallback(() => {
      startRecording();
    }, [startRecording]),
  };
}
