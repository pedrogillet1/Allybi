import crypto from "crypto";

import type { LanguageCode } from "../../types/common.types";
import type { ParagraphNode } from "./docx/docxAnchors.service";

export type DocxEditSuggestion = {
  id: string;
  label: string;
  instruction: string;
  paragraphId: string;
  sectionPath: string[];
  previewText: string;
};

function clip(s: string, n: number): string {
  const t = String(s || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return "";
  return t.length <= n ? t : `${t.slice(0, n).trimEnd()}…`;
}

function normalizeWs(s: string): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function seedToUint32(seed: string): number {
  const hex = crypto
    .createHash("sha256")
    .update(String(seed || ""))
    .digest("hex")
    .slice(0, 8);
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? n >>> 0 : 0;
}

// Small, fast seeded RNG (deterministic).
function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function todayIsoDate(): string {
  // Server-local date is fine; this seed is only for mild day-to-day variation.
  const d = new Date();
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makeSuggestionId(
  documentId: string,
  paragraphId: string,
  label: string,
): string {
  const payload = `${documentId}::${paragraphId}::${label}`;
  const digest = crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  return `sug_${digest}`;
}

function hasManyCommas(text: string): boolean {
  const t = String(text || "");
  const commas = (t.match(/,/g) || []).length;
  return commas >= 5 || (commas >= 3 && t.length > 260);
}

function isListLike(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\n\s*[-*]\s+/.test(t)) return true;
  if (/\n\s*\d+\.\s+/.test(t)) return true;
  if (/(?:^|[.;])\s*(?:\([a-z]\)|\([ivx]+\)|[a-z]\)|[ivx]+\.)\s+/i.test(t))
    return true;
  if (t.includes(":") && (t.match(/;/g) || []).length >= 2) return true;
  return false;
}

function hasVagueWords(text: string): boolean {
  const low = String(text || "").toLowerCase();
  return /\b(various|etc\.?|some|often|soon|asap|maybe|generally|including but not limited to)\b/.test(
    low,
  );
}

function sectionHint(sectionPath: string[]): string {
  return sectionPath.map((s) => String(s || "").toLowerCase()).join(" / ");
}

type Template = {
  key: string;
  labelVariants: string[];
  score: (params: { text: string; sectionPath: string[] }) => number;
  build: (params: {
    lang: LanguageCode;
    text: string;
    sectionPath: string[];
  }) => string;
};

const TEMPLATES: Template[] = [
  {
    key: "tighten_summary",
    labelVariants: ["Tighten summary", "Make it concise", "Executive rewrite"],
    score: ({ text, sectionPath }) => {
      const sec = sectionHint(sectionPath);
      let s = 0;
      if (/(executive summary|summary|overview|introduction)\b/.test(sec))
        s += 6;
      if (text.length > 240) s += 2;
      if (hasManyCommas(text)) s += 1;
      return s;
    },
    build: ({ lang }) => {
      if (lang === "pt")
        return "Reescreva este parágrafo para ficar 30–40% mais curto e mais executivo; preserve números e nomes; não adicione fatos.";
      if (lang === "es")
        return "Reescribe este párrafo para que sea 30–40% más corto y más ejecutivo; conserva números y nombres; no agregues hechos.";
      return "Rewrite this paragraph to be 30–40% shorter and more executive; preserve numbers and named entities; don’t add new facts.";
    },
  },
  {
    key: "clarify_scope",
    labelVariants: ["Clarify scope", "Make scope explicit", "Add exclusions"],
    score: ({ text, sectionPath }) => {
      const sec = sectionHint(sectionPath);
      let s = 0;
      if (/\bscope\b/.test(sec)) s += 7;
      if (
        /\b(deliverable|deliverables|out of scope|exclude|exclusions|assumption|assumptions)\b/.test(
          sec,
        )
      )
        s += 4;
      if (hasVagueWords(text)) s += 2;
      return s;
    },
    build: ({ lang }) => {
      if (lang === "pt")
        return "Reescreva este parágrafo para definir claramente escopo, entregáveis e exclusões; preserve números e nomes; não adicione fatos.";
      if (lang === "es")
        return "Reescribe este párrafo para definir claramente alcance, entregables y exclusiones; conserva números y nombres; no agregues hechos.";
      return "Rewrite this paragraph to clearly define scope, deliverables, and exclusions; preserve numbers and named entities; don’t add new facts.";
    },
  },
  {
    key: "convert_to_bullets",
    labelVariants: ["Convert to bullets", "Bullet this", "Make it scannable"],
    score: ({ text }) => {
      let s = 0;
      if (isListLike(text)) s += 5;
      if (text.length > 220) s += 2;
      if ((text.match(/;/g) || []).length >= 2) s += 1;
      return s;
    },
    build: ({ lang }) => {
      if (lang === "pt")
        return "Converta este parágrafo em 4–7 bullet points; mantenha o significado; preserve números e nomes.";
      if (lang === "es")
        return "Convierte este párrafo en 4–7 viñetas; mantiene el significado; conserva números y nombres.";
      return "Convert this paragraph into 4–7 bullet points; keep the meaning; preserve numbers and named entities.";
    },
  },
  {
    key: "split_simplify",
    labelVariants: [
      "Simplify language",
      "Split long sentence",
      "Improve clarity",
    ],
    score: ({ text }) => {
      let s = 0;
      if (hasManyCommas(text)) s += 6;
      if (text.length > 260) s += 2;
      return s;
    },
    build: ({ lang }) => {
      if (lang === "pt")
        return "Reescreva com frases mais curtas e claras (voz ativa); preserve o significado, números e nomes; não adicione fatos.";
      if (lang === "es")
        return "Reescribe con frases más cortas y claras (voz activa); conserva el significado, números y nombres; no agregues hechos.";
      return "Rewrite using shorter, clearer sentences (active voice); preserve meaning, numbers, and names; don’t add new facts.";
    },
  },
  {
    key: "make_specific",
    labelVariants: [
      "Make it specific",
      "Remove vague wording",
      "Add measurable detail",
    ],
    score: ({ text }) => (hasVagueWords(text) ? 6 : 0),
    build: ({ lang }) => {
      if (lang === "pt")
        return "Reescreva para remover termos vagos e tornar o texto específico e verificável; preserve números e nomes; não adicione fatos.";
      if (lang === "es")
        return "Reescribe para eliminar términos vagos y hacer el texto específico y verificable; conserva números y nombres; no agregues hechos.";
      return "Rewrite to remove vague wording and make the text specific and verifiable; preserve numbers and named entities; don’t add new facts.";
    },
  },
  {
    key: "normalize_terms",
    labelVariants: ["Normalize terms", "Fix consistency", "Align terminology"],
    score: ({ sectionPath }) => {
      const sec = sectionHint(sectionPath);
      if (/\b(definition|definitions|terms|glossary)\b/.test(sec)) return 6;
      return 1;
    },
    build: ({ lang }) => {
      if (lang === "pt")
        return "Reescreva para padronizar termos (capitalização/consistência) sem mudar o significado; preserve números e nomes.";
      if (lang === "es")
        return "Reescribe para estandarizar términos (capitalización/consistencia) sin cambiar el significado; conserva números y nombres.";
      return "Rewrite to standardize terms (capitalization/consistency) without changing meaning; preserve numbers and named entities.";
    },
  },
];

