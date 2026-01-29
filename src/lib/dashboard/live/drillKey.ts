type DrillKeyInput = {
  language: string;
  kind: string;
  targetText: string;
};

type ParsedLanguageTag = {
  primary: string;
  script: string | null;
  region: string | null;
};

const parseLanguageTag = (value: string): ParsedLanguageTag => {
  const normalized = value.trim().replace(/_/g, "-");
  const parts = normalized.split("-").filter(Boolean);
  const primary = (parts[0] ?? "und").toLowerCase();

  let script: string | null = null;
  let region: string | null = null;

  for (const part of parts.slice(1)) {
    if (!script && /^[A-Za-z]{4}$/.test(part)) {
      script = part[0].toUpperCase() + part.slice(1).toLowerCase();
      continue;
    }
    if (!region && (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part))) {
      region = part.toUpperCase();
    }
  }

  return { primary, script, region };
};

const deriveChineseScriptFromRegion = (region: string | null) => {
  if (!region) return null;
  const hansRegions = new Set(["CN", "SG", "MY"]);
  const hantRegions = new Set(["TW", "HK", "MO"]);
  if (hansRegions.has(region)) return "Hans";
  if (hantRegions.has(region)) return "Hant";
  return null;
};

const canonicalizeLanguageForDrillKey = (language: string) => {
  const parsed = parseLanguageTag(language);
  if (parsed.primary === "zh") {
    const script = parsed.script ?? deriveChineseScriptFromRegion(parsed.region);
    return script ? `zh-${script}` : "zh";
  }
  return parsed.primary;
};

const normalizeTargetText = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

export function computeDrillKey({ language, kind, targetText }: DrillKeyInput): string {
  const canonicalLanguage = canonicalizeLanguageForDrillKey(language);
  const normalized = normalizeTargetText(targetText);
  const source = `${canonicalLanguage}|${kind}|${normalized}`;

  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(source);

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash.toString(16).padStart(16, "0");
}
