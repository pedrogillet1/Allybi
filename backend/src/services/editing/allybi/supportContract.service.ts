import type {
  EditBlockedReason,
  EditDomain,
  EditIntentSource,
  EditOperator,
  EditOutcomeType,
  EditSupportGateId,
} from "../editing.types";
import { analyzeMessageToPlan } from "../intentRuntime";
import { loadOperatorCatalog } from "../intentRuntime/loaders";
import { safeEditingBank } from "../banks/bankService";

interface SupportGateResult {
  gate: EditSupportGateId;
  pass: boolean;
  detail?: string;
}

interface SupportContractInput {
  instruction: string;
  domain: EditDomain;
  language?: "en" | "pt";
  runtimeOperator: EditOperator;
  canonicalOperator?: string | null;
  intentSource?: EditIntentSource;
  resolvedTargetId?: string | null;
  resolvedTargetCandidateCount?: number;
  isAmbiguousTarget?: boolean;
  viewerContext?: {
    selection?: unknown;
    sheetName?: string;
    frozenSelection?: unknown;
  };
}

export interface SupportContractResult {
  ok: boolean;
  outcomeType?: EditOutcomeType;
  blockedReason?: EditBlockedReason;
  gates: SupportGateResult[];
  resolvedCanonicalOperator?: string | null;
  details?: Record<string, unknown>;
}

const EXECUTOR_RUNTIME_OPS = new Set<EditOperator>([
  "EDIT_PARAGRAPH",
  "EDIT_SPAN",
  "EDIT_DOCX_BUNDLE",
  "ADD_PARAGRAPH",
  "EDIT_CELL",
  "EDIT_RANGE",
  "ADD_SHEET",
  "RENAME_SHEET",
  "DELETE_SHEET",
  "CREATE_CHART",
  "COMPUTE",
  "COMPUTE_BUNDLE",
  "ADD_SLIDE",
  "REWRITE_SLIDE_TEXT",
  "REPLACE_SLIDE_IMAGE",
]);

const TARGET_OPTIONAL_RUNTIME_OPS = new Set<EditOperator>([
  "ADD_SHEET",
  "RENAME_SHEET",
  "DELETE_SHEET",
  "CREATE_CHART",
  "COMPUTE",
  "COMPUTE_BUNDLE",
  "ADD_SLIDE",
  "PY_COMPUTE",
  "PY_CHART",
  "PY_WRITEBACK",
]);

function runtimeDomain(domain: EditDomain): "docx" | "excel" | null {
  if (domain === "docx") return "docx";
  if (domain === "sheets") return "excel";
  return null;
}

function pushGate(
  gates: SupportGateResult[],
  gate: EditSupportGateId,
  pass: boolean,
  detail?: string,
): void {
  gates.push({ gate, pass, ...(detail ? { detail } : {}) });
}

function makeBlocked(
  gate: EditSupportGateId,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): EditBlockedReason {
  return { code, gate, message, ...(details ? { details } : {}) };
}

function resolveUxPrompt(
  promptKey: string,
  language: "en" | "pt",
  params?: Record<string, string>,
): string | null {
  try {
    const ux = safeEditingBank<any>("editing_ux");
    const template =
      ux?.prompts?.[promptKey]?.[language] || ux?.prompts?.[promptKey]?.en;
    if (!template) return null;
    if (!params) return template;
    return template.replace(
      /\{\{(\w+)\}\}/g,
      (_: string, k: string) => params[k] ?? "",
    );
  } catch {
    return null;
  }
}

function hydrateClarificationMessage(
  missingSlots: string[],
  language: "en" | "pt" = "en",
): string {
  // If the only missing slot is rangeA1, use the specialized UX prompt
  if (
    missingSlots.length === 1 &&
    (missingSlots[0] === "rangeA1" || missingSlots[0] === "range")
  ) {
    const uxMsg = resolveUxPrompt("range_required", language, {
      exampleRange: "A1:D10",
    });
    if (uxMsg) return uxMsg;
  }

  try {
    const microcopy = safeEditingBank<any>("editing_microcopy");
    const template =
      microcopy?.copy?.clarifications?.[language]?.missing_entities ||
      microcopy?.copy?.clarifications?.en?.missing_entities ||
      "I need one more detail to continue: {{missing}}.";
    const slotList = missingSlots.join(", ");
    return template.replace(/\{\{missing\}\}/g, slotList);
  } catch {
    return `Missing required parameters: ${missingSlots.join(", ")}`;
  }
}

