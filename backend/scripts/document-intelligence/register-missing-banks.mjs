#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative, basename } from "path";

const ROOT = "src/data_banks";
const REG_PATH = join(ROOT, "manifest/bank_registry.any.json");

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (entry.name.endsWith(".json") && !entry.name.endsWith(".entities.schema.json")) {
      results.push(full);
    }
  }
  return results;
}

const reg = JSON.parse(readFileSync(REG_PATH, "utf8"));
const registered = new Set(reg.banks.map((b) => b.path));
const registeredIds = new Set(reg.banks.map((b) => b.id));

const allFiles = walk(ROOT)
  .filter((f) => !f.includes("/_deprecated/") && !f.includes("/_quarantine/") && !f.includes("/__"))
  .map((f) => relative(ROOT, f));

const unregistered = allFiles.filter((p) => !registered.has(p));

let added = 0;
for (const p of unregistered) {
  try {
    const data = JSON.parse(readFileSync(join(ROOT, p), "utf8"));
    const id = data?._meta?.id;
    if (!id) { console.log("SKIP (no _meta.id):", p); continue; }
    if (registeredIds.has(id)) { console.log("SKIP (id exists):", id); continue; }

    // Determine category
    let category = "semantics";
    if (p.includes("doc_types/")) category = "semantics";
    else if (p.includes("detection_rules")) category = "routing";
    else if (p.includes("answer_style")) category = "formatting";
    else if (p.includes("evidence_requirements") || p.includes("validation_policies")) category = "quality";
    else if (p.includes("reasoning_scaffolds") || p.includes("disclaimer") || p.includes("redaction")) category = "policies";
    else if (p.includes("retrieval_strategies")) category = "retrieval";
    else if (p.includes("lexicons/")) category = "lexicons";
    else if (p.includes("abbreviations/")) category = "dictionaries";
    else if (p.includes("manifest/")) category = "manifest";
    else if (p.includes("/language/")) category = "normalizers";

    // Determine dependencies
    let dependsOn = [];
    if (p.includes("doc_types/") && !p.includes("doc_type_catalog")) {
      // Find parent doc_type_catalog
      const parentCatalogId = reg.banks.find(
        (b) => b.path.includes(p.split("doc_types")[0] + "doc_types/doc_type_catalog")
      )?.id;
      if (parentCatalogId) dependsOn = [parentCatalogId];
    }

    reg.banks.push({
      id,
      category,
      path: p,
      filename: basename(p),
      version: data?._meta?.version || "1.0.0",
      contentType: "json",
      schemaId: "bank_schema",
      dependsOn,
      enabledByEnv: { production: true, staging: true, dev: true, local: true },
      requiredByEnv: { production: false, staging: false, dev: false, local: false },
      checksumSha256: "",
      lastUpdated: "2026-02-27",
    });
    registeredIds.add(id);
    added++;
    console.log("ADD:", id, "->", p);
  } catch (e) {
    console.log("ERR:", p, e.message);
  }
}

console.log(`\nAdded ${added} banks. Total: ${reg.banks.length}`);
writeFileSync(REG_PATH, JSON.stringify(reg, null, 2) + "\n");
console.log("Written to", REG_PATH);
