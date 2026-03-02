#!/usr/bin/env node
import fs from "fs";
import path from "path";

const repoRoot = path.resolve(process.cwd());
const banksRoot = path.join(repoRoot, "src", "data_banks");
const registryPath = path.join(banksRoot, "manifest", "bank_registry.any.json");
const depsPath = path.join(banksRoot, "manifest", "bank_dependencies.any.json");
const args = new Set(process.argv.slice(2));
const write = args.has("--write");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sortedUnique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

if (!fs.existsSync(registryPath)) {
  console.error(`[banks:deps] missing registry: ${registryPath}`);
  process.exit(1);
}

const registry = readJson(registryPath);
const existing = fs.existsSync(depsPath) ? readJson(depsPath) : null;

const banks = Array.isArray(registry?.banks) ? registry.banks : [];
const byId = new Map(
  banks
    .map((entry) => [String(entry?.id || "").trim(), entry])
    .filter(([id]) => id),
);

const registryLoadOrder = Array.isArray(registry?.loadOrder)
  ? registry.loadOrder.map((category) => String(category || "").trim()).filter(Boolean)
  : [];
const categoriesInBanks = sortedUnique(
  banks.map((entry) => String(entry?.category || "").trim()),
);
const categoryRank = new Map();
registryLoadOrder.forEach((category, index) => categoryRank.set(category, index));
const orderedCategories = [...categoriesInBanks].sort((a, b) => {
  const ar = categoryRank.has(a) ? categoryRank.get(a) : 999;
  const br = categoryRank.has(b) ? categoryRank.get(b) : 999;
  if (ar !== br) return ar - br;
  return a.localeCompare(b);
});

const existingCategoryDeps =
  existing?.categories && typeof existing.categories === "object"
    ? Object.fromEntries(
        Object.entries(existing.categories)
          .filter(([key]) => !String(key).startsWith("_"))
          .map(([key, deps]) => [
            String(key || "").trim(),
            Array.isArray(deps)
              ? deps.map((d) => String(d || "").trim()).filter(Boolean)
              : [],
          ]),
      )
    : {};

const derivedCategoryDeps = Object.fromEntries(
  orderedCategories.map((category) => [category, new Set(existingCategoryDeps[category] || [])]),
);
for (const entry of banks) {
  const id = String(entry?.id || "").trim();
  const category = String(entry?.category || "").trim();
  if (!id || !category || !derivedCategoryDeps[category]) continue;
  const deps = Array.isArray(entry?.dependsOn)
    ? entry.dependsOn.map((dep) => String(dep || "").trim()).filter(Boolean)
    : [];
  for (const depId of deps) {
    const depEntry = byId.get(depId);
    if (!depEntry) continue;
    const depCategory = String(depEntry?.category || "").trim();
    if (!depCategory || depCategory === category) continue;
    derivedCategoryDeps[category].add(depCategory);
  }
}

const categories = {
  _comment:
    "Category-level dependencies derived from registry + preserved curated edges.",
};
for (const category of orderedCategories) {
  const deps = sortedUnique([...derivedCategoryDeps[category]].filter((dep) => dep !== category));
  categories[category] = deps;
}

const nodes = banks
  .map((entry) => {
    const id = String(entry?.id || "").trim();
    if (!id) return null;
    const deps = sortedUnique(
      (Array.isArray(entry?.dependsOn) ? entry.dependsOn : [])
        .map((dep) => String(dep || "").trim())
        .filter((dep) => byId.has(dep)),
    );
    const required = entry?.requiredByEnv || {};
    const requiredStrict = Boolean(required.production) || Boolean(required.staging);
    const node = {
      id,
      dependsOn: deps,
    };
    if (!requiredStrict) {
      node.optional = true;
    }
    return node;
  })
  .filter(Boolean)
  .sort((a, b) => a.id.localeCompare(b.id));

const out = {
  _meta: {
    ...(existing?._meta || {
      id: "bank_dependencies",
      version: "1.1.0",
      description:
        "Explicit dependency graph generated from bank_registry (SSOT) with deterministic category dependency overlays.",
      languages: ["any"],
    }),
    id: "bank_dependencies",
    lastUpdated: "2026-03-01",
  },
  config: {
    ...(existing?.config || {}),
    enabled: true,
    strict: true,
    failOnMissingNode: true,
    failOnCycle: true,
  },
  categories,
  banks: nodes,
  tests: existing?.tests || {
    cases: [
      {
        id: "BD_0001_nodes_match_registry",
        assert: "all bank_registry ids appear exactly once in banks[].id",
      },
      {
        id: "BD_0002_edges_known",
        assert: "all banks[].dependsOn entries refer to known bank_registry ids",
      },
      {
        id: "BD_0003_category_coverage",
        assert: "all registry categories appear in categories keys",
      },
    ],
  },
};

if (!write) {
  const current = fs.existsSync(depsPath) ? fs.readFileSync(depsPath, "utf8") : "";
  const next = `${JSON.stringify(out, null, 2)}\n`;
  if (current === next) {
    console.log("[banks:deps] up to date");
    process.exit(0);
  }
  console.error("[banks:deps] out of date (run with --write)");
  process.exit(1);
}

writeJson(depsPath, out);
console.log(`[banks:deps] wrote ${path.relative(repoRoot, depsPath)} with ${nodes.length} nodes`);
