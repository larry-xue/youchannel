# src/lib/dashboard/live (Live Voice Chat)

## OVERVIEW

- Standalone voice chat interface without video context
- Uses Gemini Live API for real-time voice conversation
- Selectable "Persona" for different conversation styles
- Dynamic ambient glow background that reacts to audio levels

## KEY COMPONENTS

- **LiveVoiceSession**: Main session controller (connect/disconnect, transcription display)
- **AmbientGlowBackdrop**: Layered radial glow background with audio-reactive animation
- **PersonaSelector**: Dropdown to choose conversation partner persona

## AUDIO LEVEL FLOW

1. `useGeminiLive` hook exposes `inputLevel` (0-1) from mic RMS
2. `useGeminiLive` hook exposes `outputLevel` (0-1) from playback RMS
3. `LiveVoiceSession` passes levels to parent via callback
4. `AmbientGlowBackdrop` maps levels to glow opacity/scale

## DEPENDENCIES

- `src/lib/gemini/useGeminiLive.ts` - Core voice hook
- `src/lib/gemini/actions.ts` - Token generation
- Shadcn UI: Button, ScrollArea, DropdownMenu
