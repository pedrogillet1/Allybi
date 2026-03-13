import { getOptionalBank } from "../../domain/infra";
import { DocumentIntelligenceCompositionBrainService } from "./documentIntelligenceCompositionBrain.service";

type BrainLanguage = "any" | "en" | "pt" | "es";

type BrainRecord = Record<string, unknown>;

export interface BrainDecisionFrame {
  whatIsThis: {
    answerMode: string;
    queryFamily: string;
    domain: string | null;
    contextProfile: "single_doc" | "corpus";
  };
  whatUserWants: {
    intentFamily: string | null;
    operator: string | null;
    userGoal: string;
  };
  allowedSources: {
    mode: "locked_doc_only" | "retrieved_documents" | "corpus";
    explicitDocLock: boolean;
    activeDocId: string | null;
  };
  evidenceRequired: {
    mustBeDocumentGrounded: boolean;
    minimumEvidenceItems: number;
    claimStrength: "exact" | "inference" | "speculative";
  };
  reasoningPolicy: {
    mode: "extract" | "compare" | "calculate" | "clarify" | "general";
    calibratedLanguageRequired: boolean;
    maxClarifyingQuestions: number;
  };
  responsePolicy: {
    language: BrainLanguage;
    tone: string;
    voice: string;
    preferredVerbosity: string;
  };
  actionPlan: {
    action: "answer" | "clarify" | "tool";
    toolName: string | null;
  };
  proofPlan: {
    requireRetrievedSourceMatch: boolean;
    requireLocationRichProvenance: boolean;
    checks: string[];
  };
  contributingBankIds: string[];
}

