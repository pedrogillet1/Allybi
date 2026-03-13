import type { DocumentStatus } from "@prisma/client";
import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";

export type ScopeRuntimeConfig = {
  maxScopeDocs: number;
  clearScopeRegex: RegExp[];
  docStatusesAllowed: DocumentStatus[];
};

const KNOWN_DOCUMENT_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  "ready",
  "indexed",
  "enriching",
  "available",
  "completed",
]);

export function resolveScopeRuntimeConfig(
  bankLoader: Pick<
    ReturnType<typeof getBankLoaderInstance>,
    "getBank"
  > = getBankLoaderInstance(),
): ScopeRuntimeConfig {
  const policyBank = bankLoader.getBank<any>("memory_policy");
  const runtime = policyBank?.config?.runtimeTuning?.scopeRuntime;
  if (!runtime || typeof runtime !== "object") {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime is required",
    );
  }

  const maxScopeDocs = Number(runtime.maxScopeDocs);
  if (!Number.isFinite(maxScopeDocs) || maxScopeDocs <= 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.maxScopeDocs is required",
    );
  }

  const patterns = runtime.clearScopePatterns;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.clearScopePatterns is required",
    );
  }

  const clearScopeRegex = patterns.map((pattern: unknown) => {
    const source = String(pattern || "").trim();
    if (!source) {
      throw new Error(
        "memory_policy.config.runtimeTuning.scopeRuntime.clearScopePatterns contains an empty pattern",
      );
    }
    try {
      return new RegExp(source, "i");
    } catch {
      throw new Error(
        `Invalid clear scope regex in memory_policy scopeRuntime: ${source}`,
      );
    }
  });

  const docStatusesAllowed = (
    Array.isArray(runtime.docStatusesAllowed) ? runtime.docStatusesAllowed : []
  )
    .map((status: unknown) =>
      String(status || "")
        .trim()
        .toLowerCase(),
    )
    .filter((status: string): status is DocumentStatus =>
      KNOWN_DOCUMENT_STATUSES.has(status as DocumentStatus),
    );
  if (docStatusesAllowed.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docStatusesAllowed is required",
    );
  }

  return {
    maxScopeDocs: Math.floor(maxScopeDocs),
    clearScopeRegex,
    docStatusesAllowed,
  };
}
