# src/lib/gemini (Client AI)

## OVERVIEW

- Handles client-side interactive AI features.
- Primary focus: **Gemini Live** (Realtime Audio/Multimodal).
- Uses `@google/genai` directly for WebSocket-based streaming.

## KEY HOOKS

- **useGeminiLive**: Main entry point for realtime voice interaction.
  - Manages `AudioContext` for capture and playback.
  - Handles `AudioWorklet` for low-latency PCM processing.
  - Exposes `status`, `messages`, `connect/disconnect`, `start/stopRecording`.
- **audio-processor.ts**: Pure string JS for `AudioWorkletProcessor`.
  - Bridges browser audio stream to Gemini SDK.
- **utils.ts**: Audio encoding/decoding (Base64/PCM).

## CLIENT VS SERVER

- **src/lib/gemini (Client)**:
  - Stateful WebSockets via `@google/genai`.
  - Real-time audio I/O.
  - Browser-only APIs (AudioWorklet, MediaDevices).
- **src/lib/server/gemini.ts (Server)**:
  - Stateless REST calls via TanStack AI.
  - Video analysis and batch chat.
  - Node.js/Edge compatible logic.