export interface BuildBrainDecisionFrameInput {
  outputLanguage?: string | null;
  userText: string;
  signals: {
    answerMode?: string | null;
    intentFamily?: string | null;
    operator?: string | null;
    domain?: string | null;
    explicitDocLock?: boolean;
    activeDocId?: string | null;
    maxQuestions?: number;
    fallback?: { triggered?: boolean | null } | null;
  };
  evidencePack?: {
    evidence?: Array<{ docId: string }>;
    stats?: { topScore?: number | null; uniqueDocsInEvidence?: number | null };
  } | null;
  toolContext?: { toolName?: string | null } | null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeLanguage(value?: string | null): BrainLanguage {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pt") return "pt";
  if (raw === "es") return "es";
  if (raw === "any") return "any";
  return "en";
}

function lower(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export class DocumentIntelligenceBrainDecisionFrameService {
  private readonly compositionBrain: DocumentIntelligenceCompositionBrainService;

  constructor() {
    this.compositionBrain = new DocumentIntelligenceCompositionBrainService();
  }

  private getBank(bankId: string): BrainRecord | null {
    const bank = getOptionalBank<BrainRecord>(bankId);
    if (bank && asObject(bank.config).enabled !== false) return bank;
    return null;
  }

  private resolveQueryFamily(input: BuildBrainDecisionFrameInput): string {
    const catalog = this.getBank("query_family_catalog");
    const defaultFamily =
      String(asObject(catalog?.config).defaultFamily || "document_retrieval").trim() ||
      "document_retrieval";
    const operator = lower(input.signals.operator);
    const answerMode = lower(input.signals.answerMode);
    const families = asArray<BrainRecord>(catalog?.families);

    const matched = families.find((family) => {
      const canonicalIntents = asArray<string>(family.canonicalIntents).map(lower);
      const familyName = lower(family.name || family.id);
      if (canonicalIntents.includes(operator)) return true;
      if (operator === "compare" && familyName === "cross_document_compare") return true;
      if (
        (operator === "calculate" || answerMode === "doc_grounded_table") &&
        familyName === "numeric_compute"
      ) {
        return true;
      }
      if (
        answerMode.startsWith("doc_grounded") &&
        familyName === "content_extraction"
      ) {
        return true;
      }
      return false;
    });

    return String(matched?.name || defaultFamily).trim() || defaultFamily;
  }

  private resolveClaimStrength(input: BuildBrainDecisionFrameInput): "exact" | "inference" | "speculative" {
    const matrix = this.getBank("claim_strength_matrix");
    const operator = lower(input.signals.operator);
    const supportedLevels = new Set(
      asArray<BrainRecord>(matrix?.levels).map((entry) => lower(entry.id)),
    );
    if (operator === "calculate" || operator === "compare") {
      return supportedLevels.has("inference") ? "inference" : "exact";
    }
    if (input.signals.fallback?.triggered) {
      return supportedLevels.has("speculative") ? "speculative" : "inference";
    }
    return supportedLevels.has("exact") ? "exact" : "inference";
  }

  build(input: BuildBrainDecisionFrameInput): BrainDecisionFrame {
    const answerMode = String(input.signals.answerMode || "general_answer").trim();
    const explicitDocLock = input.signals.explicitDocLock === true;
    const activeDocId = String(input.signals.activeDocId || "").trim() || null;
    const evidence = Array.isArray(input.evidencePack?.evidence)
      ? input.evidencePack?.evidence || []
      : [];
    const uniqueEvidenceDocs = new Set(
      evidence.map((item) => String(item.docId || "").trim()).filter(Boolean),
    );
    const uniqueDocsInEvidence =
      Number(input.evidencePack?.stats?.uniqueDocsInEvidence) > 0
        ? Number(input.evidencePack?.stats?.uniqueDocsInEvidence)
        : uniqueEvidenceDocs.size;
    const topScore =
      typeof input.evidencePack?.stats?.topScore === "number"
        ? input.evidencePack.stats.topScore
        : null;
    const confidenceCalibration = this.getBank("confidence_calibration");
    const confidenceThresholds = asObject(confidenceCalibration?.thresholds);
    const mediumConfidence = Number(confidenceThresholds.medium ?? 0.65);
    const docLockPolicy = this.getBank("doc_lock_policy");
    const projectMemoryPolicy = this.getBank("project_memory_policy");
    const sourcePolicy = this.getBank("source_policy");
    const oneBestQuestionPolicy = this.getBank("one_best_question_policy");
    const contextProfiles = this.getBank("context_container_profiles");
    const compositionSignals = this.compositionBrain.buildPromptSignals({
      preferredLanguage: input.outputLanguage,
      answerMode,
      domain: input.signals.domain ?? null,
      userRequestedShort: false,
    });

    const queryFamily = this.resolveQueryFamily(input);
    const contextProfile =
      explicitDocLock || activeDocId
        ? "single_doc"
        : uniqueDocsInEvidence > 1
          ? "corpus"
          : String(
                asArray<BrainRecord>(contextProfiles?.profiles).find(
                  (profile) =>
                    String(profile?.requiresActiveDoc || "").trim() === "false",
                )?.id || "corpus",
              ).trim() === "single_doc"
            ? "single_doc"
            : "corpus";
    const claimStrength = this.resolveClaimStrength(input);
    const mustBeDocumentGrounded = answerMode.startsWith("doc_grounded");
    const lockAllowsCompareRelease =
      asObject(docLockPolicy?.config).allowUnlockOnExplicitCompare === true &&
      lower(input.signals.operator) === "compare";
    const sourceMode: BrainDecisionFrame["allowedSources"]["mode"] =
      explicitDocLock && !lockAllowsCompareRelease
        ? "locked_doc_only"
        : uniqueDocsInEvidence > 1 || contextProfile === "corpus"
          ? "corpus"
          : "retrieved_documents";
    const maxClarifyingQuestions =
      oneBestQuestionPolicy?.config &&
      typeof asObject(oneBestQuestionPolicy.config).maxQuestions === "number"
        ? Number(asObject(oneBestQuestionPolicy.config).maxQuestions)
        : Math.max(1, Number(input.signals.maxQuestions || 1));
    const calibratedLanguageRequired =
      typeof topScore === "number" ? topScore < mediumConfidence : false;

    const proofChecks = [
      "match response language to requested output language",
      "cite only retrieved evidence",
      mustBeDocumentGrounded ? "bind claims to document evidence" : "",
      explicitDocLock || projectMemoryPolicy?.policy
        ? "respect active document scope"
        : "",
      asArray<BrainRecord>(sourcePolicy?.rules).length > 0
        ? "preserve source policy contract"
        : "",
    ].filter(Boolean);

    const contributingBankIds = unique([
      "assistant_identity",
      "behavioral_contract",
      "confidence_calibration",
      "context_container_profiles",
      "claim_strength_matrix",
      "doc_lock_policy",
      "help_and_capabilities",
      "mission_and_non_goals",
      "one_best_question_policy",
      "project_memory_policy",
      "query_family_catalog",
      "source_policy",
      "voice_personality_profiles",
      "tone_profiles",
      "verbosity_ladder",
    ]);

    return {
      whatIsThis: {
        answerMode,
        queryFamily,
        domain: input.signals.domain ?? null,
        contextProfile,
      },
      whatUserWants: {
        intentFamily: input.signals.intentFamily ?? null,
        operator: input.signals.operator ?? null,
        userGoal: String(input.userText || "").trim(),
      },
      allowedSources: {
        mode: sourceMode,
        explicitDocLock,
        activeDocId,
      },
      evidenceRequired: {
        mustBeDocumentGrounded,
        minimumEvidenceItems:
          lower(input.signals.operator) === "compare" || queryFamily === "cross_document_compare"
            ? 2
            : mustBeDocumentGrounded
              ? 1
              : 0,
        claimStrength,
      },
      reasoningPolicy: {
        mode:
          lower(input.signals.operator) === "compare"
            ? "compare"
            : lower(input.signals.operator) === "calculate"
              ? "calculate"
              : answerMode === "rank_disambiguate"
                ? "clarify"
                : mustBeDocumentGrounded
                  ? "extract"
                  : "general",
        calibratedLanguageRequired,
        maxClarifyingQuestions,
      },
      responsePolicy: {
        language: normalizeLanguage(input.outputLanguage),
        tone: String(compositionSignals.compositionTone || "balanced"),
        voice: String(compositionSignals.voiceProfile || "balanced"),
        preferredVerbosity: String(compositionSignals.preferredVerbosity || "balanced"),
      },
      actionPlan: {
        action:
          input.toolContext?.toolName
            ? "tool"
            : answerMode === "rank_disambiguate"
              ? "clarify"
              : "answer",
        toolName: String(input.toolContext?.toolName || "").trim() || null,
      },
      proofPlan: {
        requireRetrievedSourceMatch: true,
        requireLocationRichProvenance: mustBeDocumentGrounded,
        checks: proofChecks,
      },
      contributingBankIds,
    };
  }

  buildDeveloperMessage(frame: BrainDecisionFrame): string {
    return [
      "### Brain Decision Frame",
      `What this is: ${frame.whatIsThis.answerMode} | family=${frame.whatIsThis.queryFamily} | context=${frame.whatIsThis.contextProfile}`,
      `User wants: ${frame.whatUserWants.operator || "answer"} | intent=${frame.whatUserWants.intentFamily || "unknown"}`,
      `Allowed sources: ${frame.allowedSources.mode}${frame.allowedSources.activeDocId ? ` | activeDoc=${frame.allowedSources.activeDocId}` : ""}`,
      `Evidence required: grounded=${frame.evidenceRequired.mustBeDocumentGrounded} | minItems=${frame.evidenceRequired.minimumEvidenceItems} | claim=${frame.evidenceRequired.claimStrength}`,
      `Reasoning: ${frame.reasoningPolicy.mode} | calibratedLanguage=${frame.reasoningPolicy.calibratedLanguageRequired} | maxClarifications=${frame.reasoningPolicy.maxClarifyingQuestions}`,
      `Response: lang=${frame.responsePolicy.language} | tone=${frame.responsePolicy.tone} | voice=${frame.responsePolicy.voice} | verbosity=${frame.responsePolicy.preferredVerbosity}`,
      `Action: ${frame.actionPlan.action}${frame.actionPlan.toolName ? ` | tool=${frame.actionPlan.toolName}` : ""}`,
      `Proof: ${frame.proofPlan.checks.join("; ")}`,
    ].join("\n");
  }
}

export function getDocumentIntelligenceBrainDecisionFrame(): DocumentIntelligenceBrainDecisionFrameService {
  return new DocumentIntelligenceBrainDecisionFrameService();
}
