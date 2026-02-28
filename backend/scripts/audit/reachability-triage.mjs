#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const graphPath = path.resolve(ROOT, "docs/runtime/runtime-import-graph.json");
const outDir = path.resolve(ROOT, "docs/audit");
const outJson = path.join(outDir, "reachability-triage.json");
const outMd = path.join(outDir, "reachability-triage.md");
const INCLUDE_ALL = process.argv.includes("--include-all");

const RUNTIME_EXCLUDE_PATHS = new Set([
  "src/services/chat/guardrails/editorMode.guard.ts",
  "src/services/chat/handlers/editorTurn.handler.ts",
  "src/services/editing/docx/docxValidator.service.ts",
  "src/services/editing/editing.constants.ts",
  "src/services/editing/xlsx/xlsxFileEditor.service.ts",
  "src/services/extraction/ocrSignals.service.ts",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isReexportOnly(filePath) {
  try {
    const src = fs.readFileSync(path.resolve(ROOT, filePath), "utf8");
    const lines = src
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//"));
    if (lines.length === 0) return true;
    return lines.every((line) => /^export\s+(\*|\{)/.test(line));
  } catch {
    return false;
  }
}

function isRuntimePath(relPath) {
  const rel = String(relPath || "");
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

function classify(relPath) {
  if (/\.test\./.test(relPath)) {
    return {
      action: "MOVE",
      reason: "Test-only file under src should not count as runtime debt.",
      owner: "qa-certification",
      milestone: "R2-MOVE",
    };
  }
  if (/^src\/(tests|analytics|jobs|data_banks)\//.test(relPath)) {
    return {
      action: "MOVE",
      reason: "Non-runtime workload should live under scripts/tools or data.",
      owner: "platform-runtime",
      milestone: "R2-MOVE",
    };
  }
  if (/^src\/(app|modules|platform|shared)\//.test(relPath)) {
    if (relPath.endsWith("/index.ts") && isReexportOnly(relPath)) {
      return {
        action: "DELETE",
        reason: "Unreachable barrel wrapper with re-export-only body.",
        owner: "platform-runtime",
        milestone: "R2-DELETE",
      };
    }
    return {
      action: "WIRE",
      reason: "Runtime-layer file should be reachable from server seeds.",
      owner: "platform-runtime",
      milestone: "R2-WIRE",
    };
  }
  if (
    /^src\/(routes|controllers|services|utils|types|workers)\//.test(relPath)
  ) {
    if (relPath.endsWith("/index.ts") && isReexportOnly(relPath)) {
      return {
        action: "DELETE",
        reason: "Legacy wrapper re-export is unreachable and redundant.",
        owner: "legacy-migration",
        milestone: "R2-DELETE",
      };
    }
    return {
      action: "DELETE",
      reason: "Legacy runtime subtree file is unreachable from active seeds.",
      owner: "legacy-migration",
      milestone: "R2-DELETE",
    };
  }
  return {
    action: "MOVE",
    reason: "Unknown bucket: move to non-runtime location or wire explicitly.",
    owner: "platform-runtime",
    milestone: "R2-MOVE",
  };
}

function toBucket(relPath) {
  const parts = relPath.split("/");
  return parts.length > 1 ? parts[1] : "(root)";
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Reachability Triage");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Unreachable files: ${report.summary.totalUnreachable}`);
  lines.push(`- ` + "`WIRE`" + `: ${report.summary.actions.WIRE}`);
  lines.push(`- ` + "`MOVE`" + `: ${report.summary.actions.MOVE}`);
  lines.push(`- ` + "`DELETE`" + `: ${report.summary.actions.DELETE}`);
  lines.push("");
  lines.push("## By Bucket");
  lines.push("");
  lines.push("| Bucket | Unreachable | WIRE | MOVE | DELETE |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const row of report.byBucket) {
    lines.push(
      `| ${row.bucket} | ${row.total} | ${row.WIRE} | ${row.MOVE} | ${row.DELETE} |`,
    );
  }
  lines.push("");
  lines.push("## Detailed Triage");
  lines.push("");
  lines.push("| File | Action | Owner | Milestone | Reason |");
  lines.push("|---|---|---|---|---|");
  for (const item of report.files) {
    lines.push(
      `| ${item.file} | ${item.action} | ${item.owner} | ${item.milestone} | ${item.reason} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(graphPath)) {
    console.error(`[reachability-triage] Missing graph file: ${graphPath}`);
    process.exit(1);
  }
  const graph = readJson(graphPath);
  const allUnreachable = Array.isArray(graph.unreachableFiles)
    ? graph.unreachableFiles
    : [];
  const runtimeUnreachable = Array.isArray(graph.runtimeUnreachableFiles)
    ? graph.runtimeUnreachableFiles
    : allUnreachable.filter((file) => isRuntimePath(file));
  const unreachable = INCLUDE_ALL ? allUnreachable : runtimeUnreachable;

  const files = unreachable.map((file) => {
    const classification = classify(file);
    return {
      file,
      ...classification,
      bucket: toBucket(file),
    };
  });

  const actionCounts = { WIRE: 0, MOVE: 0, DELETE: 0 };
  for (const item of files) actionCounts[item.action] += 1;

  const byBucketMap = new Map();
  for (const item of files) {
    if (!byBucketMap.has(item.bucket)) {
      byBucketMap.set(item.bucket, {
        bucket: item.bucket,
        total: 0,
        WIRE: 0,
        MOVE: 0,
        DELETE: 0,
      });
    }
    const row = byBucketMap.get(item.bucket);
    row.total += 1;
    row[item.action] += 1;
  }
  const byBucket = [...byBucketMap.values()].sort((a, b) =>
    a.bucket.localeCompare(b.bucket),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    source: "docs/runtime/runtime-import-graph.json",
    mode: INCLUDE_ALL ? "all_unreachable" : "runtime_unreachable",
    summary: {
      totalUnreachable: files.length,
      actions: actionCounts,
    },
    byBucket,
    files,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(outMd, `${buildMarkdown(report)}\n`, "utf8");

  console.log(`[reachability-triage] wrote ${path.relative(ROOT, outJson)}`);
  console.log(`[reachability-triage] wrote ${path.relative(ROOT, outMd)}`);
  console.log(
    `[reachability-triage] unreachable=${files.length} wire=${actionCounts.WIRE} move=${actionCounts.MOVE} delete=${actionCounts.DELETE}`,
  );
}

main();
