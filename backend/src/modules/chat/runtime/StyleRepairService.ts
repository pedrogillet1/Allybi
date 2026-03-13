import type { StyleDecision } from "./CompositionStyleResolver";
import type { TurnStyleState } from "./chatCompose.types";

type StyleRepairParams = {
  content: string;
  styleDecision?: (StyleDecision & Record<string, unknown>) | Record<string, unknown> | null;
  turnStyleState?: TurnStyleState | null;
  language?: string | null;
  evidenceStrength?: string | null;
  domainHint?: string | null;
};

type StyleRepairResult = {
  content: string;
  repairs: string[];
  detectedFailures: string[];
};

const MACRO_OPENERS: Array<{ pattern: RegExp; repairId: string }> = [
  { pattern: /^short answer:\s*/i, repairId: "strip_short_answer_prefix" },
  { pattern: /^bottom line:\s*/i, repairId: "strip_bottom_line_prefix" },
  { pattern: /^current status:\s*/i, repairId: "strip_current_status_prefix" },
  { pattern: /^in summary,\s*/i, repairId: "strip_in_summary_prefix" },
];

const CANNED_EMPATHY_PATTERNS: Array<{ pattern: RegExp; repairId: string }> = [
  { pattern: /\bI completely understand\b[\s,]*/i, repairId: "remove_fake_empathy" },
  { pattern: /\bI know this (can be|is) difficult\b[\s,]*/i, repairId: "remove_fake_empathy" },
  { pattern: /\bdon't worry\b[\s,]*/i, repairId: "remove_reassurance_filler" },
  { pattern: /\byou are not alone\b[\s,]*/i, repairId: "remove_reassurance_filler" },
  { pattern: /\bI will keep this anchored\b[\s,]*/i, repairId: "remove_self_referential_support" },
];

const STRONG_TO_BOUNDED_OPENERS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^the document shows\b/i, replacement: "The document points to" },
  { pattern: /^the record confirms\b/i, replacement: "The record supports" },
  { pattern: /^the strongest reading is\b/i, replacement: "The best grounded reading is" },
];

const WEAK_TO_DIRECT_OPENERS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^the document suggests, but does not settle,\s*/i, replacement: "The document shows " },
  { pattern: /^there is some support for\s*/i, replacement: "The record supports " },
  { pattern: /^the available evidence leans toward\s*/i, replacement: "The strongest reading is " },
];

export class StyleRepairService {
  repair(params: StyleRepairParams): StyleRepairResult {
    let content = String(params.content || "").trim();
    if (!content) {
      return { content, repairs: [], detectedFailures: [] };
    }

    const repairs = new Set<string>();
    const detectedFailures = new Set<string>();

    for (const { pattern, repairId } of MACRO_OPENERS) {
      if (pattern.test(content)) {
        detectedFailures.add("macro_opener");
        repairs.add(repairId);
        content = content.replace(pattern, "");
      }
    }

    for (const { pattern, repairId } of CANNED_EMPATHY_PATTERNS) {
      if (pattern.test(content)) {
        detectedFailures.add("canned_empathy");
        repairs.add(repairId);
        content = content.replace(pattern, "");
      }
    }

    content = content.replace(/^[\s,.;:-]+/, "");
    content = content.replace(/\.\s+\./g, ". ");

    if (this.matchesRecentLeadSignature(content, params.turnStyleState)) {
      detectedFailures.add("repeated_turn_opener");
      repairs.add("rotate_turn_opener");
      content = this.rotateOpening(content, params.styleDecision, params.evidenceStrength);
    }

    if (
      (params.evidenceStrength === "low" || params.evidenceStrength === "missing") &&
      this.startsWithStrongConfidence(content)
    ) {
      detectedFailures.add("confidence_too_strong");
      repairs.add("downgrade_confidence_opening");
      content = this.replaceOpening(content, STRONG_TO_BOUNDED_OPENERS);
    }

    if (params.evidenceStrength === "high" && this.startsWithWeakConfidence(content)) {
      detectedFailures.add("confidence_too_weak");
      repairs.add("upgrade_confidence_opening");
      content = this.replaceOpening(content, WEAK_TO_DIRECT_OPENERS);
    }

    content = content.replace(/\s{2,}/g, " ").trim();
    return {
      content,
      repairs: Array.from(repairs),
      detectedFailures: Array.from(detectedFailures),
    };
  }

  private matchesRecentLeadSignature(
    content: string,
    turnStyleState?: TurnStyleState | null,
  ): boolean {
    const currentLead = this.leadSignature(content);
    if (!currentLead) return false;
    const recent = Array.isArray(turnStyleState?.recentLeadSignatures)
      ? turnStyleState!.recentLeadSignatures
      : [];
    return recent.includes(currentLead);
  }

  private rotateOpening(
    content: string,
    styleDecision?: (StyleDecision & Record<string, unknown>) | Record<string, unknown> | null,
    evidenceStrength?: string | null,
  ): string {
    const sentence = content.split(/(?<=[.!?])\s+/)[0] || content;
    const remainder = content.slice(sentence.length).trimStart();
    const opener = this.resolveAlternativeOpener(styleDecision, evidenceStrength);
    const normalizedSentence = sentence.replace(/^[A-Z][a-z]+\s+/, (match) => match);
    return `${opener} ${normalizedSentence}`.trim() + (remainder ? ` ${remainder}` : "");
  }

  private resolveAlternativeOpener(
    styleDecision?: (StyleDecision & Record<string, unknown>) | Record<string, unknown> | null,
    evidenceStrength?: string | null,
  ): string {
    if (!styleDecision) return "On this record,";
    const openerFamily = String(styleDecision.openerFamily || "").trim();
    if (openerFamily === "evidence_anchor") {
      return evidenceStrength === "high" ? "The text supports this:" : "On this record,";
    }
    if (openerFamily === "stabilize_then_answer") {
      return "Staying close to the document,";
    }
    if (openerFamily === "delta_first") {
      return "What changes here is";
    }
    if (openerFamily === "clear_limit") {
      return "What can be said cleanly is";
    }
    return "On this record,";
  }

  private startsWithStrongConfidence(content: string): boolean {
    return /^(the document shows|the record confirms|the strongest reading is|clearly)\b/i.test(
      content,
    );
  }

  private startsWithWeakConfidence(content: string): boolean {
    return /^(the document suggests, but does not settle,|there is some support for|the available evidence leans toward)\b/i.test(
      content,
    );
  }

  private replaceOpening(
    content: string,
    replacements: Array<{ pattern: RegExp; replacement: string }>,
  ): string {
    for (const entry of replacements) {
      if (entry.pattern.test(content)) {
        return content.replace(entry.pattern, entry.replacement);
      }
    }
    return content;
  }

  private leadSignature(text: string): string {
    const firstSentence = String(text || "").split(/(?<=[.!?])\s+/)[0] || "";
    return firstSentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(" ");
  }
}

export type { StyleRepairResult };
