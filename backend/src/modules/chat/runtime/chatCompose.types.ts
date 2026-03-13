import type {
  AnswerMode,
  ChatEngine,
  ChatRole,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
import type { StyleDecision } from "./CompositionStyleResolver";

export type TurnStyleState = {
  assistantTurnsSeen: number;
  recentLeadSignatures: string[];
  recentCloserSignatures: string[];
  lastAssistantPreview: string | null;
  repeatedLeadRisk: boolean;
  repeatedCloserRisk: boolean;
};

export type SemanticSignalReader = {
  collectSemanticSignals(
    queryText: string,
    contextSignals: Record<string, unknown>,
  ): Record<string, boolean>;
  extractQueryKeywords(queryText: string): string[];
};

export type ComposeRuntimeConfig = {
  lowConfidenceSurfaceFallback: boolean;
};

export type RuntimeMeta = Record<string, unknown> & {
  preferredLanguage: string;
  answerMode: AnswerMode;
  styleDecision?: StyleDecision | null;
  turnStyleState?: TurnStyleState | null;
  styleFailureHistory?: string[] | null;
  styleRepairTrace?: string[] | null;
};

export type RuntimeContext = Record<string, unknown> & {
  preferredLanguage: string;
  attachedDocumentIds: string[];
  signals: Record<string, unknown>;
  styleDecision?: StyleDecision | null;
  turnStyleState?: TurnStyleState | null;
  styleFailureHistory?: string[] | null;
  styleRepairTrace?: string[] | null;
};

export type EngineMessage = {
  role: ChatRole;
  content: string;
  attachments?: unknown | null;
};

export type EngineEvidencePack = {
  query: {
    original: string;
    normalized: string;
  };
  scope: {
    activeDocId: string | null;
    explicitDocLock: boolean;
  };
  stats: {
    evidenceItems: number;
    uniqueDocsInEvidence: number;
    topScore: number | null;
    scoreGap: number | null;
  };
  evidence: Array<{
    docId: string;
    title?: string | null;
    filename?: string | null;
    location?: {
      page?: number | null;
      sheet?: string | null;
      slide?: number | null;
      sectionKey?: string | null;
    };
    locationKey?: string;
    snippet?: string;
    score?: {
      finalScore?: number;
    };
    evidenceType?: "text" | "table" | "image";
  }>;
  conflicts: EvidencePack["conflicts"];
};

export type FallbackSignal = {
  reasonCode?: string;
  telemetryReasonCode?: string;
  policyMeta: Record<string, unknown> | null;
};

export type EvidenceGateBypass = {
  failureCode: string;
};

export type RuntimeMetaParams = {
  preferredLanguage: string;
  answerMode: AnswerMode;
  sourceCount: number;
  inheritedMeta: Record<string, unknown>;
  runtimeContext?: RuntimeContext | null;
  evidenceGateDecision?: EvidenceCheckResult | null;
  fallbackSignal?: FallbackSignal | null;
  retrievalPack: EvidencePack | null;
};

export type EngineCallResult =
  | Awaited<ReturnType<ChatEngine["generate"]>>
  | Awaited<ReturnType<ChatEngine["stream"]>>;
