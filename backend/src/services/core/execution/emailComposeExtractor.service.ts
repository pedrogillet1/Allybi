/* eslint-disable @typescript-eslint/no-explicit-any */

import { getOptionalBank } from "../banks/bankLoader.service";

type LanguageCode = "en" | "pt" | "es";

type RegexByLang = Partial<Record<LanguageCode, string[]>> & { any?: string[] };

interface EmailActionOperatorsBank {
  _meta: any;
  config?: {
    enabled?: boolean;
    composeExtraction?: {
      maxFieldChars?: { subject?: number; body?: number };
      provider?: {
        allowed?: string[];
        aliases?: Record<string, string>;
      };
      fields?: {
        to?: { patterns?: RegexByLang };
        subject?: { patterns?: RegexByLang };
        body?: { patterns?: RegexByLang };
        attachmentNames?: { patterns?: RegexByLang };
      };
      hints?: {
        length?: {
          short?: { patterns?: RegexByLang };
          long?: { patterns?: RegexByLang };
        };
        tone?: {
          professionalWarm?: { patterns?: RegexByLang };
          formal?: { patterns?: RegexByLang };
          casual?: { patterns?: RegexByLang };
        };
        purpose?: {
          patterns?: RegexByLang;
        };
      };
    };
  };
  microcopy?: any;
}

