import { getOptionalBank } from "./bankLoader.service";

interface BankRegistryEntryLike {
  id?: unknown;
  dependsOn?: unknown;
}

interface BankRegistryLike {
  banks?: unknown;
}

interface BankDependencyNodeLike {
  id?: unknown;
  dependsOn?: unknown;
}

interface BankDependenciesLike {
  banks?: unknown;
}

export interface BankLoadPlanInput {
  rootBankIds: string[];
}

export interface BankLoadPlanResult {
  rootBankIds: string[];
  orderedBankIds: string[];
  expandedBankIds: string[];
  missingBankIds: string[];
  cyclePaths: string[][];
  hasCycles: boolean;
}

function asId(value: unknown): string {
  return String(value || "").trim();
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => asId(item))
        .filter(Boolean),
    ),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export class BankLoadPlannerService {
  private graphCache: Map<string, Set<string>> | null = null;
  private cacheKey = "";

  private resolveGraphSources(): {
    registry: BankRegistryLike | null;
    dependencies: BankDependenciesLike | null;
  } {
    const registry = getOptionalBank<BankRegistryLike>("bank_registry");
    const dependencies =
      getOptionalBank<BankDependenciesLike>("bank_dependencies");
    return { registry, dependencies };
  }

  private makeCacheKey(
    registry: BankRegistryLike | null,
    dependencies: BankDependenciesLike | null,
  ): string {
    const registryCount = Array.isArray(registry?.banks)
      ? registry!.banks.length
      : 0;
    const dependencyCount = Array.isArray(dependencies?.banks)
      ? dependencies!.banks.length
      : 0;
    const registryVersion = asId((registry as Record<string, unknown>)?._meta);
    const dependenciesVersion = asId(
      (dependencies as Record<string, unknown>)?._meta,
    );
    return `${registryCount}:${dependencyCount}:${registryVersion}:${dependenciesVersion}`;
  }

  private buildGraph(): Map<string, Set<string>> {
    const { registry, dependencies } = this.resolveGraphSources();
    const cacheKey = this.makeCacheKey(registry, dependencies);
    if (this.graphCache && this.cacheKey === cacheKey) {
      return this.graphCache;
    }

    const graph = new Map<string, Set<string>>();

    const ensureNode = (id: string) => {
      if (!graph.has(id)) graph.set(id, new Set<string>());
    };

    const registryBanks = Array.isArray(registry?.banks)
      ? (registry?.banks as BankRegistryEntryLike[])
      : [];
    for (const bank of registryBanks) {
      const bankId = asId(bank?.id);
      if (!bankId) continue;
      ensureNode(bankId);
      for (const dep of asIdList(bank?.dependsOn)) {
        ensureNode(dep);
        graph.get(bankId)!.add(dep);
      }
    }

    const dependencyBanks = Array.isArray(dependencies?.banks)
      ? (dependencies?.banks as BankDependencyNodeLike[])
      : [];
    for (const node of dependencyBanks) {
      const bankId = asId(node?.id);
      if (!bankId) continue;
      ensureNode(bankId);
      for (const dep of asIdList(node?.dependsOn)) {
        ensureNode(dep);
        graph.get(bankId)!.add(dep);
      }
    }

    this.graphCache = graph;
    this.cacheKey = cacheKey;
    return graph;
  }

  plan(input: BankLoadPlanInput): BankLoadPlanResult {
    const graph = this.buildGraph();
    const roots = unique(input.rootBankIds.map((id) => asId(id)));

    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const ordered: string[] = [];
    const missing = new Set<string>();
    const cyclePaths: string[][] = [];

    const visit = (id: string) => {
      if (!id) return;
      if (!graph.has(id)) {
        missing.add(id);
        return;
      }

      const current = state.get(id) ?? 0;
      if (current === 2) return;
      if (current === 1) {
        const cycleStart = stack.indexOf(id);
        if (cycleStart >= 0) {
          cyclePaths.push([...stack.slice(cycleStart), id]);
        } else {
          cyclePaths.push([id, id]);
        }
        return;
      }

      state.set(id, 1);
      stack.push(id);

      const deps = sorted(Array.from(graph.get(id) || []));
      for (const dep of deps) visit(dep);

      stack.pop();
      state.set(id, 2);
      ordered.push(id);
    };

    for (const root of roots) visit(root);

    const orderedBankIds = unique(ordered);
    return {
      rootBankIds: roots,
      orderedBankIds,
      expandedBankIds: orderedBankIds,
      missingBankIds: sorted(Array.from(missing)),
      cyclePaths,
      hasCycles: cyclePaths.length > 0,
    };
  }
}

let singleton: BankLoadPlannerService | null = null;

export function getBankLoadPlannerInstance(): BankLoadPlannerService {
  if (!singleton) {
    singleton = new BankLoadPlannerService();
  }
  return singleton;
}

