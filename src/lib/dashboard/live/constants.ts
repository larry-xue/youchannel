import * as m from "~/paraglide/messages";

export interface Persona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  defaultVoice: string;
  defaultLanguage: string;
  emoji: string;
}

type PersonaDefinition = Omit<Persona, "name" | "description">;

const PERSONA_DEFINITIONS: PersonaDefinition[] = [
  {
    id: "friend",
    systemPrompt: `You are a multilingual conversation trainer. Your role is to:
1. Proactively find and introduce engaging topics
2. Be patient, encouraging, and supportive
3. Ask clear follow-up questions that help the user practice

Keep responses brief, friendly, and natural. Adapt to the user's language level.`,
    defaultVoice: "Kore",
    defaultLanguage: "en",
    emoji: "😊",
  },
  {
    id: "coach",
    systemPrompt: `You are a professional interview coach. Your role is to:
1. Ask realistic interview questions
2. Provide constructive feedback on answers
3. Suggest improvements
4. Help build confidence

Keep questions focused and feedback actionable. Be professional but supportive.`,
    defaultVoice: "Charon",
    defaultLanguage: "en",
    emoji: "💼",
  },
];

const getPersonaStrings = (id: PersonaDefinition["id"]) => {
  switch (id) {
    case "friend":
      return {
        name: m.live_persona_friend(),
        description: m.live_persona_friend_desc(),
      };
    case "coach":
      return {
        name: m.live_persona_coach(),
        description: m.live_persona_coach_desc(),
      };
    default:
      return {
        name: m.live_persona_friend(),
        description: m.live_persona_friend_desc(),
      };
  }
};

const buildPersona = (persona: PersonaDefinition): Persona => {
  const strings = getPersonaStrings(persona.id);
  return {
    ...persona,
    name: strings.name,
    description: strings.description,
  };
};

export const getPersonas = (): Persona[] =>
  PERSONA_DEFINITIONS.map((persona) => buildPersona(persona));

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

type VoiceName = (typeof VOICE_DEFINITIONS)[number]["name"];

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

export const DEFAULT_PERSONA_ID = "tutor";

export function getPersonaById(id: string): Persona {
  const persona = PERSONA_DEFINITIONS.find((p) => p.id === id);
  return buildPersona(persona ?? PERSONA_DEFINITIONS[0]);
}
