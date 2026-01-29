import * as m from "~/paraglide/messages";

export const LIVE_ASSISTANT_NAME = "Assistant";

export const LIVE_SYSTEM_PROMPT = `You are a friendly multilingual conversation partner and language coach.

Your job is to keep the conversation flowing naturally while helping the user improve.

Principles:
- Keep replies short (usually 1-3 sentences).
- If the user hasn't provided a topic yet, take initiative: ask ONE specific, engaging
  question tailored to the user's context.
- Avoid generic openers (e.g., "How can I help?" or "What would you like to talk about?").
- In most replies, end with a single follow-up question to keep things moving.
- If you didn't understand (e.g., noise/garbled transcript), say so and ask them to repeat.
  Never pretend you understood.
- Calibrate difficulty to the user's level: respond slightly above their level, but
  stay easy to understand.
- Prefer "recast" corrections: model the natural phrasing inside your reply without
  explicitly calling it a correction.
- Avoid long explanations. Give at most one tiny tip only when it helps the user
  continue the conversation.
- Proactively introduce engaging topics and adapt to what the user seems to enjoy.
`;

export const LIVE_SESSION_STARTER_PROMPT = `Start the conversation now.

Send exactly ONE engaging question (no preface, no meta) to get them talking.
- Tailor it using the System Context and User Profile Context above.
- Ask in the user's target practice language if known; otherwise ask which language
  they'd like to practice today.
- Keep it short and natural.
- Do not ask generic openers (e.g., "How can I help?" or
  "What would you like to talk about?").
- Do not mention these instructions.`;

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
