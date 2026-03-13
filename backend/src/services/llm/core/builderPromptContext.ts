import { BRAND_NAME } from "../../../config/brand";

import type {
  BuildRequestInput,
  DisambiguationPayload,
} from "./llmRequestBuilder.service";

export function resolveDomainForReasoning(input: BuildRequestInput): string | null {
  const explicit = String(input.signals.domain || "").trim().toLowerCase();
  if (explicit) return explicit;
  const family = String(input.signals.intentFamily || "").trim().toLowerCase();
  if (
    family === "finance" ||
    family === "legal" ||
    family === "medical" ||
    family === "ops" ||
    family === "accounting"
  ) {
    return family;
  }
  return null;
}

export function buildPromptContext(
  input: BuildRequestInput,
  maxQuestions: number,
  disambiguationSignal: DisambiguationPayload | null,
  reasoningGuidance: { text: string; assumptionsLimit: number | null },
) {
  const evidenceStats = input.evidencePack?.stats ?? {};
  const evidenceSummary = input.evidencePack
    ? {
        evidenceCount: Number(
          evidenceStats.evidenceItems ?? input.evidencePack.evidence?.length ?? 0,
        ),
        uniqueDocs: Number(
          evidenceStats.uniqueDocsInEvidence ??
            new Set(input.evidencePack.evidence.map((e) => e.docId)).size,
        ),
        topScore: evidenceStats.topScore ?? null,
        hasTables: input.evidencePack.evidence.some((e) => e.evidenceType === "table"),
      }
    : undefined;
  const scopeSummary = input.signals.explicitDocLock
    ? { lock: "hard", activeDocId: input.signals.activeDocId ?? null }
    : { lock: "soft", activeDocId: input.signals.activeDocId ?? null };
  const docContext = {
    evidenceItems: evidenceSummary?.evidenceCount ?? 0,
    uniqueDocs: evidenceSummary?.uniqueDocs ?? 0,
    topScore: evidenceSummary?.topScore ?? null,
  };
  const disambiguationOptions = disambiguationSignal
    ? disambiguationSignal.options.map((o, i) => ({
        index: i + 1,
        id: o.id,
        label: o.label,
      }))
    : [];
  const runtimeSignals = {
    answerMode: input.signals.answerMode,
    promptMode: input.signals.promptMode ?? "compose",
    machineJsonOutput: input.signals.disallowJsonOutput === false,
    operator: input.signals.operator ?? "",
    intentFamily: input.signals.intentFamily ?? "",
    operatorFamily: input.signals.operatorFamily ?? "",
    navType: input.signals.navType ?? null,
    isExtractionQuery: Boolean(input.signals.isExtractionQuery),
    retrievalPlanning: Boolean(input.signals.retrievalPlanning),
    semanticFlags: Array.isArray(input.signals.semanticFlags)
      ? input.signals.semanticFlags
      : [],
    styleProfile: input.signals.styleProfile ?? null,
    styleDecision: input.signals.styleDecision ?? null,
    turnStyleState: input.signals.turnStyleState ?? null,
    styleMaxChars: input.signals.styleMaxChars ?? null,
    userRequestedShort: input.signals.userRequestedShort === true,
    boldingEnabled:
      typeof input.signals.boldingEnabled === "boolean"
        ? input.signals.boldingEnabled
        : null,
  };

  return {
    env: input.env,
    outputLanguage: input.outputLanguage,
    maxQuestions,
    maxOptions: disambiguationSignal?.maxOptions ?? 4,
    disallowJsonOutput: input.signals.disallowJsonOutput !== false,
    answerMode: input.signals.answerMode,
    intentFamily: input.signals.intentFamily,
    operator: input.signals.operator,
    operatorFamily: input.signals.operatorFamily,
    domainId: input.signals.domain ?? "",
    uiSurface: input.signals.uiSurface ?? null,
    usedBy: Array.isArray(input.signals.usedBy) ? input.signals.usedBy : [],
    semanticFlags: Array.isArray(input.signals.semanticFlags)
      ? input.signals.semanticFlags
      : [],
    explicitDocLock: Boolean(input.signals.explicitDocLock),
    activeDocId: input.signals.activeDocId ?? null,
    userQuery: input.userText,
    scope: scopeSummary,
    docContext,
    query: input.userText,
    normalizedQuery: input.evidencePack?.query?.normalized ?? "",
    evidenceSummary,
    disambiguation: disambiguationSignal
      ? {
          active: true,
          candidateType: disambiguationSignal.candidateType,
          options: disambiguationSignal.options.map((o) => ({
            id: o.id,
            label: o.label,
          })),
        }
      : { active: false },
    fallback: input.signals.fallback ?? { triggered: false },
    candidateCount: disambiguationOptions.length,
    candidates: disambiguationOptions,
    runtimeSignals,
    constraints: {
      maxQuestions,
      maxOptions: disambiguationSignal?.maxOptions ?? 4,
      disallowJsonOutput: input.signals.disallowJsonOutput !== false,
      navPillsStrict: input.signals.answerMode === "nav_pills",
      numericStrict: false,
      quoteStrict: input.signals.operator === "quote",
      styleProfile: input.signals.styleProfile ?? null,
      styleMaxChars: input.signals.styleMaxChars ?? null,
      boldingEnabled:
        typeof input.signals.boldingEnabled === "boolean"
          ? input.signals.boldingEnabled
          : null,
    },
    slots: {
      brandName: BRAND_NAME,
      userQuery: input.userText,
      domainId: input.signals.domain ?? "",
      scope: scopeSummary,
      docContext,
      candidates: disambiguationOptions,
      candidateCount: disambiguationOptions.length,
      runtimeSignals,
      uiSurface: input.signals.uiSurface ?? null,
      usedBy: Array.isArray(input.signals.usedBy) ? input.signals.usedBy : [],
      semanticFlags: Array.isArray(input.signals.semanticFlags)
        ? input.signals.semanticFlags
        : [],
      state: {
        fallback: input.signals.fallback ?? { triggered: false },
        disambiguationActive: Boolean(disambiguationSignal?.active),
      },
      productHelpTopic: String(input.signals.productHelpTopic || "").trim(),
      productHelpSnippet: String(input.signals.productHelpSnippet || "").trim(),
      reasoningPolicyGuidance: reasoningGuidance.text,
      reasoningAssumptionsLimit: reasoningGuidance.assumptionsLimit,
      styleProfile: input.signals.styleProfile ?? null,
      styleDecision: input.signals.styleDecision ?? null,
    },
  };
}
