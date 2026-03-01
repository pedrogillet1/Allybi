/* eslint-disable no-console */
/**
 * generateCapabilitiesCatalog.ts
 *
 * Refreshes data_banks/semantics/capabilities_catalog.any.json sourceOperators
 * from canonical operator banks while preserving curated copy text.
 *
 * Run:
 *   npx ts-node src/data_banks/generators/generateCapabilitiesCatalog.ts
 */

import * as fs from "fs";
import * as path from "path";

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p: string, obj: any): void {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function safeArr(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureGroup(template: any, id: string): any {
  const groups = safeArr(template?.groups);
  const existing = groups.find((group: any) => String(group?.id || "").trim() === id);
  if (existing) return existing;
  const fallback = {
    id,
    title: { en: id, pt: id, es: id },
    bullets: { en: [], pt: [], es: [] },
    examplePrompts: { en: [], pt: [], es: [] },
    sourceOperators: [],
  };
  groups.push(fallback);
  template.groups = groups;
  return fallback;
}

function main() {
  const root = path.join(__dirname, ".."); // backend/src/data_banks
  const operatorsDir = path.join(root, "operators");
  const semanticsDir = path.join(root, "semantics");

  const contractsPath = path.join(operatorsDir, "operator_contracts.any.json");
  const capabilitiesPath = path.join(semanticsDir, "allybi_capabilities.any.json");
  const outPath = path.join(semanticsDir, "capabilities_catalog.any.json");

  const contracts = readJson(contractsPath);
  const capabilities = readJson(capabilitiesPath);
  const template = fs.existsSync(outPath)
    ? readJson(outPath)
    : {
        _meta: {
          id: "capabilities_catalog",
          version: "1.1.0",
          description:
            "Canonical capability catalog for Allybi. This is derived from operator banks to stay aligned with real system behavior.",
          languages: ["any", "en", "pt", "es"],
          owner: "allybi-banks",
          compat: ">=1.0.0",
        },
        config: {
          enabled: true,
          maxGroups: 6,
          maxBulletsPerGroup: 4,
          maxExamplePromptsPerGroup: 3,
        },
        groups: [],
      };

  const ops: Array<{ id: string; family?: string }> = safeArr(
    contracts?.operators ?? contracts,
  );

  const byFamily = new Map<string, string[]>();
  for (const op of ops) {
    const id = String(op?.id || "").trim();
    if (!id) continue;
    const family = String(op?.family || "unknown").trim() || "unknown";
    byFamily.set(family, uniq([...(byFamily.get(family) || []), id]));
  }

  const supportedEditingOperators = Object.entries(capabilities?.operators || {})
    .filter(([, data]: [string, any]) => Boolean(data?.supported))
    .map(([id]) => String(id).trim())
    .filter(Boolean);

  const groupOps = {
    docs_qa: uniq([...(byFamily.get("documents") || [])]),
    search_nav: uniq([
      ...(byFamily.get("navigation") || []),
      ...(byFamily.get("file_actions") || []),
    ]),
    editing: uniq([
      ...(byFamily.get("editing") || []),
      ...supportedEditingOperators,
    ]),
    connectors_email: uniq([
      ...(byFamily.get("connectors") || []),
      ...(byFamily.get("email") || []),
    ]),
  };

  const docsGroup = ensureGroup(template, "docs_qa");
  const navGroup = ensureGroup(template, "search_nav");
  const editingGroup = ensureGroup(template, "editing");
  const connectorsGroup = ensureGroup(template, "connectors_email");

  docsGroup.sourceOperators = groupOps.docs_qa;
  navGroup.sourceOperators = groupOps.search_nav;
  editingGroup.sourceOperators = groupOps.editing;
  connectorsGroup.sourceOperators = groupOps.connectors_email;

  template._meta = {
    ...(template._meta || {}),
    id: "capabilities_catalog",
    version: "1.1.0",
    lastUpdated: nowIso(),
    derivedFrom: [
      "operators/operator_contracts.any.json",
      "semantics/allybi_capabilities.any.json",
    ],
  };

  writeJson(outPath, template);

  console.log(
    `Wrote ${path.relative(process.cwd(), outPath)} (${safeArr(template.groups).length} groups)`,
  );
}

main();
