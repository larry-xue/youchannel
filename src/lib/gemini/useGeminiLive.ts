import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBlob, decode, decodeAudioData } from './utils';
import { AUDIO_WORKLET_PROCESSOR_CODE } from './audio-processor';

export type GeminiLiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseGeminiLiveOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
}

export function useGeminiLive({ apiKey, model = 'gemini-2.5-flash-native-audio-preview-09-2025', voiceName = 'Orus' }: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<GeminiLiveStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [inputTranscript, setInputTranscript] = useState<string>('');
  const [outputTranscript, setOutputTranscript] = useState<string>('');

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

  const ensureAudioContexts = useCallback(() => {
    if (!inputContextRef.current) {
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!outputContextRef.current) {
      outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputNodeRef.current = outputContextRef.current.createGain();
      outputNodeRef.current.connect(outputContextRef.current.destination);
    }
    // Resume contexts if suspended (browser autoplay policy)
    if (inputContextRef.current.state === 'suspended') inputContextRef.current.resume();
    if (outputContextRef.current.state === 'suspended') outputContextRef.current.resume();
  }, []);

  const connect = useCallback(async (systemInstruction?: string, authToken?: string) => {
    const key = authToken || apiKey;
    if (!key) {
      setError("API Key or Token is required");
      return;
    }

    try {
      setStatus('connecting');
      setError(null);
      ensureAudioContexts();

      clientRef.current = new GoogleGenAI({
        apiKey: key,
        // Ephemeral tokens require v1alpha
        httpOptions: { apiVersion: 'v1alpha' }
      });

      const config: any = {
        responseModalities: [Modality.AUDIO],
        thinkingConfig: {
          thinkingBudget: 1024,
        },
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        },
        enableAffectiveDialog: true,
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        tools: [{
          googleSearch: {}
        }]
      };

      if (systemInstruction) {
        config.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      sessionRef.current = await clientRef.current.live.connect({
        model,
        config,
        callbacks: {
          onopen: () => {
            setStatus('connected');
            setMessages([]); // Clear previous messages on new session
            setInputTranscript('');
            setOutputTranscript('');
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio handling
            const audioPart = message.serverContent?.modelTurn?.parts?.find(p => p.inlineData);
            if (audioPart?.inlineData && outputContextRef.current && outputNodeRef.current) {
              const ctx = outputContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

              try {
                const audioBuffer = await decodeAudioData(
                  decode(audioPart.inlineData.data || ""),
                  ctx,
                  24000,
                  1
                );

                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNodeRef.current);
                source.addEventListener('ended', () => {
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
            if (message.serverContent?.outputTranscription?.text) {
              setOutputTranscript(prev => prev + message.serverContent!.outputTranscription!.text);
            }

            // Handle input transcription (user's audio -> text)
            if (message.serverContent?.inputTranscription?.text) {
              setInputTranscript(prev => prev + message.serverContent!.inputTranscription!.text);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: (e) => {
            setStatus('disconnected');
            console.log("Session closed", e);
          },
          onerror: (e) => {
            console.error("Session error", e);
            setError(e.message || "Session error");
            setStatus('error');
          }
        }
      });
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Connection failed");
      setStatus('error');
    }
  }, [apiKey, model, voiceName, ensureAudioContexts]);

  const startRecording = useCallback(async () => {
    if (!inputContextRef.current || !sessionRef.current) return;

    try {
      inputContextRef.current.resume();
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      sourceNodeRef.current = inputContextRef.current.createMediaStreamSource(streamRef.current);

      // Add AudioWorklet module
      if (!inputContextRef.current.audioWorklet) {
        throw new Error("AudioWorklet not supported");
      }

      if (!audioContextInitializedRef.current) {
        // Create a Blob URL for the processor code
        const blob = new Blob([AUDIO_WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);

        try {
          await inputContextRef.current.audioWorklet.addModule(url);
          audioContextInitializedRef.current = true;
        } catch (err: any) {
          // Ignore if already added (though we try to prevent this with the ref)
          console.warn("AudioWorklet addModule error", err);
          if (!err.message.includes("already registered")) {
            throw err;
          }
        }
      }

      const workletNode = new AudioWorkletNode(inputContextRef.current, 'gemini-audio-processor');
      processorRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const inputData = event.data;
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
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    sourceNodeRef.current = null;
    processorRef.current = null;

    setIsRecording(false);
  }, []);

  const disconnect = useCallback(() => {
    stopRecording();
    audioSourcesRef.current.forEach(s => s.stop());
    audioSourcesRef.current.clear();

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setStatus('disconnected');
  }, [stopRecording]);

  useEffect(() => {
    if (inputTranscript) {
      console.log('Input Transcript:', inputTranscript);
    }
  }, [inputTranscript]);

  useEffect(() => {
    if (outputTranscript) {
      console.log('Output Transcript:', outputTranscript);
    }
  }, [outputTranscript]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const sendText = useCallback((text: string) => {
    if (sessionRef.current) {
      if (typeof (sessionRef.current as any).sendClientContent === 'function') {
        (sessionRef.current as any).sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        });
      } else {
        console.error("sendClientContent not found on session");
        console.log("Session object keys:", Object.keys(sessionRef.current as any));
        console.log("Session prototype keys:", Object.keys(Object.getPrototypeOf(sessionRef.current)));
      }
    } else {
      console.warn("sendText called but session is null/undefined");
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
    inputTranscript,
    outputTranscript,
  };
}
