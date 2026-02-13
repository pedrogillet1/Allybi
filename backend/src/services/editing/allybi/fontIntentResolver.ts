import { loadAllybiBanks } from "./loadBanks";

export interface FontIntentResolution {
  matched: boolean;
  ambiguous: boolean;
  confidence: number;
  language: "en" | "pt";
  canonicalFamily?: string;
  candidates: string[];
  supportedFamilies: string[];
}

function normalized(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalized(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function hasWholePhrase(text: string, phrase: string): boolean {
  const t = ` ${normalized(text)} `;
  const p = ` ${normalized(phrase)} `;
  return p.trim().length > 0 && t.includes(p);
}

function editDistanceWithinOne(a: string, b: string): boolean {
  if (a === b) return true;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < al && j < bl) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (al > bl) {
      i += 1;
    } else if (bl > al) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  if (i < al || j < bl) edits += 1;
  return edits <= 1;
}

function hasFuzzyAlias(textTokens: string[], alias: string): boolean {
  const aliasTokens = tokenize(alias);
  if (!aliasTokens.length || textTokens.length < aliasTokens.length) return false;
  for (let start = 0; start <= textTokens.length - aliasTokens.length; start += 1) {
    const slice = textTokens.slice(start, start + aliasTokens.length);
    let ok = true;
    for (let i = 0; i < aliasTokens.length; i += 1) {
      if (!editDistanceWithinOne(slice[i], aliasTokens[i])) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function hasDirectiveCue(message: string, language: "en" | "pt"): boolean {
  const banks = loadAllybiBanks();
  const cueBank = banks.fontAliases?.phrases && typeof banks.fontAliases.phrases === "object"
    ? banks.fontAliases.phrases
    : {};
  const raw = Array.isArray(cueBank?.[language]) ? cueBank[language] : [];
  const cues = raw.map((x: any) => normalized(String(x || ""))).filter(Boolean);
  const defaultCues = language === "pt"
    ? ["mude para", "troque para", "deixe em", "coloque em", "use"]
    : ["change to", "set to", "make this", "use", "switch to"];
  const joined = normalized(message);
  return [...cues, ...defaultCues].some((cue) => cue.length > 0 && joined.includes(cue));
}

export function resolveFontIntent(message: string, language: "en" | "pt"): FontIntentResolution {
  const banks = loadAllybiBanks();
  const familiesObj = banks.fontAliases?.families && typeof banks.fontAliases.families === "object"
    ? (banks.fontAliases.families as Record<string, any>)
    : {};
  const supportedFamilies = Object.keys(familiesObj).filter(Boolean);
  const text = String(message || "");
  const normText = normalized(text);
  const textTokens = tokenize(text);
  const cue = hasDirectiveCue(text, language);

  let best: { family: string; confidence: number } | null = null;
  const ambiguous: string[] = [];

  for (const family of supportedFamilies) {
    const info = familiesObj[family] || {};
    const aliases = Array.isArray(info.aliases) ? info.aliases : [];
    const ambiguousAliases = Array.isArray(info.ambiguous) ? info.ambiguous : [];
    const allAliases = [family, ...aliases]
      .map((x: any) => String(x || "").trim())
      .filter(Boolean);

    let exactMatch = false;
    let fuzzyMatch = false;
    for (const alias of allAliases) {
      if (hasWholePhrase(normText, alias)) {
        exactMatch = true;
        break;
      }
    }
    if (!exactMatch) {
      for (const alias of allAliases) {
        if (hasFuzzyAlias(textTokens, alias)) {
          fuzzyMatch = true;
          break;
        }
      }
    }

    for (const amb of ambiguousAliases.map((x: any) => String(x || "").trim()).filter(Boolean)) {
      if (hasWholePhrase(normText, amb)) ambiguous.push(family);
    }

    if (!exactMatch && !fuzzyMatch) continue;
    const confidence = exactMatch
      ? (cue ? 0.95 : 0.86)
      : (cue ? 0.8 : 0.72);

    if (!best || confidence > best.confidence) {
      best = { family, confidence };
    }
  }

  if (best) {
    return {
      matched: true,
      ambiguous: false,
      confidence: best.confidence,
      language,
      canonicalFamily: best.family,
      candidates: [best.family],
      supportedFamilies,
    };
  }

  const uniqueAmbiguous = Array.from(new Set(ambiguous));
  if (uniqueAmbiguous.length > 0) {
    return {
      matched: false,
      ambiguous: true,
      confidence: 0.6,
      language,
      candidates: uniqueAmbiguous,
      supportedFamilies,
    };
  }

  return {
    matched: false,
    ambiguous: false,
    confidence: 0,
    language,
    candidates: [],
    supportedFamilies,
  };
}

