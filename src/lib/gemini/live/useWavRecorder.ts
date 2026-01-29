import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_WORKLET_PROCESSOR_CODE } from "~/lib/gemini/audio-processor";
import { createWavBlob } from "~/lib/gemini/utils";

const INPUT_SAMPLE_RATE = 16000;

const mergeFloat32Chunks = (chunks: Float32Array[]) => {
  if (chunks.length === 0) return new Float32Array();
  if (chunks.length === 1) return chunks[0];
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

export type WavRecording = {
  audio: { mimeType: string; data: string };
  durationMs: number;
};

export function useWavRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const chunksRef = useRef<Float32Array[]>([]);
  const startAtRef = useRef<number | null>(null);

  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputProcessorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const workletLoadedRef = useRef(false);

  const stopCapture = useCallback(() => {
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
        console.warn("[WavRecorder] Failed to disconnect processor", err);
      }
    }

    const source = inputSourceRef.current;
    inputSourceRef.current = null;
    if (source) {
      try {
        source.disconnect();
      } catch (err) {
        console.warn("[WavRecorder] Failed to disconnect input source", err);
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const ensureContext = useCallback(() => {
    if (inputContextRef.current) return inputContextRef.current;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    inputContextRef.current = new AudioContextCtor({ sampleRate: INPUT_SAMPLE_RATE });
    return inputContextRef.current;
  }, []);

  const start = useCallback(async () => {
    if (isRecording) return;

    chunksRef.current = [];
    startAtRef.current = Date.now();
    setIsRecording(true);

    try {
      const inputContext = ensureContext();
      await inputContext.resume();

      stopCapture();

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
          if (!startAtRef.current) return;
          const data = event.data as unknown;
          if (!(data instanceof Float32Array)) return;
          chunksRef.current.push(new Float32Array(data));
        };
        source.connect(worklet);
        worklet.connect(inputContext.destination);
        inputProcessorRef.current = worklet;
      } else {
        const processor = inputContext.createScriptProcessor(1024, 1, 1);
        processor.onaudioprocess = (event) => {
          if (!startAtRef.current) return;
          const input = event.inputBuffer.getChannelData(0);
          chunksRef.current.push(new Float32Array(input));
        };
        source.connect(processor);
        processor.connect(inputContext.destination);
        inputProcessorRef.current = processor;
      }
    } catch (err) {
      console.error("[WavRecorder] Failed to start recording", err);
      stopCapture();
      startAtRef.current = null;
      setIsRecording(false);
      throw err instanceof Error ? err : new Error("Failed to start recording");
    }
  }, [ensureContext, isRecording, stopCapture]);

  const stop = useCallback((): WavRecording | null => {
    if (!isRecording) return null;

    const startedAt = startAtRef.current ?? Date.now();
    const durationMs = Math.max(0, Date.now() - startedAt);

    setIsRecording(false);
    startAtRef.current = null;
    stopCapture();

    const merged = mergeFloat32Chunks(chunksRef.current);
    chunksRef.current = [];

    const audio = createWavBlob(merged, INPUT_SAMPLE_RATE, 1);

    return { audio, durationMs };
  }, [isRecording, stopCapture]);

  useEffect(() => {
    return () => {
      stopCapture();
      const ctx = inputContextRef.current;
      inputContextRef.current = null;
      workletLoadedRef.current = false;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch((err) => {
          console.warn("[WavRecorder] Failed to close audio context", err);
        });
      }
    };
  }, [stopCapture]);

  return {
    isRecording,
    start,
    stop,
  };
}

