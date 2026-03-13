import { PromptRegistryConfigError } from "./errors";
import { defaultLayerByKind, safeStr, uniq } from "./helpers";
import type {
  PromptConcern,
  PromptContext,
  PromptKind,
  PromptRegistryBank,
} from "./types";

function toConcernSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value
      .map((entry) => safeStr(entry).trim())
      .filter((entry: string) => entry.length > 0),
  );
}

export function assertPromptRegistryLayersValid(registry: PromptRegistryBank): void {
  const layers =
    registry?.layersByKind && typeof registry.layersByKind === "object"
      ? (registry.layersByKind as Record<string, unknown>)
      : null;
  if (!layers) return;

  const promptFileIds = new Set(
    Array.isArray(registry?.promptFiles)
      ? registry.promptFiles
          .map((row) => safeStr(row?.id))
          .filter((id: string) => id.length > 0)
      : [],
  );
  const promptFileConcerns = new Map<string, Set<string>>();
  if (Array.isArray(registry?.promptFiles)) {
    for (const row of registry.promptFiles) {
      const id = safeStr(row?.id).trim();
      if (!id) continue;
      promptFileConcerns.set(id, toConcernSet(row?.concerns));
    }
  }

  const failures: string[] = [];
  for (const [kind, rawIds] of Object.entries(layers)) {
    if (!Array.isArray(rawIds)) {
      failures.push(`invalid_layer_shape:${kind}`);
      continue;
    }
    const seen = new Set<string>();
    for (const rawId of rawIds) {
      const layerId = safeStr(rawId).trim();
      if (!layerId) {
        failures.push(`empty_layer_id:${kind}`);
        continue;
      }
      if (seen.has(layerId)) {
        failures.push(`duplicate_layer_id:${kind}:${layerId}`);
        continue;
      }
      seen.add(layerId);
      if (promptFileIds.size > 0 && !promptFileIds.has(layerId)) {
        failures.push(`unknown_layer_id:${kind}:${layerId}`);
      }
    }

    if (!Array.isArray(registry?.forbiddenConcernOverlaps)) continue;
    const layerIds = rawIds
      .map((value) => safeStr(value).trim())
      .filter((value: string) => value.length > 0);
    for (const pair of registry.forbiddenConcernOverlaps) {
      const left = safeStr(pair?.left).trim();
      const right = safeStr(pair?.right).trim();
      if (!left || !right) continue;

      for (const layerId of layerIds) {
        const concerns = promptFileConcerns.get(layerId) ?? new Set<string>();
        if (concerns.has(left) && concerns.has(right)) {
          failures.push(`bank_conflicting_concerns:${layerId}:${left}:${right}`);
        }
      }

    }
  }

  if (failures.length > 0) {
    throw new PromptRegistryConfigError(
      `prompt_registry.any.json has invalid layered configuration: ${failures.join(", ")}`,
      { failures },
    );
  }
}

export function resolveBankIdsForKind(
  kind: PromptKind,
  registry: PromptRegistryBank,
): string[] {
  const fromRegistry =
    (registry.layersByKind as Partial<Record<PromptKind, unknown>> | undefined)?.[
      kind
    ];
  if (
    Array.isArray(fromRegistry) &&
    fromRegistry.every(
      (v: unknown) => typeof v === "string" && (v as string).trim(),
    )
  ) {
    return uniq(fromRegistry.map((v: string) => v.trim()));
  }

  const mapped = registry.map?.[kind];
  if (typeof mapped === "string" && mapped.trim()) {
    return [mapped.trim()];
  }

  return defaultLayerByKind(kind);
}

export function resolveRequiredFlags(registry: PromptRegistryBank): Map<string, boolean> {
  const requiredByBankId = new Map<string, boolean>();
  if (!Array.isArray(registry.promptFiles)) return requiredByBankId;

  for (const row of registry.promptFiles) {
    const id = safeStr(row.id).trim();
    if (!id) continue;
    requiredByBankId.set(id, row.required !== false);
  }

  return requiredByBankId;
}

const DEFAULT_REQUIRED_CONCERNS: Partial<Record<PromptKind, PromptConcern[]>> = {
  compose_answer: [
    "global_bans",
    "grounding",
    "answer_shape",
    "citation_contract",
    "voice_selection",
    "answer_strategy",
    "anti_robotic_repair",
    "uncertainty_wording",
  ],
  retrieval: ["global_bans", "grounding", "retrieval_planner"],
  disambiguation: ["global_bans", "clarification_render"],
  fallback: ["global_bans", "fallback_render"],
  tool: ["global_bans", "tool_contract"],
};

function resolvePromptFileConcerns(
  registry: PromptRegistryBank,
): Map<string, Set<string>> {
  const promptFileConcerns = new Map<string, Set<string>>();
  for (const row of registry.promptFiles || []) {
    const id = safeStr(row?.id).trim();
    if (!id) continue;
    promptFileConcerns.set(id, toConcernSet(row?.concerns));
  }
  return promptFileConcerns;
}

export function assertRequiredConcernCoverage(params: {
  kind: PromptKind;
  registry: PromptRegistryBank;
  bankIds: string[];
  ctx?: PromptContext;
}): void {
  const { kind, registry, bankIds, ctx } = params;
  if (!registry.requiredConcernsByKind) return;
  const declared =
    (registry.requiredConcernsByKind as
      | Partial<Record<PromptKind, PromptConcern[]>>
      | undefined)?.[kind] ?? DEFAULT_REQUIRED_CONCERNS[kind];
  if (!Array.isArray(declared) || declared.length === 0) return;

  const requiredConcerns = new Set(
    declared.map((value) => safeStr(value).trim()).filter(Boolean),
  );

  const runtimeSignals =
    ctx?.runtimeSignals && typeof ctx.runtimeSignals === "object"
      ? (ctx.runtimeSignals as Record<string, unknown>)
      : {};
  if (kind === "tool" && runtimeSignals.userVisibleCitations !== true) {
    requiredConcerns.delete("citation_contract");
  }

  const promptFileConcerns = resolvePromptFileConcerns(registry);
  const covered = new Set<string>();
  for (const bankId of bankIds) {
    for (const concern of promptFileConcerns.get(bankId) || []) {
      covered.add(concern);
    }
  }

  const missing = Array.from(requiredConcerns).filter(
    (concern) => !covered.has(concern),
  );
  if (missing.length === 0) return;

  throw new PromptRegistryConfigError(
    `prompt_registry.any.json is missing required concern coverage for ${kind}: ${missing.join(", ")}`,
    {
      kind,
      missing,
      bankIds,
    },
  );
}
