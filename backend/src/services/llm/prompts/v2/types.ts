export type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";

export type PromptKind =
  | "system"
  | "retrieval"
  | "compose_answer"
  | "disambiguation"
  | "fallback"
  | "tool";

export type PromptConcern =
  | "global_bans"
  | "grounding"
  | "retrieval_planner"
  | "answer_shape"
  | "citation_contract"
  | "clarification_render"
  | "fallback_render"
  | "tool_contract";

export type LlmRole = "system" | "developer" | "user";

export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
  hasBank?(bankId: string): boolean;
  getOptionalBank?<T = unknown>(bankId: string): T | null;
}

export interface PromptMessage {
  role: LlmRole;
  content: string;
}

export interface PromptTraceEntry {
  bankId: string;
  version: string;
  templateId: string;
  hash: string;
}

export interface PromptBundle {
  kind: PromptKind;
  messages: PromptMessage[];
  trace: {
    orderedPrompts: PromptTraceEntry[];
    appliedGuards: string[];
    slotsFilled: string[];
  };
  debug?: {
    usedBankIds: string[];
    selectedTemplateIds: string[];
  };
}

export interface PromptContext {
  env: EnvName;
  outputLanguage: LangCode;

  answerMode?: string | null;
  intentFamily?: string | null;
  operator?: string | null;
  operatorFamily?: string | null;
  uiSurface?: string | null;
  usedBy?: string[] | null;
  semanticFlags?: string[] | null;
  runtimeSignals?: Record<string, unknown> | null;

  maxQuestions?: number;
  maxOptions?: number;
  disallowJsonOutput?: boolean;

  evidenceSummary?: {
    evidenceCount?: number;
    uniqueDocs?: number;
    topScore?: number | null;
  };

  disambiguation?: {
    active: boolean;
    candidateType?: "document" | "sheet" | "operator";
    options?: Array<{ id: string; label: string }>;
  };

  fallback?: {
    triggered: boolean;
    reasonCode?: string | null;
  };

  tool?: {
    toolName?: string;
    toolHint?: string;
  };

  slots?: Record<string, unknown>;
}

export interface PromptRegistryMeta {
  _meta?: {
    id?: string;
    version?: string;
    description?: string;
  };
  config?: {
    enabled?: boolean;
  };
}

export interface PromptFileEntry {
  id: string;
  path?: string;
  required?: boolean;
  concerns?: PromptConcern[];
}

export interface PromptConcernConflict {
  left: PromptConcern;
  right: PromptConcern;
}

export interface PromptRegistryBank extends PromptRegistryMeta {
  promptFiles?: PromptFileEntry[];
  layersByKind?: Partial<Record<PromptKind, string[]>>;
  requiredConcernsByKind?: Partial<Record<PromptKind, PromptConcern[]>>;
  map?: Partial<Record<PromptKind, string>>;
  forbiddenConcernOverlaps?: PromptConcernConflict[];
}

export interface PromptBuildStartEvent {
  kind: PromptKind;
  env: EnvName;
  answerMode: string;
}

export interface PromptBuildSuccessEvent extends PromptBuildStartEvent {
  durationMs: number;
  selectedTemplateCount: number;
  messageCount: number;
}

export interface PromptBuildFailureEvent extends PromptBuildStartEvent {
  durationMs: number;
  errorCode: string;
  errorName: string;
  message: string;
}

export interface PromptRegistryTelemetry {
  recordBuildStart(event: PromptBuildStartEvent): void;
  recordBuildSuccess(event: PromptBuildSuccessEvent): void;
  recordBuildFailure(event: PromptBuildFailureEvent): void;
}

export interface PromptMetricTags {
  [key: string]: string;
}

export interface PromptMetricSink {
  increment(metric: string, tags?: PromptMetricTags): void;
  timing(metric: string, durationMs: number, tags?: PromptMetricTags): void;
}
