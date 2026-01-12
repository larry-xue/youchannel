const CHARACTER_KINDS = ["host", "guest", "narrator", "character", "unknown"] as const;
const CHARACTER_LANGUAGES = [
  "ar-EG",
  "de-DE",
  "en-US",
  "es-US",
  "fr-FR",
  "hi-IN",
  "id-ID",
  "it-IT",
  "zh-CN",
  "zh-TW",
  "zh-HK",
  "ja-JP",
  "ko-KR",
  "pt-BR",
  "ru-RU",
  "nl-NL",
  "pl-PL",
  "th-TH",
  "tr-TR",
  "vi-VN",
  "ro-RO",
  "uk-UA",
  "bn-BD",
  "en-IN",
  "mr-IN",
  "ta-IN",
  "te-IN",
] as const;

export type CharacterKind = (typeof CHARACTER_KINDS)[number];
export type CharacterLanguage = (typeof CHARACTER_LANGUAGES)[number];
export const CHARACTER_LANGUAGE_OPTIONS = CHARACTER_LANGUAGES;

export const CHARACTER_LANGUAGE_LABELS: Record<CharacterLanguage, string> = {
  "ar-EG": "العربية",
  "de-DE": "Deutsch",
  "en-US": "English (US)",
  "es-US": "Español (US)",
  "fr-FR": "Français",
  "hi-IN": "हिन्दी",
  "id-ID": "Bahasa Indonesia",
  "it-IT": "Italiano",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  "zh-HK": "繁體中文 (香港)",
  "ja-JP": "日本語",
  "ko-KR": "한국어",
  "pt-BR": "Português (Brasil)",
  "ru-RU": "Русский",
  "nl-NL": "Nederlands",
  "pl-PL": "Polski",
  "th-TH": "ไทย",
  "tr-TR": "Türkçe",
  "vi-VN": "Tiếng Việt",
  "ro-RO": "Română",
  "uk-UA": "Українська",
  "bn-BD": "বাংলা",
  "en-IN": "English (India)",
  "mr-IN": "मराठी",
  "ta-IN": "தமிழ்",
  "te-IN": "తెలుగు",
};


export type AnalysisWikiItem = {
  timestamp?: string;
  title?: string;
  details?: string;
};

export type AnalysisCharacter = {
  name: string;
  kind: CharacterKind;
  description: string;
  traits: string[];
  speaking_style: string;
  notable_topics: string[];
  voice: string;
  language: CharacterLanguage;
};

export type AnalysisTranscriptSegment = {
  start?: string;
  end?: string;
  speaker?: string;
  text?: string;
};

export type AnalysisTranscript = {
  language?: string;
  is_truncated?: boolean;
  cursor?: string;
  segments?: AnalysisTranscriptSegment[];
};

export type ParsedAnalysis = {
  scene?: string;
  summarize?: string;
  wiki?: AnalysisWikiItem[];
  characters?: AnalysisCharacter[];
  transcript?: AnalysisTranscript;
  contextWithoutCharacters?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function sanitizeStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const text = asString(entry);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

export function sanitizeCharacter(value: unknown): AnalysisCharacter | null {
  if (!value || typeof value !== "object") return null;
  const character = value as Record<string, unknown>;
  const name = asString(character.name);
  const description = asString(character.description);
  const speakingStyle = asString(character.speaking_style);
  const voice = asString(character.voice);
  const languageValue = asString(character.language);
  const traitsSource = character.traits;
  const traits = sanitizeStringArray(traitsSource);
  if (
    !name ||
    !description ||
    !speakingStyle ||
    !voice ||
    !Array.isArray(traitsSource) ||
    traits.length < 2
  ) {
    return null;
  }

  const kind = CHARACTER_KINDS.includes(character.kind as CharacterKind)
    ? (character.kind as CharacterKind)
    : "unknown";

  const language = languageValue as CharacterLanguage;

  const notableTopicsSource = character.notable_topics;
  if (!Array.isArray(notableTopicsSource)) return null;
  const notableTopics = sanitizeStringArray(notableTopicsSource, 8);

  return {
    name,
    kind,
    description,
    speaking_style: speakingStyle,
    traits,
    notable_topics: notableTopics,
    voice,
    language,
  };
}

export function parseAnalysisText(text?: string | null): ParsedAnalysis | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;

    const wiki = Array.isArray(record.wiki)
      ? record.wiki
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const entry = item as Record<string, unknown>;
          const timestamp = asString(entry.timestamp);
          const title = asString(entry.title);
          const details = asString(entry.details);
          if (!timestamp && !title && !details) return null;
          return { timestamp, title, details };
        })
        .filter(Boolean) as AnalysisWikiItem[]
      : undefined;

    const characters = Array.isArray(record.characters)
      ? (record.characters.map((entry) => sanitizeCharacter(entry)).filter(Boolean) as AnalysisCharacter[])
      : undefined;

    let transcript: AnalysisTranscript | undefined;
    if (record.transcript && typeof record.transcript === "object" && !Array.isArray(record.transcript)) {
      const transcriptRecord = record.transcript as Record<string, unknown>;
      const segments = Array.isArray(transcriptRecord.segments)
        ? (transcriptRecord.segments
          .map((segment) => {
            if (!segment || typeof segment !== "object") return null;
            const item = segment as Record<string, unknown>;
            const start = asString(item.start);
            const end = asString(item.end);
            const speaker = asString(item.speaker);
            const textValue = asString(item.text);
            if (!start && !end && !speaker && !textValue) return null;
            return { start, end, speaker, text: textValue };
          })
          .filter(Boolean) as AnalysisTranscriptSegment[])
        : undefined;

      transcript = {
        language: asString(transcriptRecord.language),
        is_truncated:
          typeof transcriptRecord.is_truncated === "boolean"
            ? transcriptRecord.is_truncated
            : undefined,
        cursor: asString(transcriptRecord.cursor),
        segments: segments && segments.length > 0 ? segments : undefined,
      };
    }

    const contextWithoutCharacters = (() => {
      try {
        const contextPayload: Record<string, unknown> = {
          scene: asString(record.scene),
          summarize: asString(record.summarize),
          wiki,
          transcript,
        };
        return JSON.stringify(contextPayload);
      } catch {
        return undefined;
      }
    })();

    return {
      scene: asString(record.scene),
      summarize: asString(record.summarize),
      wiki,
      characters,
      transcript,
      contextWithoutCharacters,
    };
  } catch {
    return null;
  }
}

export function getAnalysisContextWithoutCharacters(text?: string | null) {
  const parsed = parseAnalysisText(text);
  return parsed?.contextWithoutCharacters || text?.trim() || "";
}
