import type { LiveServerMessage } from "@google/genai";
import { useCallback, useRef, useState } from "react";
import { AUDIO_WORKLET_PROCESSOR_CODE } from "~/lib/gemini/audio-processor";
import { createBlob, decode, decodeAudioData } from "~/lib/gemini/utils";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const LEVEL_UPDATE_INTERVAL = 33;
const LEVEL_MULTIPLIER = 5;

type InlineAudioPart = {
  inlineData?: {
    data?: string;
  };
};

type UseGeminiLiveAudioOptions = {
  onInputAudio: (media: { mimeType: string; data: string }) => void;
  onInputAudioChunk?: (chunk: {
    pcm: Float32Array;
    sampleCount: number;
  }) => void;
  onError: (message: string) => void;
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

export function useGeminiLiveAudio({
  onInputAudio,
  onInputAudioChunk,
  onError,
}: UseGeminiLiveAudioOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const lastInputUpdateRef = useRef(0);
  const lastOutputUpdateRef = useRef(0);

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
    if (inputContextRef.current.state === "suspended") {
      void inputContextRef.current.resume();
    }
    if (outputContextRef.current.state === "suspended") {
      void outputContextRef.current.resume();
    }
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

  const startRecording = useCallback(async () => {
    if (!inputContextRef.current) return;

    try {
      void inputContextRef.current.resume();
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      sourceNodeRef.current = inputContextRef.current.createMediaStreamSource(
        streamRef.current,
      );

      if (!inputContextRef.current.audioWorklet) {
        throw new Error("AudioWorklet not supported");
      }

      if (!audioContextInitializedRef.current) {
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
        const level = calcRmsLevel(inputData);

        const now = performance.now();
        if (now - lastInputUpdateRef.current > LEVEL_UPDATE_INTERVAL) {
          setInputLevel(level);
          lastInputUpdateRef.current = now;
        }

        const blob = createBlob(inputData);
        onInputAudio(blob);
        onInputAudioChunk?.({
          pcm: inputData,
          sampleCount: inputData.length,
        });
      };

      sourceNodeRef.current.connect(workletNode);
      workletNode.connect(inputContextRef.current.destination);

      setIsRecording(true);
    } catch (err: unknown) {
      console.error("Mic error", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      onError(`Microphone access failed: ${message}`);
    }
  }, [onError, onInputAudio, onInputAudioChunk]);

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

  const resetLevels = useCallback(() => {
    setInputLevel(0);
    setOutputLevel(0);
  }, []);

  return {
    ensureAudioContexts,
    handleAudioChunk,
    inputLevel,
    isRecording,
    outputLevel,
    releaseAudioContexts,
    resetLevels,
    startRecording,
    stopOutputAudio,
    stopRecording,
  };
}