function pickTemplate(params: {
  text: string;
  sectionPath: string[];
  rand: () => number;
}): Template {
  const scored = TEMPLATES.map((t) => ({
    t,
    s: t.score({ text: params.text, sectionPath: params.sectionPath }),
  }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.filter((x) => x.s === scored[0].s).map((x) => x.t);
  // Tie-break with RNG so documents with similar structure still vary.
  return top[Math.floor(params.rand() * top.length)] || scored[0].t;
}

function pickUniqueLabel(
  template: Template,
  used: Set<string>,
  rand: () => number,
): string {
  const variants = [...template.labelVariants];
  shuffleInPlace(variants, rand);
  for (const v of variants) {
    if (!used.has(v)) return v;
  }
  // Last-resort: suffix.
  let i = 2;
  while (used.has(`${template.labelVariants[0]} ${i}`)) i += 1;
  return `${template.labelVariants[0]} ${i}`;
}

export class EditSuggestionsService {
  suggestDocx(params: {
    documentId: string;
    paragraphs: ParagraphNode[];
    count: number;
    seed?: string;
    language?: LanguageCode;
  }): DocxEditSuggestion[] {
    const docId = String(params.documentId || "").trim();
    const lang: LanguageCode =
      params.language === "pt" || params.language === "es"
        ? params.language
        : "en";
    const count = Math.max(
      1,
      Math.min(12, Math.trunc(Number(params.count || 6) || 6)),
    );

    const seed =
      String(params.seed || "").trim() || `${docId}:${todayIsoDate()}`;
    const rand = mulberry32(seedToUint32(seed));

    const raw = Array.isArray(params.paragraphs) ? params.paragraphs : [];
    const candidates = raw
      .filter((p) => {
        const text = normalizeWs(p?.text || "");
        if (!text) return false;
        if (text.length < 40) return false;
        if (text.length > 900) return false;
        return true;
      })
      .map((p) => ({
        paragraphId: String(p.paragraphId || ""),
        sectionPath: Array.isArray(p.sectionPath)
          ? p.sectionPath.map((x) => String(x || "")).filter(Boolean)
          : [],
        text: normalizeWs(p.text || ""),
        headingLevel:
          typeof (p as any).headingLevel === "number"
            ? (p as any).headingLevel
            : null,
        styleName:
          typeof (p as any).styleName === "string"
            ? String((p as any).styleName)
            : "",
      }))
      .filter((p) => p.paragraphId && p.text);

    // Mildly deprioritize headings; still allow if doc is mostly headings.
    const bodyFirst = candidates.sort((a, b) => {
      const ah = a.headingLevel != null || /heading/i.test(a.styleName);
      const bh = b.headingLevel != null || /heading/i.test(b.styleName);
      return Number(ah) - Number(bh);
    });

    // Seeded shuffle for variation.
    shuffleInPlace(bodyFirst, rand);

    const usedParagraphs = new Set<string>();
    const usedLabels = new Set<string>();
    const perSectionCount = new Map<string, number>();

    const out: DocxEditSuggestion[] = [];
    for (const p of bodyFirst) {
      if (out.length >= count) break;
      if (usedParagraphs.has(p.paragraphId)) continue;

      const secKey = (
        p.sectionPath && p.sectionPath.length
          ? p.sectionPath.join(" / ")
          : "Document"
      ).slice(0, 160);
      const secN = perSectionCount.get(secKey) || 0;
      if (secN >= 2) continue;

      const template = pickTemplate({
        text: p.text,
        sectionPath: p.sectionPath,
        rand,
      });
      const label = pickUniqueLabel(template, usedLabels, rand);
      const instruction = template.build({
        lang,
        text: p.text,
        sectionPath: p.sectionPath,
      });

      usedParagraphs.add(p.paragraphId);
      usedLabels.add(label);
      perSectionCount.set(secKey, secN + 1);

      out.push({
        id: makeSuggestionId(docId, p.paragraphId, label),
        label,
        instruction,
        paragraphId: p.paragraphId,
        sectionPath: p.sectionPath,
        previewText: clip(p.text, 260),
      });
    }

    return out;
  }
}
