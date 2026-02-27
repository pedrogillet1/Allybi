#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const mapPath = path.join(
  dataBanksRoot,
  "semantics",
  "document_intelligence_bank_map.any.json",
);
const todoPath = path.join(repoRoot, "docs", "document-intelligence", "TODO.md");

if (!fs.existsSync(mapPath)) {
  console.error(`[docint:todo] missing map: ${mapPath}`);
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const grouped = map.groupedByArea || {};
const required = Array.isArray(map.requiredCoreBankIds) ? map.requiredCoreBankIds : [];
const optional = Array.isArray(map.optionalBankIds) ? map.optionalBankIds : [];
const domains = Array.isArray(map.domains) ? map.domains : [];
const operators = Array.isArray(map.operators) ? map.operators : [];

const sections = [
  "taxonomy",
  "structure",
  "entities",
  "domain",
  "operators",
  "reasoning",
  "quality",
  "retrieval",
  "marketing",
];

function checkbox(id) {
  return `- [ ] ${id}`;
}

let out = "";
out += "# Document Intelligence Implementation TODO\n\n";
out += "Generated checklist to guarantee all document intelligence banks are created, populated, and wired correctly.\n\n";
out += "## Global Acceptance Gates\n";
out += "- [ ] `npm run docint:scaffold` completes without error\n";
out += "- [ ] `npm run banks:checksum:generate` updates checksums for new banks\n";
out += "- [ ] `npm run docint:verify -- --strict` passes\n";
out += "- [ ] `npm run test:runtime-wiring` passes\n";
out += "- [ ] Startup strict mode (`NODE_ENV=production`) loads all required core banks\n";
out += "- [ ] Retrieval answers include grounded evidence without wrong-doc drift\n\n";

out += "## Domains\n";
for (const d of domains) out += checkbox(`Domain coverage complete: ${d}`) + "\n";
out += "\n";

out += "## Operators\n";
for (const op of operators) out += checkbox(`Operator playbooks reviewed: ${op}`) + "\n";
out += "\n";

for (const section of sections) {
  const ids = Array.isArray(grouped[section]) ? grouped[section] : [];
  out += `## ${section[0].toUpperCase()}${section.slice(1)} Banks\n`;
  if (!ids.length) {
    out += "- [ ] Populate section map\n\n";
    continue;
  }
  for (const id of ids) out += checkbox(id) + "\n";
  out += "\n";
}

out += "## Required Core Banks\n";
for (const id of required) out += checkbox(id) + "\n";
out += "\n";

out += "## Optional Banks\n";
for (const id of optional) out += checkbox(id) + "\n";
out += "\n";

out += "## Wiring Tasks\n";
out += "- [ ] Register all banks in `manifest/bank_registry.any.json`\n";
out += "- [ ] Add dependency nodes in `manifest/bank_dependencies.any.json`\n";
out += "- [ ] Add aliases in `manifest/bank_aliases.any.json`\n";
out += "- [ ] Integrate document intelligence integrity service into bootstrap\n";
out += "- [ ] Ensure runtime integrity includes doc intelligence map as required\n";
out += "- [ ] Add retrieval domain rewrite hook using `query_rewrites_{domain}`\n";
out += "- [ ] Add operator/domain loading adapter for playbooks\n";
out += "- [ ] Wire quality policy readers for source/numeric/wrong-doc/ambiguity\n";
out += "- [ ] Add telemetry for doc-int policy hits and misses\n\n";

out += "## Data Population Tasks\n";
out += "- [ ] Fill finance KPI formulas and synonyms\n";
out += "- [ ] Fill legal clause ontology and risk heuristics\n";
out += "- [ ] Fill medical report ontology and safety boundaries\n";
out += "- [ ] Populate multilingual heading/table header ontologies (EN/PT)\n";
out += "- [ ] Populate entity patterns for IDs, money, dates, parties\n";
out += "- [ ] Add at least 50 high-quality examples per domain/operator playbook\n\n";

out += "## Validation and Certification\n";
out += "- [ ] Add unit tests for document intelligence integrity service\n";
out += "- [ ] Add retrieval tests for domain rewrite behavior\n";
out += "- [ ] Add quality-gate tests for wrong-doc lock and source policy\n";
out += "- [ ] Add finance/legal/medical evaluation sets (100 prompts each)\n";
out += "- [ ] Define pass thresholds for evidence fidelity and safety boundaries\n\n";

out += "## Deployment Readiness\n";
out += "- [ ] Enable feature flag rollout in staging (10% -> 50% -> 100%)\n";
out += "- [ ] Monitor failure reasons by bank id and domain\n";
out += "- [ ] Backfill/reprocess non-AI-usable docs with new policies\n";
out += "- [ ] Publish runbook for doc intelligence bank updates\n";

fs.mkdirSync(path.dirname(todoPath), { recursive: true });
fs.writeFileSync(todoPath, out, "utf8");
console.log(`[docint:todo] wrote ${todoPath}`);
