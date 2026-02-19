// src/services/llm/prompts/composePrompt.builder.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ComposePromptBuilder (Allybi, ChatGPT-parity)
 * ------------------------------------------
 * Builds the "compose answer" developer/user prompt instructions used for:
 *  - doc-grounded answers (default)
 *  - quote mode
 *  - table mode
 *  - compare mode
 *
 * Allybi design:
 *  - The prompt does not contain user-facing microcopy templates.
 *  - Microcopy is selected separately (microcopyPicker + ui_copy_tokens).
 *  - This builder only creates internal "how to respond" constraints.
 *
 * Sources:
 *  - prompts/compose_answer_prompt.any.json (bank-driven)
 *  - formatting policy expectations (short paragraphs, bullets constraints, GFM tables)
 *  - nav_pills is NOT built here; nav pills has its own guard/prompt.
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

  out = out.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  out = out.replace(/\$\{(\w+)\}/g, (_m, k) => {
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  return out;
}

export class ComposePromptBuilder {
  constructor(private readonly bankLoader: BankLoader) {}

  build(ctx: PromptContext): PromptMessage {
    const bank = this.safeGetBank<any>("compose_answer_prompt");
    const lang = ctx.outputLanguage ?? "any";

    // Load base content from bank (flexible shapes)
    let base = "";
    if (bank?.config?.content) base = localizedText(bank.config.content, lang);
    else if (Array.isArray(bank?.config?.messages)) {
      const dev = bank.config.messages.find(
        (m: any) => (m.role ?? "developer") === "developer",
      );
      if (dev) base = localizedText(dev.content, lang);
    } else if (Array.isArray(bank?.templates)) {
      const t =
        bank.templates.find((t: any) => t.id === "compose_answer") ??
        bank.templates[0];
      const dev = t?.messages?.find(
        (m: any) => (m.role ?? "developer") === "developer",
      );
      if (dev) base = localizedText(dev.content, lang);
    } else {
      base = bank?._meta?.description ?? "";
    }

    const maxQuestions =
      typeof ctx.maxQuestions === "number"
        ? Math.max(0, Math.min(2, ctx.maxQuestions))
        : 1;

    // Strict compose contract (internal instructions)
    const contract = [
      "KODA_COMPOSE_CONTRACT:",
      "- Answer using ONLY the evidence provided.",
      "- Structure for normal answers:",
      "  1) Intro: 1–2 sentences (direct answer).",
      "  2) Body: short paragraphs (1–3 sentences each).",
      "  3) Use bullets only when listing (each bullet 1–3 sentences, max ~320 chars).",
      "  4) Conclusion: 1–2 sentences unless the response is already complete.",
      `- Ask at most ${maxQuestions} question if blocked (prefer 0).`,
      "- Do NOT output raw JSON. If the user requests JSON, provide a table or bullets instead.",
      "- Do NOT include a 'Sources:' label or inline citations in the text.",
      "- Do NOT claim you opened/moved/deleted files unless a tool result explicitly says so.",
    ];

    // Mode hints
    if (ctx.answerMode === "doc_grounded_quote" || ctx.operator === "quote") {
      contract.push(
        "QUOTE_MODE:",
        "- Provide short, exact excerpts only when evidence contains the exact wording.",
        "- Keep quotes concise; attribute each quote to its source location.",
      );
    }

    if (
      ctx.answerMode === "doc_grounded_table" ||
      ctx.formatBias?.preferTables
    ) {
      contract.push(
        "TABLE_MODE:",
        "- Use GitHub-flavored markdown tables.",
        "- Include a header row and separator row.",
        "- Keep table compact; summarize after table if needed.",
      );
    }

    if (ctx.intentFamily === "documents" && ctx.operator === "compare") {
      contract.push(
        "COMPARE_MODE:",
        "- Compare across documents; do not collapse everything into one doc.",
        "- Use a table when it improves clarity.",
        "- Only compare items that appear in evidence.",
      );
    }

    const slots = {
      ...(ctx.slots ?? {}),
      answerMode: ctx.answerMode ?? "",
      operator: ctx.operator ?? "",
      intentFamily: ctx.intentFamily ?? "",
      evidenceCount: ctx.evidenceSummary?.evidenceCount ?? "",
      evidenceUniqueDocs: ctx.evidenceSummary?.uniqueDocs ?? "",
    };

    const final = normalizeWs(
      [contract.join("\n"), interpolate(base, slots)]
        .filter(Boolean)
        .join("\n\n"),
    );

    return {
      role: "developer",
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

export default ComposePromptBuilder;
