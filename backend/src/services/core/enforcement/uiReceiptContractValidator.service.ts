type ReceiptShapeMapping = {
  id?: string;
  operator?: string;
  intent?: string;
  mode?: string;
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
  operator?: string;
  intentFamily?: string;
  answerMode?: string;
  requireHard?: boolean;
  draft: {
    receipts?: unknown;
    renderPlan?: unknown;
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

function resolveMode(answerMode: string): string {
  const mode = normalize(answerMode);
  if (mode === "nav_pills") return "navigation";
  if (mode.startsWith("doc_grounded")) return "analysis";
  if (mode === "rank_disambiguate" || mode === "rank_autopick") {
    return "navigation";
  }
  return mode || "analysis";
}

function hasEnvelopeField(draft: { receipts?: unknown; renderPlan?: unknown }, field: string): boolean {
  const key = normalize(field);
  if (key === "receipts") {
    return Array.isArray(draft.receipts) && draft.receipts.length > 0;
  }
  if (key === "renderplan") {
    const plan = asObject(draft.renderPlan);
    return Object.keys(plan).length > 0;
  }
  return false;
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

    const operator = normalize(input.operator);
    const intent = normalize(input.intentFamily);
    const mode = resolveMode(String(input.answerMode || ""));
    const mappings = Array.isArray(bank.mappings) ? bank.mappings : [];

    let matched: ReceiptShapeMapping | null = null;
    for (const mapping of mappings) {
      const operatorMatch =
        !normalize(mapping.operator) || normalize(mapping.operator) === operator;
      const intentMatch = !normalize(mapping.intent) || normalize(mapping.intent) === intent;
      const modeMatch = !normalize(mapping.mode) || normalize(mapping.mode) === mode;
      if (!operatorMatch || !intentMatch || !modeMatch) continue;
      matched = mapping;
      break;
    }
    if (!matched) return out;
    out.matchedMappingId = String(matched.id || "").trim() || null;

    const required = Array.isArray(matched.contract?.requiredEnvelopeFields)
      ? matched.contract?.requiredEnvelopeFields || []
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

