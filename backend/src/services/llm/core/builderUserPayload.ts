import {
  renderEvidenceForPrompt,
  type BuilderRuntimePolicy,
} from "./builderEvidenceRenderer";
import type {
  BuildRequestInput,
  DisambiguationPayload,
} from "./llmRequestBuilder.service";

export type BuilderPayloadStats = {
  memoryCharsIncluded: number;
  evidenceCharsIncluded: number;
  evidenceItemsIncluded: number;
  disambiguationOptionsIncluded: number;
  toolContextCharsIncluded: number;
  answerDepthCharsIncluded: number;
  languageConstraintCharsIncluded: number;
  userSectionCharsIncluded: number;
  totalUserPayloadChars: number;
  estimatedUserPayloadTokens: number;
};

function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

function buildMemorySection(
  input: BuildRequestInput,
  answerMode: string,
  policy: BuilderRuntimePolicy,
): { text: string; charsIncluded: number } {
  const memoryCharCap = answerMode.startsWith("doc_grounded")
    ? policy.payloadCaps.memoryCharsDocGrounded
    : policy.payloadCaps.memoryCharsDefault;
  const memoryBlock = String(input.memoryPack?.contextText || "")
    .trim()
    .slice(0, memoryCharCap);
  return {
    text: memoryBlock,
    charsIncluded: memoryBlock.length,
  };
}

function buildConflictSection(conflicts: NonNullable<BuildRequestInput["evidencePack"]>["conflicts"]) {
  if (!conflicts?.length) return { text: "", count: 0 };
  const sliced = conflicts.slice(0, 5);
  return {
    count: sliced.length,
    text: [
      "Note: some values differ across sources.",
      "Use the most authoritative or most recent value. Do NOT mention this note, data conflicts, or document identifiers to the user:",
      ...sliced.map((c) => `- \"${c.metric}\": ${c.docA}=${c.valueA} vs ${c.docB}=${c.valueB}`),
    ].join("\n"),
  };
}

function buildDisambiguationSection(disambiguationSignal: DisambiguationPayload | null): {
  text: string;
  optionCount: number;
} {
  if (!disambiguationSignal?.active) return { text: "", optionCount: 0 };
  const opts = disambiguationSignal.options.slice(0, disambiguationSignal.maxOptions);
  return {
    optionCount: opts.length,
    text: ["### Options", ...opts.map((o, i) => `- (${i + 1}) ${o.label}`)].join("\n"),
  };
}

