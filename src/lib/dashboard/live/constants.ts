import * as m from "~/paraglide/messages";

export const LIVE_ASSISTANT_NAME = "Assistant";

export const LIVE_SYSTEM_PROMPT = `You are a multilingual conversation trainer. Your role is to:
1. Proactively find and introduce engaging topics
2. Be patient, encouraging, and supportive
3. Ask clear follow-up questions that help the user practice

Keep responses brief, friendly, and natural. Adapt to the user's language level.`;

const VOICE_DEFINITIONS = [
  { name: "Puck" },
  { name: "Charon" },
  { name: "Kore" },
  { name: "Fenrir" },
  { name: "Aoede" },
  { name: "Leda" },
  { name: "Orus" },
  { name: "Zephyr" },
] as const;

export type VoiceName = (typeof VOICE_DEFINITIONS)[number]["name"];

const VOICE_STYLE_MAP: Record<VoiceName, () => string> = {
  Puck: m.live_voice_style_puck,
  Charon: m.live_voice_style_charon,
  Kore: m.live_voice_style_kore,
  Fenrir: m.live_voice_style_fenrir,
  Aoede: m.live_voice_style_aoede,
  Leda: m.live_voice_style_leda,
  Orus: m.live_voice_style_orus,
  Zephyr: m.live_voice_style_zephyr,
};

export type VoiceOption = {
  name: VoiceName;
  style: string;
};

export const getVoiceOptions = (): VoiceOption[] =>
  VOICE_DEFINITIONS.map((voice) => ({
    name: voice.name,
    style: VOICE_STYLE_MAP[voice.name](),
  }));

export const DEFAULT_VOICE_NAME: VoiceName = "Kore";

export const isVoiceName = (value: string): value is VoiceName =>
  VOICE_DEFINITIONS.some((voice) => voice.name === value);
