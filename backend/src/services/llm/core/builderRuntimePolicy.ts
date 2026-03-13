import { getOptionalBank } from "../../core/banks/bankLoader.service";
import type { BuilderEvidenceCaps, BuilderRuntimePolicy } from "./builderEvidenceRenderer";

const DEFAULT_BUILDER_POLICY: BuilderRuntimePolicy = {
  payloadCaps: {
    memoryCharsDefault: 4800,
    memoryCharsDocGrounded: 6800,
    userSectionCharsMax: Math.trunc(42e2),
    toolContextCharsMax: 1400,
    totalUserPayloadCharsMax: 32000,
  },
  evidenceCapsByMode: {
    doc_grounded_single: {
      maxItems: 10,
      maxSnippetChars: 600,
      maxSectionChars: 9600,
    },
    doc_grounded_multi: {
      maxItems: 14,
      maxSnippetChars: 600,
      maxSectionChars: 11200,
    },
    doc_grounded_quote: {
      maxItems: 8,
      maxSnippetChars: 500,
      maxSectionChars: 7000,
    },
    doc_grounded_table: {
      maxItems: 14,
      maxSnippetChars: 800,
      maxSectionChars: 14000,
    },
  },
};

let builderPolicyCache: BuilderRuntimePolicy | null | undefined;

function asPositiveInt(
  value: unknown,
  fallback: number,
  min = 1,
  max = 100000,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toNormalizedModeKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizePayloadCaps(raw: unknown): BuilderRuntimePolicy["payloadCaps"] {
  const defaults = DEFAULT_BUILDER_POLICY.payloadCaps;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...defaults };
  const src = raw as Record<string, unknown>;
  return {
    memoryCharsDefault: asPositiveInt(src.memoryCharsDefault, defaults.memoryCharsDefault, 256, 60000),
    memoryCharsDocGrounded: asPositiveInt(src.memoryCharsDocGrounded, defaults.memoryCharsDocGrounded, 256, 60000),
    userSectionCharsMax: asPositiveInt(src.userSectionCharsMax, defaults.userSectionCharsMax, 128, 20000),
    toolContextCharsMax: asPositiveInt(src.toolContextCharsMax, defaults.toolContextCharsMax, 64, 20000),
    totalUserPayloadCharsMax: asPositiveInt(
      src.totalUserPayloadCharsMax,
      defaults.totalUserPayloadCharsMax,
      512,
      100000,
    ),
  };
}

function normalizeEvidenceCapEntry(
  raw: unknown,
  fallback: BuilderEvidenceCaps,
): BuilderEvidenceCaps {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const src = raw as Record<string, unknown>;
  return {
    maxItems: asPositiveInt(src.maxItems, fallback.maxItems, 1, 50),
    maxSnippetChars: asPositiveInt(src.maxSnippetChars, fallback.maxSnippetChars, 40, 5000),
    maxSectionChars: asPositiveInt(src.maxSectionChars, fallback.maxSectionChars, 200, 100000),
  };
}

function normalizeEvidenceCapsByMode(raw: unknown): Record<string, BuilderEvidenceCaps> {
  const out: Record<string, BuilderEvidenceCaps> = Object.fromEntries(
    Object.entries(DEFAULT_BUILDER_POLICY.evidenceCapsByMode).map(([mode, caps]) => [
      mode,
      { ...caps },
    ]),
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [mode, entry] of Object.entries(raw as Record<string, unknown>)) {
    const key = toNormalizedModeKey(mode);
    if (!key) continue;
    const fallback = out[key] || {
      maxItems: 8,
      maxSnippetChars: 260,
      maxSectionChars: 3400,
    };
    out[key] = normalizeEvidenceCapEntry(entry, fallback);
  }
  return out;
}

function readBuilderPolicyFromBank(): BuilderRuntimePolicy {
  const bank = getOptionalBank<Record<string, unknown>>("llm_builder_policy");
  if (!bank || typeof bank !== "object") {
    return {
      ...DEFAULT_BUILDER_POLICY,
      payloadCaps: { ...DEFAULT_BUILDER_POLICY.payloadCaps },
      evidenceCapsByMode: normalizeEvidenceCapsByMode(null),
    };
  }

  const source =
    bank.config && typeof bank.config === "object"
      ? (bank.config as Record<string, unknown>)
      : (bank as Record<string, unknown>);
  return {
    payloadCaps: normalizePayloadCaps(source.payloadCaps),
    evidenceCapsByMode: normalizeEvidenceCapsByMode(source.evidenceCapsByMode),
  };
}

export function clearBuilderPolicyCache(): void {
  builderPolicyCache = undefined;
}

export function getBuilderRuntimePolicy(): BuilderRuntimePolicy {
  if (builderPolicyCache !== undefined && builderPolicyCache !== null) {
    return builderPolicyCache;
  }
  builderPolicyCache = readBuilderPolicyFromBank();
  return builderPolicyCache;
}
