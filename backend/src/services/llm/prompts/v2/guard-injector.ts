import {
  clampInt,
  safeStr,
} from "./helpers";
import type { PromptContext, PromptKind, PromptMessage } from "./types";

export function applyGlobalGuards(params: {
  messages: PromptMessage[];
  ctx: PromptContext;
  applied: string[];
  guardRules:
    | Array<{ id?: string; text?: string; skipWhen?: string[] }>
    | null;
}): PromptMessage[] {
  const { messages, ctx, applied, guardRules } = params;
  const guards: string[] = [];
  const extCtx = ctx as unknown as Record<string, unknown>;
  const ctxConstraints =
    extCtx.constraints && typeof extCtx.constraints === "object"
      ? (extCtx.constraints as Record<string, unknown>)
      : null;
  const disallowJsonOutput =
    (ctxConstraints?.disallowJsonOutput as boolean | undefined) ??
    ctx.disallowJsonOutput;
  const machineJsonMode = disallowJsonOutput === false;

  const maxQ = clampInt(
    (ctxConstraints?.maxQuestions as number | undefined) ?? ctx.maxQuestions ?? 1,
    0,
    3,
    1,
  );

  if (guardRules?.length) {
    for (const rule of guardRules) {
      if (!rule?.text) continue;
      const skip =
        Array.isArray(rule.skipWhen) &&
        machineJsonMode &&
        rule.skipWhen.includes("machine_json_mode");
      if (skip) continue;
      const text = rule.text.replace("{maxQuestions}", String(maxQ));
      guards.push(`- ${text}`);
    }
  } else {
    if (!machineJsonMode) {
      guards.push(
        "- Do NOT output raw JSON to the user. Use normal text, bullets, or tables instead.",
      );
    }
    guards.push(
      `- Ask at most ${maxQ} question if you are blocked. Otherwise answer directly.`,
    );
    if (!machineJsonMode) {
      guards.push(
        '- Never output the phrase "No relevant information found" (or equivalents).',
      );
    }
    guards.push(
      "- Use only the provided evidence/context. Do not invent sources or details.",
    );
    if (!machineJsonMode) {
      guards.push(
        "- Do NOT include a Sources section in the text — sources are provided separately via UI buttons.",
      );
      guards.push(
        "- Never emit control/protocol wrappers like [KODA_...] blocks in user-facing output.",
      );
    }
  }

  const reasoningGuidance = safeStr(
    (ctx.slots as Record<string, unknown> | undefined)?.reasoningPolicyGuidance ||
      "",
  ).trim();
  if (reasoningGuidance) {
    guards.push("REASONING_POLICY:");
    guards.push(reasoningGuidance);
  }

  const guardMsg: PromptMessage = {
    role: "system",
    content: ["KODA_GLOBAL_GUARDS:", ...guards].join("\n"),
  };

  applied.push("global_guards");
  return [guardMsg, ...messages];
}

export function applyNavPillsGuard(params: {
  messages: PromptMessage[];
  applied: string[];
  navRules: Array<{ id?: string; text?: string }> | null;
}): PromptMessage[] {
  const { messages, applied, navRules } = params;

  const lines: string[] = ["NAV_PILLS_MODE_CONTRACT:"];
  if (navRules?.length) {
    for (const rule of navRules) {
      if (rule?.text) lines.push(`- ${rule.text}`);
    }
  } else {
    lines.push("- Output only ONE short intro line (max 1 sentence).");
    lines.push("- Do NOT include a 'Sources:' label or inline citations.");
    lines.push("- Do NOT include message actions or claim actions were executed.");
    lines.push("- Files are represented via attachments/buttons, not in the text.");
  }

  const guard: PromptMessage = {
    role: "system",
    content: lines.join("\n"),
  };

  applied.push("nav_pills_guard");
  return [guard, ...messages];
}

export function minimalSafePrompt(params: {
  kind: PromptKind;
  answerMode: string;
  safeRules: string[] | null;
  navPillsAddendum: string | null;
}): string {
  const { kind, answerMode, safeRules, navPillsAddendum } = params;

  const base: string[] = safeRules?.length
    ? [...safeRules]
    : [
        "Assistant identity: Allybi.",
        "Refer to yourself in first person (I/me/my). Do not speak about yourself in third person.",
        'Never output sentences like: "Allybi\'s name is Allybi" or "How can Allybi assist you today?"',
        "Use only the provided evidence/context.",
        "Never output the phrase 'No relevant information found'.",
        "Do not output raw JSON to the user.",
        "Use short paragraphs and bullets when listing.",
        "Ask at most one question only if blocked.",
        "Do NOT include a Sources section in the text — sources are provided separately via UI buttons.",
      ];

  if (answerMode === "nav_pills") {
    base.push(
      navPillsAddendum ||
        "NAV_PILLS: one short intro sentence only; no Sources label; no actions.",
    );
  }

  base.push(`prompt_kind=${kind}`);
  return base.join("\n");
}
