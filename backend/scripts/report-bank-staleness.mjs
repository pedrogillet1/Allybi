#!/usr/bin/env node

import { readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const BANK_ROOT = new URL("../src/data_banks", import.meta.url).pathname;
const REGISTRY_PATH = join(BANK_ROOT, "manifest/bank_registry.any.json");
const UNUSED_PATH = new URL("unused-banks.json", import.meta.url).pathname;
const OUT_JSON = new URL("../notes/BANK_STALENESS_REPORT.json", import.meta.url)
  .pathname;
const OUT_MD = new URL("../notes/BANK_STALENESS_REPORT.md", import.meta.url)
  .pathname;

function safeReadJson(pathname) {
  try {
    return JSON.parse(readFileSync(pathname, "utf8"));
  } catch {
    return null;
  }
}

function daysSince(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return 365;
  const deltaMs = Date.now() - ts;
  return Math.max(0, Math.floor(deltaMs / 86_400_000));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function main() {
  const registry = safeReadJson(REGISTRY_PATH);
  if (!registry || !Array.isArray(registry.banks)) {
    throw new Error(`Invalid registry at ${REGISTRY_PATH}`);
  }
  const unusedManifest = safeReadJson(UNUSED_PATH);
  const unusedSet = new Set(
    Array.isArray(unusedManifest?.unusedBanks)
      ? unusedManifest.unusedBanks.map((row) => String(row?.id || "").trim())
      : [],
  );

  const rows = [];
  for (const bank of registry.banks) {
    const id = String(bank?.id || "").trim();
    const path = String(bank?.path || "").trim();
    if (!id || !path) continue;
    const fullPath = join(BANK_ROOT, path);
    let bytes = 0;
    try {
      bytes = statSync(fullPath).size;
    } catch {
      bytes = 0;
    }

    const ageDays = daysSince(bank?.lastUpdated);
    const ageScore = clamp(ageDays / 365, 0, 1);
    const sizeScore = clamp(bytes / (300 * 1024), 0, 1); // 300KB ~= high-cost bank
    const unusedScore = unusedSet.has(id) ? 1 : 0;
    const requiredPenalty = bank?.requiredByEnv?.production ? -0.15 : 0;

    const score = clamp(
      ageScore * 0.45 + sizeScore * 0.35 + unusedScore * 0.3 + requiredPenalty,
      0,
      1,
    );
    rows.push({
      id,
      path,
      category: String(bank?.category || "").trim(),
      lastUpdated: String(bank?.lastUpdated || "").trim(),
      bytes,
      ageDays,
      unused: unusedSet.has(id),
      stalenessScore: Number(score.toFixed(4)),
    });
  }

  rows.sort((a, b) => b.stalenessScore - a.stalenessScore);
  const top20 = rows.slice(0, 20);
  const report = {
    generatedAt: new Date().toISOString(),
    totalBanks: rows.length,
    top20,
  };
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

  const lines = [];
  lines.push("# Bank Staleness Report");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Total banks scored: ${report.totalBanks}`);
  lines.push("");
  lines.push("## Top 20 banks to refresh");
  lines.push("");
  lines.push("| Rank | Bank ID | Category | Score | Age (days) | Size (KB) | Unused |");
  lines.push("|---:|---|---|---:|---:|---:|---:|");
  top20.forEach((row, idx) => {
    lines.push(
      `| ${idx + 1} | \`${row.id}\` | ${row.category} | ${row.stalenessScore.toFixed(3)} | ${row.ageDays} | ${(row.bytes / 1024).toFixed(1)} | ${row.unused ? "yes" : "no"} |`,
    );
  });
  lines.push("");
  writeFileSync(OUT_MD, lines.join("\n") + "\n");

  console.log(
    JSON.stringify(
      {
        ok: true,
        outJson: OUT_JSON,
        outMarkdown: OUT_MD,
      },
      null,
      2,
    ),
  );
}

main();

