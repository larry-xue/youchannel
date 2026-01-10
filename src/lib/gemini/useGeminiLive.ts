import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import { useCallback, useRef, useState } from 'react';
import { createBlob, decode, decodeAudioData } from './utils';

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

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

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
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        },
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

            // Text/Transcript handling
            const textParts = message.serverContent?.modelTurn?.parts?.filter(p => p.text);
            if (textParts && textParts.length > 0) {
              const textContent = textParts.map(p => p.text).join("");
              if (textContent) {
                setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  // If the last message is from assistant, append to it (streaming text)
                  if (lastMsg && lastMsg.role === 'assistant') {
                    return [
                      ...prev.slice(0, -1),
                      { ...lastMsg, content: lastMsg.content + textContent }
                    ];
                  }
                  // Otherwise new message
                  return [...prev, { role: 'assistant', content: textContent }];
                });
              }
            }

            // To capture User's turn, we might need to rely on 'speech' events or 'turnComplete' if provided.
            // But typically for Live API we might not get user text back unless we do STT ourselves or the API echoes it.
            // For now, we focus on Assistant response.

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              // Optional: Mark the last message as interrupted or trim it?
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

  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(async () => {
    if (!inputContextRef.current || !sessionRef.current) return;

    try {
      inputContextRef.current.resume();
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      sourceNodeRef.current = inputContextRef.current.createMediaStreamSource(streamRef.current);

      const bufferSize = 256; // Smaller buffer = lower latency
      processorRef.current = inputContextRef.current.createScriptProcessor(bufferSize, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Send off to session
        sessionRef.current?.sendRealtimeInput({ media: createBlob(inputData) });
      };

      sourceNodeRef.current.connect(processorRef.current);
      processorRef.current.connect(inputContextRef.current.destination);

      // Start Web Speech API for user transcription fallback
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }

          if (finalTranscript) {
            setMessages(prev => {
              // Determine if we should append to last user message or create new one
              // Since this is real-time, simple append new message is safer for now
              return [...prev, { role: 'user', content: finalTranscript }];
            });
          }
        };
        recognitionRef.current.start();
      }

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

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

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

  return {
    connect,
    disconnect,
    startRecording,
    stopRecording,
    status,
    error,
    isRecording,
    messages // Currently empty as we don't parse transcript
  };
}
