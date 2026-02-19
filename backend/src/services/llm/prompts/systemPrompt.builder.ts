// src/services/llm/prompts/systemPrompt.builder.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * SystemPromptBuilder (Allybi, ChatGPT-parity)
 * -----------------------------------------
 * Builds the SYSTEM prompt for the LLM call from:
 *  - prompts/system_prompt.any.json (bank-driven)
 *  - global policy invariants (prompt-side guards)
 *
 * Why this exists:
 *  - Keep the system prompt deterministic and bank-driven
 *  - Centralize prompt-level invariants that reduce downstream failures
 *  - Avoid hardcoding user-facing text; prompts are internal instructions only
 *
 * Important:
 *  - This builder produces internal instruction messages, not answers.
 *  - Output contract, microcopy, and formatting are enforced downstream.
 */

import type { PromptMessage, PromptContext } from "./promptRegistry.service";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

function normalizeWs(s: string): string {
  return (s ?? "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function localizedText(value: any, lang: "any" | "en" | "pt" | "es"): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value[lang] ?? value.any ?? value.en ?? value.pt ?? value.es ?? "";
}

function interpolate(template: string, slots: Record<string, any>): string {
  let out = template;

  // {{slot}}
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  // ${slot}
  out = out.replace(/\$\{(\w+)\}/g, (_m, k) => {
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  return out;
}

export class SystemPromptBuilder {
  constructor(private readonly bankLoader: BankLoader) {}

  build(ctx: PromptContext): PromptMessage {
    const bank = this.safeGetBank<any>("system_prompt");

    const lang = ctx.outputLanguage ?? "any";
    const slots = ctx.slots ?? {};

    // Base instructions from bank (preferred)
    let content = "";

    // Accept multiple shapes:
    // - bank.config.content (string or localized object)
    // - bank.config.messages (we pick the first system message)
    // - bank.templates[].messages with id="system"
    if (bank?.config?.content) {
      content = localizedText(bank.config.content, lang);
    } else if (Array.isArray(bank?.config?.messages)) {
      const sys = bank.config.messages.find(
        (m: any) => (m.role ?? "system") === "system",
      );
      if (sys) content = localizedText(sys.content, lang);
    } else if (Array.isArray(bank?.templates)) {
      const t =
        bank.templates.find((t: any) => t.id === "system") ?? bank.templates[0];
      const sys = t?.messages?.find(
        (m: any) => (m.role ?? "system") === "system",
      );
      if (sys) content = localizedText(sys.content, lang);
    } else {
      content = bank?._meta?.description ?? "";
    }

    // Prompt-level global guards (internal only)
    // Keep these short, deterministic, and aligned with policy banks.
    const guards = [
      "KODA_SYSTEM_RULES:",
      "- Use only the provided evidence/context when answering.",
      "- If evidence is missing or weak, ask at most ONE clarifying question.",
      '- Never output the phrase "No relevant information found" (or equivalents).',
      "- Do not output raw JSON to the user. Use plain text, bullets, or tables.",
      "- Keep paragraphs short (1–2 sentences) and bullets tight (1–3 sentences).",
    ];

    if (ctx.answerMode === "nav_pills") {
      guards.push(
        "NAV_PILLS_MODE:",
        "- Output only ONE short intro sentence.",
        "- No 'Sources:' label and no inline citations.",
        "- No actions or claims of actions; files are shown as attachments/buttons.",
      );
    }

    const final = normalizeWs(
      [guards.join("\n"), interpolate(content, slots)]
        .filter(Boolean)
        .join("\n\n"),
    );

    return {
      role: "system",
      content: final,
    };
  }

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}

export default SystemPromptBuilder;