export class SupportContractService {
  evaluatePreApply(input: SupportContractInput): SupportContractResult {
    const gates: SupportGateResult[] = [];
    const operatorCatalog = loadOperatorCatalog();
    const source = input.intentSource || "classified";
    const rtDomain = runtimeDomain(input.domain);

    let patternCovered = false;
    let slotsSatisfied = false;
    let clarificationSlots: string[] = [];

    const slotContext: Record<string, unknown> = {};

    if (source === "explicit_operator" || !rtDomain) {
      patternCovered = true;
      slotsSatisfied = true;
      pushGate(gates, "pattern_coverage", true, "explicit operator source");
      pushGate(gates, "slot_fill", true, "explicit operator source");
    } else {
      const runtime = analyzeMessageToPlan({
        message: input.instruction,
        domain: rtDomain,
        viewerContext: input.viewerContext || {},
      });

      if (!runtime) {
        patternCovered = false;
        slotsSatisfied = false;
        pushGate(
          gates,
          "pattern_coverage",
          false,
          "no matching intent pattern",
        );
        pushGate(gates, "slot_fill", false, "no matched pattern to fill slots");
      } else if (runtime.kind === "clarification") {
        patternCovered = true;
        slotsSatisfied = false;
        clarificationSlots = runtime.missingSlots
          .map((slot) => String(slot?.slot || "").trim())
          .filter(Boolean);
        pushGate(gates, "pattern_coverage", true);
        pushGate(
          gates,
          "slot_fill",
          false,
          clarificationSlots.length
            ? `missing slots: ${clarificationSlots.join(", ")}`
            : "missing required slots",
        );
      } else {
        patternCovered = true;
        slotsSatisfied = true;
        pushGate(gates, "pattern_coverage", true);
        pushGate(gates, "slot_fill", true);
        // Collect slot data from resolved plan for downstream template hydration
        for (const op of runtime.ops) {
          for (const [k, v] of Object.entries(op.params)) {
            if (v != null && slotContext[k] === undefined) slotContext[k] = v;
          }
        }
      }
    }

    const hasScope =
      TARGET_OPTIONAL_RUNTIME_OPS.has(input.runtimeOperator) ||
      (typeof input.resolvedTargetId === "string" &&
        input.resolvedTargetId.trim().length > 0);
    pushGate(
      gates,
      "scope_resolution",
      hasScope,
      hasScope ? undefined : "target was not resolved",
    );

    const opEntries = Object.entries(operatorCatalog || {});
    const normalizedCanonical =
      String(input.canonicalOperator || "")
        .trim()
        .toUpperCase() || null;
    const matchedCanonicalById =
      normalizedCanonical && operatorCatalog[normalizedCanonical]
        ? normalizedCanonical
        : null;
    const matchedCanonicalByRuntime =
      opEntries.find(([, entry]) => {
        if (!entry || typeof entry !== "object") return false;
        const entryRuntime = String(
          (entry as any).runtimeOperator || "",
        ).trim();
        const entryDomain = String((entry as any).domain || "").trim();
        const domainMatches =
          input.domain === "docx"
            ? entryDomain === "docx"
            : input.domain === "sheets"
              ? entryDomain === "excel"
              : true;
        return domainMatches && entryRuntime === input.runtimeOperator;
      })?.[0] || null;
    const resolvedCanonicalOperator =
      matchedCanonicalById || matchedCanonicalByRuntime;
    const catalogPass = Boolean(resolvedCanonicalOperator);
    pushGate(
      gates,
      "operator_catalog",
      catalogPass,
      catalogPass
        ? undefined
        : `runtime operator ${input.runtimeOperator} is not mapped in operator_catalog`,
    );

    const executorPass = EXECUTOR_RUNTIME_OPS.has(input.runtimeOperator);
    pushGate(
      gates,
      "executor_branch",
      executorPass,
      executorPass
        ? undefined
        : `runtime operator ${input.runtimeOperator} is not supported by revision store`,
    );

    if (!patternCovered && source !== "explicit_operator") {
      return {
        ok: false,
        outcomeType: "unknown_unsupported",
        blockedReason: makeBlocked(
          "pattern_coverage",
          "UNKNOWN_UNSUPPORTED_INTENT",
          "This request did not match any supported editing intent pattern.",
        ),
        gates,
      };
    }

    if (!slotsSatisfied) {
      const lang = input.language || "en";
      const clarificationMessage = clarificationSlots.length
        ? hydrateClarificationMessage(clarificationSlots, lang)
        : "Missing required parameters before this edit can be applied.";
      return {
        ok: false,
        outcomeType: "clarification_required",
        blockedReason: makeBlocked(
          "slot_fill",
          "CLARIFICATION_REQUIRED",
          clarificationMessage,
          clarificationSlots.length
            ? { missingSlots: clarificationSlots }
            : undefined,
        ),
        gates,
      };
    }

    if (
      input.isAmbiguousTarget &&
      (input.resolvedTargetCandidateCount ?? 0) > 1
    ) {
      const lang = input.language || "en";
      const ambiguousMsg =
        resolveUxPrompt("ambiguous_target", lang, {
          candidateCount: String(input.resolvedTargetCandidateCount),
        }) ||
        `Found ${input.resolvedTargetCandidateCount} possible targets. Which one should I edit?`;
      return {
        ok: false,
        outcomeType: "clarification_required",
        blockedReason: makeBlocked(
          "scope_resolution",
          "AMBIGUOUS_TARGET",
          ambiguousMsg,
          { candidateCount: input.resolvedTargetCandidateCount },
        ),
        gates,
      };
    }

    if (!hasScope) {
      const lang = input.language || "en";
      // Use editing_ux prompts for better UX messages
      const scopeMessage =
        resolveUxPrompt("no_selection_confirm", lang, {
          fallbackScope:
            input.domain === "sheets" ? "active sheet" : "current section",
        }) || "Could not resolve a concrete target for this edit.";
      return {
        ok: false,
        outcomeType: "blocked",
        blockedReason: makeBlocked(
          "scope_resolution",
          "TARGET_NOT_RESOLVED",
          scopeMessage,
        ),
        gates,
      };
    }

    if (!catalogPass || !executorPass) {
      return {
        ok: false,
        outcomeType: "engine_unsupported",
        blockedReason: makeBlocked(
          !catalogPass ? "operator_catalog" : "executor_branch",
          "ENGINE_UNSUPPORTED",
          "This operation is recognized but not supported by the active editing engine.",
          {
            runtimeOperator: input.runtimeOperator,
            ...(normalizedCanonical
              ? { canonicalOperator: normalizedCanonical }
              : {}),
          },
        ),
        gates,
      };
    }

    return {
      ok: true,
      gates,
      resolvedCanonicalOperator,
      details:
        Object.keys(slotContext).length > 0 ? { slotContext } : undefined,
    };
  }
}