function safeRegex(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function pickPatterns(
  rule: RegexByLang | undefined,
  lang: LanguageCode,
): string[] {
  if (!rule) return [];
  return [...(rule.any ?? []), ...(rule[lang] ?? [])];
}

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(input: string): string {
  return stripDiacritics(String(input || ""))
    .replace(/\s+/g, " ")
    .trim();
}

export interface ExtractedEmailCompose {
  provider: "gmail" | "outlook" | "email" | null;
  to: string | null;
  subject: string | null;
  body: string | null;
  attachmentNames: string[];
  lengthHint?: "short" | "long" | null;
  toneHint?: "professional_warm" | "formal" | "casual" | null;
  purposeHint?: string | null;
}

export class EmailComposeExtractorService {
  private readonly bank: EmailActionOperatorsBank | null;

  constructor() {
    this.bank =
      getOptionalBank<EmailActionOperatorsBank>("email_action_operators") ??
      null;
  }

  isEnabled(): boolean {
    return Boolean(this.bank?.config?.enabled);
  }

  extract(message: string, lang: LanguageCode = "en"): ExtractedEmailCompose {
    const cfg = this.bank?.config?.composeExtraction;
    const maxSubject = cfg?.maxFieldChars?.subject ?? 160;
    const maxBody = cfg?.maxFieldChars?.body ?? 6000;

    const raw = String(message || "");
    const normalized = normalize(raw).toLowerCase();

    const provider = this.extractProvider(normalized);

    const to =
      this.extractFirst(cfg?.fields?.to?.patterns, raw, lang)?.trim() ?? null;
    const subjectRaw = this.extractFirst(
      cfg?.fields?.subject?.patterns,
      raw,
      lang,
    );
    const bodyRaw = this.extractFirst(cfg?.fields?.body?.patterns, raw, lang);
    const attRaw = this.extractAll(
      cfg?.fields?.attachmentNames?.patterns,
      raw,
      lang,
    );
    const purposeHint = this.extractFirst(
      cfg?.hints?.purpose?.patterns,
      raw,
      lang,
    );

    const lengthHint = (() => {
      const hasShort = this.matchesAny(
        cfg?.hints?.length?.short?.patterns,
        raw,
        lang,
      );
      const hasLong = this.matchesAny(
        cfg?.hints?.length?.long?.patterns,
        raw,
        lang,
      );
      if (hasShort && !hasLong) return "short";
      if (hasLong && !hasShort) return "long";
      return null;
    })();

    const toneHint = (() => {
      if (this.matchesAny(cfg?.hints?.tone?.formal?.patterns, raw, lang))
        return "formal";
      if (this.matchesAny(cfg?.hints?.tone?.casual?.patterns, raw, lang))
        return "casual";
      if (
        this.matchesAny(cfg?.hints?.tone?.professionalWarm?.patterns, raw, lang)
      )
        return "professional_warm";
      return null;
    })();

    const subject = subjectRaw ? subjectRaw.trim().slice(0, maxSubject) : null;
    const body = bodyRaw ? bodyRaw.trim().slice(0, maxBody) : null;

    const attachmentNames = Array.from(
      new Set(attRaw.map((s) => s.trim()).filter(Boolean)),
    ).slice(0, 10);

    // Minimal cleanup: if subject accidentally includes body marker, trim it.
    const cleanedSubject = subject
      ? subject
          .replace(/\s+(?:and|with)\s+(?:body|message|text)\b[\s\S]*$/i, "")
          .trim()
      : null;

    return {
      provider,
      to: to || null,
      subject: cleanedSubject || null,
      body: body || null,
      attachmentNames,
      lengthHint,
      toneHint,
      purposeHint: purposeHint ? purposeHint.trim().slice(0, 160) : null,
    };
  }

  microcopy(key: "missingRecipient", lang: LanguageCode = "en"): string {
    const m = (this.bank as any)?.microcopy?.[key];
    if (!m) return "Missing required information.";
    return m[lang] || m.en || "Missing required information.";
  }

  private extractProvider(
    normalizedLower: string,
  ): "gmail" | "outlook" | "email" | null {
    const pCfg = this.bank?.config?.composeExtraction?.provider;
    const allowed = (pCfg?.allowed || [])
      .map((s) => String(s || "").toLowerCase())
      .filter(Boolean);
    const aliases = pCfg?.aliases || {};

    const aliasKeys = Object.keys(aliases).sort((a, b) => b.length - a.length);
    for (const k of aliasKeys) {
      const key = normalize(k).toLowerCase();
      if (!key) continue;
      if (normalizedLower.includes(key)) {
        const mapped = String((aliases as any)[k] || "")
          .toLowerCase()
          .trim();
        if (mapped === "gmail" || mapped === "outlook" || mapped === "email")
          return mapped;
      }
    }

    for (const p of allowed) {
      if (!p) continue;
      const rx = safeRegex(
        `\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`,
        "i",
      );
      if (rx && rx.test(normalizedLower)) {
        if (p === "gmail" || p === "outlook" || p === "email") return p;
      }
    }

    return null;
  }

  private extractFirst(
    patterns: RegexByLang | undefined,
    raw: string,
    lang: LanguageCode,
  ): string | null {
    const list = pickPatterns(patterns, lang);
    for (const p of list) {
      const rx = safeRegex(p, "i");
      if (!rx) continue;
      const m = rx.exec(raw);
      if (!m) continue;
      const v = (m[1] ?? m[0] ?? "").trim();
      if (v) return v;
    }
    return null;
  }

  private extractAll(
    patterns: RegexByLang | undefined,
    raw: string,
    lang: LanguageCode,
  ): string[] {
    const out: string[] = [];
    const list = pickPatterns(patterns, lang);
    for (const p of list) {
      const rx = safeRegex(p, "ig");
      if (!rx) continue;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(raw))) {
        const v = (m[1] ?? m[0] ?? "").trim();
        if (v) out.push(v);
      }
    }
    return out;
  }

  private matchesAny(
    patterns: RegexByLang | undefined,
    raw: string,
    lang: LanguageCode,
  ): boolean {
    const list = pickPatterns(patterns, lang);
    for (const p of list) {
      const rx = safeRegex(p, "i");
      if (!rx) continue;
      if (rx.test(raw)) return true;
    }
    return false;
  }
}

let instance: EmailComposeExtractorService | null = null;
export function getEmailComposeExtractor(): EmailComposeExtractorService {
  if (!instance) instance = new EmailComposeExtractorService();
  return instance;
}
