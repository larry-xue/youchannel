import type { LiveServerMessage } from "@google/genai";
import { useCallback, useRef, useState } from "react";
import { AUDIO_WORKLET_PROCESSOR_CODE } from "~/lib/gemini/audio-processor";
import { createBlob, decode, decodeAudioData } from "~/lib/gemini/utils";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const LEVEL_UPDATE_INTERVAL = 33;
const LEVEL_MULTIPLIER = 5;
const OUTPUT_END_DEBOUNCE_MS = 250;
const INPUT_SEND_CHUNK_SAMPLES = 1024;

type InlineAudioPart = {
  inlineData?: {
    data?: string;
  };
};

type UseGeminiLiveAudioOptions = {
  onInputAudio: (media: { mimeType: string; data: string }) => void;
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

  const streamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputProcessorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const workletLoadedRef = useRef(false);
  const inputChunkRef = useRef<Float32Array>(new Float32Array(INPUT_SEND_CHUNK_SAMPLES));
  const inputChunkOffsetRef = useRef(0);

  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isOutputActiveRef = useRef(false);
  const outputEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPromiseRef = useRef<Promise<void> | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const isRecordingRef = useRef(false);

  const setRecordingState = useCallback((next: boolean) => {
    isRecordingRef.current = next;
    setIsRecording(next);
  }, []);

  const stopInputCapture = useCallback(() => {
    const processor = inputProcessorRef.current;
    inputProcessorRef.current = null;
    if (processor) {
      if ("port" in processor) {
        processor.port.onmessage = null;
      } else {
        processor.onaudioprocess = null;
      }
      try {
        processor.disconnect();
      } catch (err) {
        console.warn("[GeminiLive] Failed to disconnect input processor", err);
      }
    }

    const source = inputSourceRef.current;
    inputSourceRef.current = null;
    if (source) {
      try {
        source.disconnect();
      } catch (err) {
        console.warn("[GeminiLive] Failed to disconnect input source", err);
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
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
    stopInputCapture();

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
  }, [stopInputCapture]);

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

  const flushInputChunk = useCallback(() => {
    const chunkOffset = inputChunkOffsetRef.current;
    if (chunkOffset <= 0) return;
    inputChunkOffsetRef.current = 0;

    const chunk = inputChunkRef.current;
    const copy = chunk.slice(0, chunkOffset);
    const blob = createBlob(copy);
    onInputAudio(blob);
  }, [onInputAudio]);

  const handleInputFrame = useCallback(
    (frame: Float32Array) => {
      const level = calcRmsLevel(frame);
      const now = performance.now();
      if (now - lastInputUpdateRef.current > LEVEL_UPDATE_INTERVAL) {
        setInputLevel(level);
        lastInputUpdateRef.current = now;
      }

      let sourceOffset = 0;
      while (sourceOffset < frame.length) {
        const chunk = inputChunkRef.current;
        const chunkOffset = inputChunkOffsetRef.current;
        const remaining = chunk.length - chunkOffset;
        const available = frame.length - sourceOffset;
        const toCopy = Math.min(remaining, available);

        chunk.set(frame.subarray(sourceOffset, sourceOffset + toCopy), chunkOffset);
        inputChunkOffsetRef.current += toCopy;
        sourceOffset += toCopy;

        if (inputChunkOffsetRef.current === chunk.length) {
          inputChunkOffsetRef.current = 0;
          const blob = createBlob(chunk);
          onInputAudio(blob);
        }
      }
    },
    [onInputAudio],
  );

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

        stopInputCapture();

        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia is not available in this environment.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;

        const source = inputContext.createMediaStreamSource(stream);
        inputSourceRef.current = source;

        const canUseWorklet =
          typeof inputContext.audioWorklet?.addModule === "function" &&
          typeof AudioWorkletNode !== "undefined";

        if (canUseWorklet) {
          if (!workletLoadedRef.current) {
            const blob = new Blob([AUDIO_WORKLET_PROCESSOR_CODE], {
              type: "application/javascript",
            });
            const url = URL.createObjectURL(blob);
            try {
              await inputContext.audioWorklet.addModule(url);
              workletLoadedRef.current = true;
            } finally {
              URL.revokeObjectURL(url);
            }
          }

          const worklet = new AudioWorkletNode(inputContext, "gemini-audio-processor");
          worklet.port.onmessage = (event) => {
            if (!isRecordingRef.current) return;
            const data = event.data as unknown;
            if (!(data instanceof Float32Array)) return;
            handleInputFrame(new Float32Array(data));
          };

          source.connect(worklet);
          worklet.connect(inputContext.destination);
          inputProcessorRef.current = worklet;
        } else {
          const processor = inputContext.createScriptProcessor(1024, 1, 1);
          processor.onaudioprocess = (event) => {
            if (!isRecordingRef.current) return;
            const input = event.inputBuffer.getChannelData(0);
            handleInputFrame(new Float32Array(input));
          };

          source.connect(processor);
          processor.connect(inputContext.destination);
          inputProcessorRef.current = processor;
        }

        setRecordingState(true);
      } catch (err: unknown) {
        console.error("Mic error", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        onError(`Microphone access failed: ${message}`);

        stopInputCapture();
        setRecordingState(false);
      } finally {
        startPromiseRef.current = null;
      }
    })();

    startPromiseRef.current = startPromise;
    return startPromise;
  }, [
    handleInputFrame,
    onError,
    setRecordingState,
    stopInputCapture,
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
      } finally {
        flushInputChunk();
        stopInputCapture();
        setRecordingState(false);
        stopPromiseRef.current = null;
      }
    })();

    stopPromiseRef.current = stopPromise;
  }, [flushInputChunk, setRecordingState, stopInputCapture]);

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
