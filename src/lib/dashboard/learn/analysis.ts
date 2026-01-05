const CHARACTER_KINDS = ["host", "guest", "narrator", "character", "unknown"] as const;

export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export type AnalysisWikiItem = {
  timestamp?: string;
  title?: string;
  details?: string;
};

export type CharacterEvidence = {
  timestamp?: string;
  quote?: string;
};

export type AnalysisCharacter = {
  name: string;
  kind: CharacterKind;
  description: string;
  traits: string[];
  speaking_style: string;
  notable_topics?: string[];
  evidence?: CharacterEvidence[];
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

function sanitizeEvidence(value: unknown) {
  if (!Array.isArray(value)) return [] as CharacterEvidence[];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const evidence = entry as Record<string, unknown>;
      const timestamp = asString(evidence.timestamp);
      const quote = asString(evidence.quote);
      if (!timestamp && !quote) return null;
      return { timestamp, quote };
    })
    .filter(Boolean) as CharacterEvidence[];
}

export function sanitizeCharacter(value: unknown): AnalysisCharacter | null {
  if (!value || typeof value !== "object") return null;
  const character = value as Record<string, unknown>;
  const name = asString(character.name);
  const description = asString(character.description);
  const speakingStyle = asString(character.speaking_style);
  const traits = sanitizeStringArray(character.traits, 6);
  if (!name || !description || !speakingStyle || traits.length === 0) return null;

  const kind = CHARACTER_KINDS.includes(character.kind as CharacterKind)
    ? (character.kind as CharacterKind)
    : "unknown";

  const notableTopics = sanitizeStringArray(character.notable_topics, 8);
  const evidence = sanitizeEvidence(character.evidence);

  return {
    name,
    kind,
    description,
    speaking_style: speakingStyle,
    traits,
    notable_topics: notableTopics.length ? notableTopics : undefined,
    evidence: evidence.length ? evidence : undefined,
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
        const copy: Record<string, unknown> = { ...record };
        delete copy.characters;
        return JSON.stringify(copy);
      } catch {
        return undefined;
      }
    })();

    return {
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
