#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const STRICT_RUNTIME =
  process.argv.includes("--strict-runtime") ||
  process.argv.includes("--strict");

const CWD = process.cwd();
const BACKEND_ROOT = fs.existsSync(path.resolve(CWD, "backend/src"))
  ? path.resolve(CWD, "backend")
  : CWD;
const SRC_ROOT = path.join(BACKEND_ROOT, "src");
const OUTPUT_DIR = path.join(BACKEND_ROOT, "docs", "runtime");

function readBudgetMinCoverage() {
  const candidates = [
    path.resolve(CWD, "scripts/audit/reachability-budget.json"),
    path.resolve(CWD, "backend/scripts/audit/reachability-budget.json"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (typeof parsed?.minRuntimeCoverage === "number") {
        return parsed.minRuntimeCoverage;
      }
    } catch {
      // ignore malformed budget and continue with default fallback.
    }
  }
  return 0.59;
}

const MIN_RUNTIME_COVERAGE = Number.parseFloat(
  process.env.RUNTIME_MIN_COVERAGE || String(readBudgetMinCoverage()),
);

const SEED_CANDIDATES = [
  path.join(SRC_ROOT, "server.ts"),
  path.join(SRC_ROOT, "main", "server.ts"),
  path.join(SRC_ROOT, "app.ts"),
  path.join(SRC_ROOT, "workers", "document-worker.ts"),
  path.join(SRC_ROOT, "entrypoints", "workers", "document.worker.ts"),
  path.join(SRC_ROOT, "entrypoints", "workers", "jobs.worker.ts"),
];

const RUNTIME_EXCLUDE_PATHS = new Set([
  "src/services/chat/guardrails/editorMode.guard.ts",
  "src/services/chat/handlers/editorTurn.handler.ts",
  "src/services/editing/docx/docxValidator.service.ts",
  "src/services/editing/editing.constants.ts",
  "src/services/editing/xlsx/xlsxFileEditor.service.ts",
  "src/services/extraction/ocrSignals.service.ts",
]);

function normalizeRel(absPath) {
  return path.relative(BACKEND_ROOT, absPath).replace(/\\/g, "/");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function listSourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        stack.push(full);
        continue;
      }
      if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(full);
    }
  }
  return out;
}

function parseSpecifiers(code) {
  const sanitized = String(code || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const specs = new Set();
  const patterns = [
    /import\s+[^'"`]*?from\s*['"]([^'"`]+)['"]/g,
    /import\s*['"]([^'"`]+)['"]\s*;?/g,
    /export\s+[^'"`]*?from\s*['"]([^'"`]+)['"]/g,
    /import\(\s*['"]([^'"`]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(sanitized)) !== null) {
      const spec = String(m[1] || "").trim();
      if (spec) specs.add(spec);
    }
  }
  return [...specs];
}

function resolveLocalImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.mjs"),
    path.join(base, "index.cjs"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function topLevelBucket(absPath) {
  const rel = normalizeRel(absPath);
  const parts = rel.split("/");
  return parts.length >= 2 ? parts[1] : "(root)";
}

function classifyWrapper(filePath, source) {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"));
  if (lines.length !== 1) return null;
  const line = lines[0];
  const m = line.match(
    /^export\s+\{\s*default\s*\}\s+from\s+['"]([^'"]+)['"];?$/,
  );
  if (m) {
    return {
      type: "default_reexport",
      target: m[1],
      legacyRouteWrapper: /\.\.\/\.\.\/\.\.\/routes\//.test(m[1]),
    };
  }
  const m2 = line.match(/^export\s+\{\s*.+\s*\}\s+from\s+['"]([^'"]+)['"];?$/);
  if (m2) {
    return {
      type: "named_reexport",
      target: m2[1],
      legacyRouteWrapper: /\.\.\/\.\.\/\.\.\/routes\//.test(m2[1]),
    };
  }
  return null;
}

function buildMoveMap() {
  return [
    {
      from: "src/routes/*",
      to: "src/entrypoints/http/routes/*",
      status: "in_progress",
      note: "Replace wrapper re-exports with real route files in entrypoints.",
    },
    {
      from: "src/controllers/*",
      to: "src/entrypoints/http/controllers/*",
      status: "planned",
      note: "Controllers should own request parsing and call module services.",
    },
    {
      from: "src/queues/*",
      to: "src/platform/queue/*",
      status: "planned",
      note: "Single queue infra home.",
    },
    {
      from: "src/workers/*",
      to: "src/entrypoints/workers/*",
      status: "planned",
      note: "Only worker process entrypoints here; no business logic.",
    },
    {
      from: "src/services/chat/*",
      to: "src/modules/chat/{application,runtime,infrastructure}/*",
      status: "in_progress",
      note: "Keep thin compatibility wrappers during migration only.",
    },
    {
      from: "src/services/editing/*",
      to: "src/modules/editing/{application,runtime,engines,infrastructure}/*",
      status: "planned",
      note: "Split revision orchestration from per-domain appliers.",
    },
    {
      from: "src/services/core/banks/*",
      to: "src/banks/loader/*",
      status: "planned",
      note: "Single bank loader package and one injected instance.",
    },
    {
      from: "src/data_banks/*",
      to: "src/banks/data/*",
      status: "planned",
      note: "Unify bank data location after loader migration is complete.",
    },
    {
      from: "src/utils/*",
      to: "src/shared/* or module-owned utils",
      status: "planned",
      note: "Remove junk-drawer utilities; keep ownership explicit.",
    },
  ];
}

function isRuntimeSourceFile(absPath) {
  const rel = normalizeRel(absPath);
  if (RUNTIME_EXCLUDE_PATHS.has(rel)) return false;
  if (!rel.startsWith("src/")) return false;
  if (rel.endsWith(".d.ts")) return false;
  if (rel.includes("/__tests__/")) return false;
  if (rel.startsWith("src/admin/types/")) return false;
  if (rel.startsWith("src/types/")) return false;
  if (rel.includes("/types/")) return false;
  if (rel.endsWith(".types.ts")) return false;
  if (rel.endsWith(".contracts.ts")) return false;
  if (
    rel.includes("/tests/") ||
    rel.endsWith(".test.ts") ||
    rel.endsWith(".test.tsx") ||
    rel.endsWith(".spec.ts") ||
    rel.endsWith(".spec.tsx")
  ) {
    return false;
  }
  if (rel.startsWith("src/data_banks/")) return false;
  if (rel.startsWith("src/analytics/")) return false;
  if (rel.startsWith("src/main/health.ts")) return false;
  if (rel.startsWith("src/jobs/")) return false;
  if (rel.startsWith("src/services/core/certification/")) return false;
  return true;
}

function main() {
  const sourceFiles = listSourceFiles(SRC_ROOT);
  const sourceSet = new Set(sourceFiles.map((f) => path.resolve(f)));

  const seeds = SEED_CANDIDATES.filter((file) => fs.existsSync(file));
  if (seeds.length === 0) {
    throw new Error(
      "No runtime seeds found (expected src/server.ts or src/main/server.ts).",
    );
  }

  const queue = [...seeds];
  const visited = new Set();
  const edges = [];
  const missingLocalRefs = [];

  while (queue.length) {
    const current = queue.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    let code = "";
    try {
      code = fs.readFileSync(current, "utf8");
    } catch {
      continue;
    }

    const specs = parseSpecifiers(code);
    for (const spec of specs) {
      const resolved = resolveLocalImport(current, spec);
      if (resolved) {
        edges.push({
          from: normalizeRel(current),
          specifier: spec,
          to: normalizeRel(resolved),
        });
        if (sourceSet.has(path.resolve(resolved)) && !visited.has(resolved)) {
          queue.push(resolved);
        }
      } else if (spec.startsWith(".")) {
        missingLocalRefs.push({ from: normalizeRel(current), specifier: spec });
      }
    }
  }

  const reachableFiles = [...visited].map((f) => normalizeRel(f)).sort();
  const reachableSet = new Set(reachableFiles);

  const allRel = sourceFiles.map((f) => normalizeRel(f)).sort();
  const unreachableFiles = allRel.filter((rel) => !reachableSet.has(rel));
  const runtimeRel = sourceFiles
    .filter((file) => isRuntimeSourceFile(file))
    .map((file) => normalizeRel(file))
    .sort();
  const runtimeRelSet = new Set(runtimeRel);
  const runtimeReachableFiles = reachableFiles.filter((rel) =>
    runtimeRelSet.has(rel),
  );
  const runtimeUnreachableFiles = runtimeRel.filter(
    (rel) => !reachableSet.has(rel),
  );
  const runtimeCoverage =
    runtimeRel.length > 0
      ? runtimeReachableFiles.length / runtimeRel.length
      : 1;

  const bucketStats = new Map();
  for (const file of sourceFiles) {
    const bucket = topLevelBucket(file);
    if (!bucketStats.has(bucket)) {
      bucketStats.set(bucket, { total: 0, reachable: 0, unreachable: 0 });
    }
    const stats = bucketStats.get(bucket);
    stats.total += 1;
    const rel = normalizeRel(file);
    if (reachableSet.has(rel)) stats.reachable += 1;
    else stats.unreachable += 1;
  }

  const topLevelBuckets = [...bucketStats.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const routeEntryDir = path.join(SRC_ROOT, "entrypoints", "http", "routes");
  const routeWrapperFiles = [];
  if (fs.existsSync(routeEntryDir)) {
    const routeFiles = fs
      .readdirSync(routeEntryDir)
      .map((name) => path.join(routeEntryDir, name))
      .filter(
        (file) => fs.statSync(file).isFile() && /\.(ts|js|mjs|cjs)$/.test(file),
      );
    for (const file of routeFiles) {
      const source = fs.readFileSync(file, "utf8");
      const wrapper = classifyWrapper(file, source);
      if (wrapper) {
        routeWrapperFiles.push({
          file: normalizeRel(file),
          ...wrapper,
        });
      }
    }
  }

  const legacyRouteWrappers = routeWrapperFiles.filter(
    (f) => f.legacyRouteWrapper,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    backendRoot: BACKEND_ROOT,
    seeds: seeds.map(normalizeRel),
    totals: {
      sourceFiles: sourceFiles.length,
      reachableFiles: reachableFiles.length,
      unreachableFiles: unreachableFiles.length,
      edges: edges.length,
      missingLocalRefs: missingLocalRefs.length,
    },
    runtimeTotals: {
      sourceFiles: runtimeRel.length,
      reachableFiles: runtimeReachableFiles.length,
      unreachableFiles: runtimeUnreachableFiles.length,
      coverage: Number(runtimeCoverage.toFixed(4)),
    },
    runtimeUnreachableFiles,
    topLevelBuckets,
    routeWrapperFiles,
    legacyRouteWrappers,
    missingLocalRefs,
    reachableFiles,
    unreachableFiles,
    edges,
    moveMap: buildMoveMap(),
  };

  ensureDir(OUTPUT_DIR);
  const jsonPath = path.join(OUTPUT_DIR, "runtime-import-graph.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdLines = [];
  mdLines.push("# Runtime Import Graph Audit");
  mdLines.push("");
  mdLines.push(`Generated: ${report.generatedAt}`);
  mdLines.push(`Seeds: ${report.seeds.join(", ")}`);
  mdLines.push("");
  mdLines.push("## Totals");
  mdLines.push("");
  mdLines.push(`- Source files: ${report.totals.sourceFiles}`);
  mdLines.push(
    `- Reachable from runtime seeds: ${report.totals.reachableFiles}`,
  );
  mdLines.push(
    `- Unreachable from runtime seeds: ${report.totals.unreachableFiles}`,
  );
  mdLines.push(`- Import edges: ${report.totals.edges}`);
  mdLines.push(`- Missing local refs: ${report.totals.missingLocalRefs}`);
  mdLines.push("");
  mdLines.push("## Runtime Totals (Strict Denominator)");
  mdLines.push("");
  mdLines.push(`- Runtime source files: ${report.runtimeTotals.sourceFiles}`);
  mdLines.push(
    `- Runtime reachable from seeds: ${report.runtimeTotals.reachableFiles}`,
  );
  mdLines.push(
    `- Runtime unreachable from seeds: ${report.runtimeTotals.unreachableFiles}`,
  );
  mdLines.push(
    `- Runtime coverage: ${(report.runtimeTotals.coverage * 100).toFixed(2)}%`,
  );
  mdLines.push("");
  mdLines.push("## Top-Level Bucket Reachability");
  mdLines.push("");
  mdLines.push("| Bucket | Total | Reachable | Unreachable |");
  mdLines.push("|---|---:|---:|---:|");
  for (const row of report.topLevelBuckets) {
    mdLines.push(
      `| ${row.name} | ${row.total} | ${row.reachable} | ${row.unreachable} |`,
    );
  }
  mdLines.push("");
  mdLines.push("## Entrypoint Route Wrapper Status");
  mdLines.push("");
  mdLines.push(`- Wrapper files: ${report.routeWrapperFiles.length}`);
  mdLines.push(
    `- Legacy route wrappers (re-exporting src/routes/*): ${report.legacyRouteWrappers.length}`,
  );
  for (const w of report.legacyRouteWrappers) {
    mdLines.push(`  - ${w.file} -> ${w.target}`);
  }
  mdLines.push("");
  mdLines.push("## Move Map (Draft)");
  mdLines.push("");
  for (const step of report.moveMap) {
    mdLines.push(
      `- [${step.status}] \`${step.from}\` -> \`${step.to}\`: ${step.note}`,
    );
  }

  const mdPath = path.join(OUTPUT_DIR, "runtime-import-graph.md");
  fs.writeFileSync(mdPath, mdLines.join("\n"));

  const mapPath = path.join(OUTPUT_DIR, "backend-refactor-move-map.json");
  fs.writeFileSync(mapPath, JSON.stringify(report.moveMap, null, 2));

  console.log(`[runtime-graph] wrote ${normalizeRel(jsonPath)}`);
  console.log(`[runtime-graph] wrote ${normalizeRel(mdPath)}`);
  console.log(`[runtime-graph] wrote ${normalizeRel(mapPath)}`);
  console.log(
    `[runtime-graph] summary: reachable ${report.totals.reachableFiles}/${report.totals.sourceFiles}, legacy route wrappers ${report.legacyRouteWrappers.length}`,
  );

  if (STRICT_RUNTIME) {
    const failures = [];
    if (report.runtimeTotals.coverage < MIN_RUNTIME_COVERAGE) {
      failures.push(
        `RUNTIME_COVERAGE_BELOW_MIN (${(report.runtimeTotals.coverage * 100).toFixed(2)}% < ${(MIN_RUNTIME_COVERAGE * 100).toFixed(2)}%)`,
      );
    }
    if (report.totals.missingLocalRefs > 0) {
      failures.push(
        `MISSING_LOCAL_REFS_NON_ZERO (${report.totals.missingLocalRefs})`,
      );
    }
    if (report.legacyRouteWrappers.length > 0) {
      failures.push(
        `LEGACY_ROUTE_WRAPPERS_PRESENT (${report.legacyRouteWrappers.length})`,
      );
    }
    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(`[runtime-graph] ${failure}`);
      }
      process.exit(1);
    }
  }
}

main();
