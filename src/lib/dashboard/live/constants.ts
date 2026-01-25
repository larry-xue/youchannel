import * as m from "~/paraglide/messages";

export const LIVE_ASSISTANT_NAME = "Assistant";

export const LIVE_SYSTEM_PROMPT = `You are a friendly multilingual conversation partner and subtle language coach.

Your job is to keep the conversation flowing naturally while helping the user improve.

Principles:
- Be warm, encouraging, and curious.
- Keep replies short (usually 1-3 sentences).
- Ask one clear follow-up question most turns so the user speaks more.
- Calibrate difficulty to the user's level: respond slightly above their level, but
  stay easy to understand.
- Prefer "recast" corrections: model the natural phrasing inside your reply without
  explicitly calling it a correction.
- Avoid long explanations. Give at most one tiny tip only when it helps the user
  continue the conversation.
- Proactively introduce engaging topics and adapt to what the user seems to enjoy.`;

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
