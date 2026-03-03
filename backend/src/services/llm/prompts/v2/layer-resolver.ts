import { PromptRegistryConfigError } from "./errors";
import { defaultLayerByKind, safeStr, uniq } from "./helpers";
import type { PromptKind, PromptRegistryBank } from "./types";

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
