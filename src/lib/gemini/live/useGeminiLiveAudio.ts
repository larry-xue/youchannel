import type { LiveServerMessage } from "@google/genai";
import { useCallback, useRef, useState } from "react";
import type { MicVAD } from "@ricky0123/vad-web";
import { createBlob, decode, decodeAudioData } from "~/lib/gemini/utils";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const LEVEL_UPDATE_INTERVAL = 33;
const LEVEL_MULTIPLIER = 5;
const OUTPUT_END_DEBOUNCE_MS = 250;

const VAD_ASSET_BASE_PATH =
  "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/";
const ONNX_WASM_BASE_PATH =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";
const PRE_SPEECH_ROLL_SECONDS = 0.7;

type InlineAudioPart = {
  inlineData?: {
    data?: string;
  };
};

type UseGeminiLiveAudioOptions = {
  onInputAudio: (media: { mimeType: string; data: string }) => void;
  onInputAudioChunk?: (chunk: { pcm: Float32Array; sampleCount: number }) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: (chunk: { pcm: Float32Array; sampleCount: number }) => void;
  onVADMisfire?: () => void;
  onOutputAudioStart?: () => void;
  onOutputAudioEnd?: () => void;
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
  onSpeechStart,
  onSpeechEnd,
  onVADMisfire,
  onOutputAudioStart,
  onOutputAudioEnd,
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
  const isOutputActiveRef = useRef(false);
  const outputEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vadRef = useRef<MicVAD | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const isRecordingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const preSpeechFramesRef = useRef<Float32Array[]>([]);
  const preSpeechSamplesRef = useRef(0);

  const setRecordingState = useCallback((next: boolean) => {
    isRecordingRef.current = next;
    setIsRecording(next);
  }, []);

  const destroyVAD = useCallback(async (vad: MicVAD, context: string) => {
    try {
      await vad.destroy();
    } catch (err) {
      console.warn(`[GeminiLive] Failed to destroy VAD (${context})`, err);
    }
  }, []);

  const stopOutputAudio = useCallback(() => {
    const pendingEndTimer = outputEndTimerRef.current;
    if (pendingEndTimer) clearTimeout(pendingEndTimer);
    outputEndTimerRef.current = null;

    audioSourcesRef.current.forEach((source) => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (isOutputActiveRef.current) {
      isOutputActiveRef.current = false;
      onOutputAudioEnd?.();
    }
  }, [onOutputAudioEnd]);

  const releaseAudioContexts = useCallback(() => {
    const inputContext = inputContextRef.current;
    const outputContext = outputContextRef.current;

    inputContextRef.current = null;
    outputContextRef.current = null;
    outputNodeRef.current = null;

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
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!inputContextRef.current) {
      inputContextRef.current = new AudioContextCtor({ sampleRate: INPUT_SAMPLE_RATE });
    }
    if (!outputContextRef.current) {
      outputContextRef.current = new AudioContextCtor({ sampleRate: OUTPUT_SAMPLE_RATE });
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

  const handleAudioChunk = useCallback(
    async (message: LiveServerMessage): Promise<Uint8Array | null> => {
      const parts = message.serverContent?.modelTurn?.parts;
      const audioPart = parts?.find((part) => (part as InlineAudioPart).inlineData);
      const inlineData = audioPart?.inlineData;
      if (!inlineData?.data) return null;

      const pcm16Bytes = decode(inlineData.data);

      if (!outputContextRef.current || !outputNodeRef.current) {
        return pcm16Bytes;
      }

      const pendingEndTimer = outputEndTimerRef.current;
      if (pendingEndTimer) clearTimeout(pendingEndTimer);
      outputEndTimerRef.current = null;

      if (!isOutputActiveRef.current) {
        isOutputActiveRef.current = true;
        onOutputAudioStart?.();
      }

      const ctx = outputContextRef.current;
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

      try {
        const audioBuffer = await decodeAudioData(
        pcm16Bytes,
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
        if (audioSourcesRef.current.size > 0) return;

        const currentTimer = outputEndTimerRef.current;
        if (currentTimer) clearTimeout(currentTimer);

        outputEndTimerRef.current = setTimeout(() => {
          outputEndTimerRef.current = null;
          if (audioSourcesRef.current.size > 0) return;
          if (!isOutputActiveRef.current) return;
          isOutputActiveRef.current = false;
          onOutputAudioEnd?.();
        }, OUTPUT_END_DEBOUNCE_MS);
      });

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      audioSourcesRef.current.add(source);
    } catch (err) {
      console.error("Error decoding audio", err);
    }
      return pcm16Bytes;
    },
    [onOutputAudioEnd, onOutputAudioStart],
  );

  const resetPreSpeechBuffer = useCallback(() => {
    preSpeechFramesRef.current = [];
    preSpeechSamplesRef.current = 0;
  }, []);

  const bufferPreSpeechFrame = useCallback((frame: Float32Array) => {
    preSpeechFramesRef.current.push(frame);
    preSpeechSamplesRef.current += frame.length;

    const maxSamples = Math.floor(PRE_SPEECH_ROLL_SECONDS * INPUT_SAMPLE_RATE);
    while (preSpeechSamplesRef.current > maxSamples && preSpeechFramesRef.current.length) {
      const removed = preSpeechFramesRef.current.shift();
      if (removed) preSpeechSamplesRef.current -= removed.length;
    }
  }, []);

  const sendInputFrame = useCallback(
    (frame: Float32Array) => {
      const blob = createBlob(frame);
      onInputAudio(blob);
      onInputAudioChunk?.({ pcm: frame, sampleCount: frame.length });
    },
    [onInputAudio, onInputAudioChunk],
  );

  const flushPreSpeechFrames = useCallback(() => {
    if (preSpeechFramesRef.current.length === 0) return;
    const frames = preSpeechFramesRef.current;
    resetPreSpeechBuffer();
    frames.forEach((frame) => sendInputFrame(frame));
  }, [resetPreSpeechBuffer, sendInputFrame]);

  const startRecording = useCallback(async () => {
    const inputContext = inputContextRef.current;
    if (!inputContext) return;
    if (isRecordingRef.current) return;
    if (startPromiseRef.current) return startPromiseRef.current;

    const startPromise = (async () => {
      try {
        if (stopPromiseRef.current) {
          await stopPromiseRef.current.catch(() => {
            // Ignore failures from best-effort cleanup.
          });
        }

        await inputContext.resume();

        const existing = vadRef.current;
        if (existing) {
          vadRef.current = null;
          await destroyVAD(existing, "restart");
        }

        resetPreSpeechBuffer();
        isSpeakingRef.current = false;

        const { MicVAD } = await import("@ricky0123/vad-web");
        const vad = await MicVAD.new({
          startOnLoad: false,
          model: "legacy",
          redemptionMs: 800,
          baseAssetPath: VAD_ASSET_BASE_PATH,
          onnxWASMBasePath: ONNX_WASM_BASE_PATH,
          audioContext: inputContext,
          onFrameProcessed: (_probabilities, frame) => {
            const frameCopy = new Float32Array(frame);
            const level = calcRmsLevel(frameCopy);

            const now = performance.now();
            if (now - lastInputUpdateRef.current > LEVEL_UPDATE_INTERVAL) {
              setInputLevel(level);
              lastInputUpdateRef.current = now;
            }

            if (isSpeakingRef.current) {
              sendInputFrame(frameCopy);
            } else {
              bufferPreSpeechFrame(frameCopy);
            }
          },
          onSpeechStart: () => {
            // Candidate start. Wait for `onSpeechRealStart` to reduce false positives
            // from output audio echo / noise.
          },
          onSpeechRealStart: () => {
            isSpeakingRef.current = true;
            onSpeechStart?.();
            flushPreSpeechFrames();
          },
          onSpeechEnd: (audio) => {
            isSpeakingRef.current = false;
            resetPreSpeechBuffer();
            onSpeechEnd?.({ pcm: audio, sampleCount: audio.length });
          },
          onVADMisfire: () => {
            isSpeakingRef.current = false;
            resetPreSpeechBuffer();
            onVADMisfire?.();
          },
        });

        vadRef.current = vad;
        await vad.start();
        setRecordingState(true);
      } catch (err: unknown) {
        console.error("Mic error", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        onError(`Microphone access failed: ${message}`);

        const existing = vadRef.current;
        vadRef.current = null;
        if (existing) {
          await destroyVAD(existing, "error_cleanup");
        }
        setRecordingState(false);
      } finally {
        startPromiseRef.current = null;
      }
    })();

    startPromiseRef.current = startPromise;
    return startPromise;
  }, [
    bufferPreSpeechFrame,
    destroyVAD,
    flushPreSpeechFrames,
    onError,
    onSpeechEnd,
    onSpeechStart,
    onVADMisfire,
    resetPreSpeechBuffer,
    sendInputFrame,
    setRecordingState,
  ]);

  const stopRecording = useCallback(() => {
    if (stopPromiseRef.current) return;

    const stopPromise = (async () => {
      try {
        if (startPromiseRef.current) {
          await startPromiseRef.current.catch(() => {
            // Ignore failures from best-effort start attempt.
          });
        }

        const vad = vadRef.current;
        vadRef.current = null;

        if (vad) {
          await destroyVAD(vad, "stop");
        }
      } finally {
        isSpeakingRef.current = false;
        resetPreSpeechBuffer();
        setRecordingState(false);
        stopPromiseRef.current = null;
      }
    })();

    stopPromiseRef.current = stopPromise;
  }, [destroyVAD, resetPreSpeechBuffer, setRecordingState]);

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