function buildToolContextSection(
  input: BuildRequestInput,
  policy: BuilderRuntimePolicy,
): { text: string; charsIncluded: number } {
  if (!input.toolContext) return { text: "", charsIncluded: 0 };
  const text = [
    "### Tool Context",
    `toolName: ${input.toolContext.toolName}`,
    input.toolContext.toolArgs
      ? `toolArgs: ${JSON.stringify(input.toolContext.toolArgs)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, policy.payloadCaps.toolContextCharsMax);
  return { text, charsIncluded: text.length };
}

function buildAnswerDepthSection(answerMode: string): { text: string; charsIncluded: number } {
  if (!answerMode.startsWith("doc_grounded")) return { text: "", charsIncluded: 0 };
  const isTable = answerMode === "doc_grounded_table";
  const text = isTable
    ? "### Answer Depth\nProvide a compact, evidence-grounded table that answers the user's exact request. Prefer key rows first; if the full result is long, summarize the remainder clearly. After the table, add a brief interpretation (1-2 sentences)."
    : "### Answer Depth\nProvide a confident, complete answer to the specific question by extracting relevant facts from the evidence. Include key facts, numbers, and short structured bullets when helpful. If evidence addresses the topic, present findings directly without hedging or asking for additional documents.";
  return { text, charsIncluded: text.length };
}

function buildLanguageConstraintSection(
  outputLanguage: BuildRequestInput["outputLanguage"],
): { text: string; charsIncluded: number } {
  if (!outputLanguage || outputLanguage === "any") {
    return { text: "", charsIncluded: 0 };
  }
  const langLabel =
    outputLanguage === "en"
      ? "English"
      : outputLanguage === "pt"
        ? "Portuguese"
        : outputLanguage === "es"
          ? "Spanish"
          : outputLanguage;
  const text = `### Language Constraint\nYou MUST respond entirely in ${langLabel}. This is a binding requirement, not a suggestion.`;
  return { text, charsIncluded: text.length };
}

function buildUserSection(
  userText: string,
  policy: BuilderRuntimePolicy,
): { text: string; charsIncluded: number } {
  const text = `### User\n${userText.trim()}`.slice(
    0,
    policy.payloadCaps.userSectionCharsMax,
  );
  return { text, charsIncluded: text.length };
}

export function buildUserPayload(
  input: BuildRequestInput,
  disambiguationSignal: DisambiguationPayload | null,
  policy: BuilderRuntimePolicy,
): { content: string; stats: BuilderPayloadStats; evidenceRendering?: Record<string, number> } {
  const parts: string[] = [];
  const evidenceRenderingTelemetry: Record<string, number> = {
    tableItemsRendered: 0,
    tableQualityAnnotations: 0,
    conflictsInjected: 0,
    totalEvidenceItems: 0,
  };
  const stats: BuilderPayloadStats = {
    memoryCharsIncluded: 0,
    evidenceCharsIncluded: 0,
    evidenceItemsIncluded: 0,
    disambiguationOptionsIncluded: 0,
    toolContextCharsIncluded: 0,
    answerDepthCharsIncluded: 0,
    languageConstraintCharsIncluded: 0,
    userSectionCharsIncluded: 0,
    totalUserPayloadChars: 0,
    estimatedUserPayloadTokens: 0,
  };

  const answerMode = String(input.signals.answerMode || "").trim().toLowerCase();

  const memorySection = buildMemorySection(input, answerMode, policy);
  if (memorySection.text) {
    parts.push(memorySection.text);
    stats.memoryCharsIncluded = memorySection.charsIncluded;
  }

  if (input.evidencePack?.evidence?.length) {
    const evidenceBlock = renderEvidenceForPrompt(
      input.evidencePack,
      {
        isExtractionQuery: input.signals.isExtractionQuery,
        answerMode: input.signals.answerMode,
      },
      policy,
    );
    if (evidenceBlock.text) {
      parts.push(evidenceBlock.text);
      stats.evidenceCharsIncluded = evidenceBlock.charsIncluded;
      stats.evidenceItemsIncluded = evidenceBlock.itemsIncluded;
    }
    evidenceRenderingTelemetry.tableItemsRendered = evidenceBlock.tableItemsRendered;
    evidenceRenderingTelemetry.tableQualityAnnotations = evidenceBlock.tableQualityAnnotations;
    evidenceRenderingTelemetry.totalEvidenceItems = input.evidencePack.evidence.length;
  }

  const conflictSection = buildConflictSection(input.evidencePack?.conflicts);
  if (conflictSection.text) {
    parts.push(conflictSection.text);
    evidenceRenderingTelemetry.conflictsInjected = conflictSection.count;
  }

  const disambiguationSection = buildDisambiguationSection(disambiguationSignal);
  if (disambiguationSection.text) {
    parts.push(disambiguationSection.text);
    stats.disambiguationOptionsIncluded = disambiguationSection.optionCount;
  }

  const toolContextSection = buildToolContextSection(input, policy);
  if (toolContextSection.text) {
    parts.push(toolContextSection.text);
    stats.toolContextCharsIncluded = toolContextSection.charsIncluded;
  }

  const answerDepthSection = buildAnswerDepthSection(answerMode);
  if (answerDepthSection.text) {
    parts.push(answerDepthSection.text);
    stats.answerDepthCharsIncluded = answerDepthSection.charsIncluded;
  }

  const languageConstraintSection = buildLanguageConstraintSection(input.outputLanguage);
  if (languageConstraintSection.text) {
    parts.push(languageConstraintSection.text);
    stats.languageConstraintCharsIncluded = languageConstraintSection.charsIncluded;
  }

  const userSection = buildUserSection(input.userText, policy);
  parts.push(userSection.text);
  stats.userSectionCharsIncluded = userSection.charsIncluded;

  const content = parts
    .join("\n\n")
    .trim()
    .slice(0, policy.payloadCaps.totalUserPayloadCharsMax);
  stats.totalUserPayloadChars = content.length;
  stats.estimatedUserPayloadTokens = estimateTokensFromChars(content.length);

  return {
    content,
    stats,
    evidenceRendering: evidenceRenderingTelemetry,
  };
}
