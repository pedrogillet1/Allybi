type ReceiptShapeMapping = {
  id?: string;
  domain?: string;
  operator?: string;
  intent?: string;
  mode?: string;
  priority?: number;
  contract?: {
    requiredEnvelopeFields?: string[];
  };
};

type UiReceiptShapesBank = {
  _meta?: { id?: string; version?: string };
  config?: {
    enabled?: boolean;
    strictEnvelopeEnforcement?: boolean;
  };
  mappings?: ReceiptShapeMapping[];
};

export type UiReceiptValidationInput = {
  bank: UiReceiptShapesBank | null | undefined;
  domain?: string;
  operator?: string;
  intentFamily?: string;
  answerMode?: string;
  requireHard?: boolean;
  draft: {
    receipts?: unknown;
    renderPlan?: unknown;
    editPlan?: unknown;
    undoToken?: unknown;
    [k: string]: unknown;
  };
};

export type UiReceiptValidationResult = {
  enabled: boolean;
  version: string | null;
  matchedMappingId: string | null;
  warnings: string[];
  blocked: boolean;
  reasonCode: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalize(input: unknown): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function toPriority(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor(parsed);
}

function getPath(input: Record<string, unknown>, path: string): unknown {
  const normalized = String(path || "").trim();
  if (!normalized) return undefined;
  const segments = normalized.split(".").filter(Boolean);
  let cursor: unknown = input;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function resolveMode(answerMode: string): string {
  const mode = normalize(answerMode);
  if (mode === "nav_pills") return "navigation";
  if (mode.startsWith("doc_grounded")) return "analysis";
  if (mode === "rank_disambiguate" || mode === "rank_autopick") {
    return "navigation";
  }
  return mode || "analysis";
}

function hasEnvelopeField(
  draft: { [k: string]: unknown },
  field: string,
): boolean {
  const key = normalize(field);
  if (key === "receipts") {
    return Array.isArray(draft.receipts) && draft.receipts.length > 0;
  }
  if (key === "renderplan") {
    const plan = asObject(draft.renderPlan);
    return Object.keys(plan).length > 0;
  }
  if (key === "editplan") {
    const plan = asObject(draft.editPlan);
    return Object.keys(plan).length > 0;
  }
  if (key === "undotoken") {
    return String(draft.undoToken || "").trim().length > 0;
  }

  const byPath = getPath(draft, field);
  const value = byPath !== undefined ? byPath : draft[field];
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(asObject(value)).length > 0;
  }
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function requiredFieldSignature(mapping: ReceiptShapeMapping): string {
  const required = Array.isArray(mapping.contract?.requiredEnvelopeFields)
    ? mapping.contract.requiredEnvelopeFields || []
    : [];
  return required
    .map((entry) => normalize(entry))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

export class UiReceiptContractValidatorService {
  validate(input: UiReceiptValidationInput): UiReceiptValidationResult {
    const bank = input.bank || null;
    const enabled = asObject(bank?.config).enabled !== false;
    const version = String(asObject(bank?._meta).version || "").trim() || null;
    const out: UiReceiptValidationResult = {
      enabled,
      version,
      matchedMappingId: null,
      warnings: [],
      blocked: false,
      reasonCode: null,
    };
    if (!bank || !enabled) return out;

    const domain = normalize(input.domain);
    const operator = normalize(input.operator);
    const intent = normalize(input.intentFamily);
    const mode = resolveMode(String(input.answerMode || ""));
    const mappings = Array.isArray(bank.mappings) ? bank.mappings : [];

    const candidates: ReceiptShapeMapping[] = [];
    for (const mapping of mappings) {
      const domainValue = normalize(mapping.domain);
      const domainMatch = !domainValue || !domain || domainValue === domain;
      const operatorMatch =
        !normalize(mapping.operator) || normalize(mapping.operator) === operator;
      const intentMatch = !normalize(mapping.intent) || normalize(mapping.intent) === intent;
      const modeMatch = !normalize(mapping.mode) || normalize(mapping.mode) === mode;
      if (!domainMatch || !operatorMatch || !intentMatch || !modeMatch) continue;
      candidates.push(mapping);
    }
    if (candidates.length < 1) return out;

    const scored = candidates
      .map((mapping) => {
        let specificity = 0;
        if (normalize(mapping.domain)) specificity += 8;
        if (normalize(mapping.operator)) specificity += 4;
        if (normalize(mapping.intent)) specificity += 4;
        if (normalize(mapping.mode)) specificity += 2;
        if (domain && normalize(mapping.domain) === domain) specificity += 6;
        return {
          mapping,
          specificity,
          priority: toPriority(mapping.priority),
          id: normalize(mapping.id),
        };
      })
      .sort((a, b) => {
        if (b.specificity !== a.specificity) return b.specificity - a.specificity;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.id.localeCompare(b.id);
      });

    const matched = scored[0]?.mapping || null;
    if (!matched) return out;
    out.matchedMappingId = String(matched.id || "").trim() || null;

    const top = scored[0];
    const tied = scored.filter(
      (entry) =>
        entry.specificity === top.specificity &&
        entry.priority === top.priority,
    );
    if (tied.length > 1) {
      out.warnings.push(
        `UI_RECEIPT_AMBIGUOUS_MAPPING_RESOLVED:${tied
          .map((entry) => entry.id || "unknown")
          .join(",")}`,
      );
    }
    if (!domain && candidates.length > 1) {
      const signatures = Array.from(
        new Set(candidates.map((mapping) => requiredFieldSignature(mapping))),
      );
      if (signatures.length > 1) {
        out.warnings.push("UI_RECEIPT_AMBIGUOUS_REQUIRED_FIELDS");
      }
    }

    const required = Array.isArray(matched.contract?.requiredEnvelopeFields)
      ? matched.contract.requiredEnvelopeFields || []
      : [];
    if (required.length === 0) return out;

    const missing = required.filter(
      (field) => !hasEnvelopeField(input.draft, String(field || "")),
    );
    if (missing.length === 0) return out;

    out.warnings.push(
      `UI_RECEIPT_MISSING_FIELDS:${missing.map((value) => normalize(value)).join(",")}`,
    );
    const strictByBank = asObject(bank.config).strictEnvelopeEnforcement === true;
    const requireHard = input.requireHard || strictByBank;
    if (!requireHard) return out;

    out.blocked = true;
    out.reasonCode = "ui_receipt_contract_missing_fields";
    return out;
  }
}
