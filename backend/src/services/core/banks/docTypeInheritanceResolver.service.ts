export interface InheritableDocTypePack {
  id: string;
  extends?: string[];
  sections?: unknown[];
  tables?: unknown[];
  extractionHints?: unknown[];
  sectionsOverride?: unknown[];
  tablesOverride?: unknown[];
  extractionOverride?: unknown[];
  [k: string]: unknown;
}

export interface InheritanceResolutionResult {
  resolvedById: Record<string, InheritableDocTypePack>;
  cyclePaths: string[][];
  hasCycles: boolean;
}

function clonePack(pack: InheritableDocTypePack): InheritableDocTypePack {
  return JSON.parse(JSON.stringify(pack));
}

function asId(value: unknown): string {
  return String(value || "").trim();
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => asId(item)).filter(Boolean)));
}

export class DocTypeInheritanceResolverService {
  resolve(packs: InheritableDocTypePack[]): InheritanceResolutionResult {
    const byId = new Map<string, InheritableDocTypePack>();
    for (const pack of packs) {
      const id = asId(pack?.id);
      if (!id) continue;
      byId.set(id, clonePack(pack));
    }

    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const cycles: string[][] = [];

    const merge = (
      base: InheritableDocTypePack,
      child: InheritableDocTypePack,
    ): InheritableDocTypePack => {
      const out = clonePack(base);
      for (const [k, v] of Object.entries(child)) out[k] = v;
      out.sections =
        Array.isArray(child.sectionsOverride) && child.sectionsOverride.length > 0
          ? child.sectionsOverride
          : Array.isArray(child.sections)
            ? child.sections
            : out.sections;
      out.tables =
        Array.isArray(child.tablesOverride) && child.tablesOverride.length > 0
          ? child.tablesOverride
          : Array.isArray(child.tables)
            ? child.tables
            : out.tables;
      out.extractionHints =
        Array.isArray(child.extractionOverride) &&
        child.extractionOverride.length > 0
          ? child.extractionOverride
          : Array.isArray(child.extractionHints)
            ? child.extractionHints
            : out.extractionHints;
      out.id = child.id;
      out.extends = asIdList(child.extends);
      return out;
    };

    const resolveOne = (id: string): InheritableDocTypePack | null => {
      const node = byId.get(id);
      if (!node) return null;
      const current = state.get(id) ?? 0;
      if (current === 2) return node;
      if (current === 1) {
        const idx = stack.indexOf(id);
        cycles.push(idx >= 0 ? [...stack.slice(idx), id] : [id, id]);
        return node;
      }

      state.set(id, 1);
      stack.push(id);
      let resolved = clonePack(node);
      for (const parentId of asIdList(node.extends)) {
        const parent = resolveOne(parentId);
        if (!parent) continue;
        resolved = merge(parent, resolved);
      }
      stack.pop();
      state.set(id, 2);
      byId.set(id, resolved);
      return resolved;
    };

    for (const id of byId.keys()) resolveOne(id);

    const resolvedById: Record<string, InheritableDocTypePack> = {};
    for (const [id, pack] of byId) resolvedById[id] = pack;

    return {
      resolvedById,
      cyclePaths: cycles,
      hasCycles: cycles.length > 0,
    };
  }
}

let singleton: DocTypeInheritanceResolverService | null = null;

export function getDocTypeInheritanceResolverInstance(): DocTypeInheritanceResolverService {
  if (!singleton) singleton = new DocTypeInheritanceResolverService();
  return singleton;
}

