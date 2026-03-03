#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";

const BANK_ROOT = new URL("../src/data_banks", import.meta.url).pathname;
const OUT_DIR = join(BANK_ROOT, ".compiled");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".compiled" || entry === "dist" || entry === "_deprecated") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function addHeading(map, heading, sectionId) {
  const key = normalizeText(heading);
  if (!key || !sectionId) return;
  if (!map[key]) map[key] = [];
  if (!map[key].includes(sectionId)) map[key].push(sectionId);
}

function compileSectionHeadingIndex(files) {
  const index = {};
  for (const filePath of files) {
    if (!filePath.includes("headings_map.any.json")) continue;
    const bank = readJson(filePath);
    const entries = Array.isArray(bank?.entries) ? bank.entries : [];
    for (const entry of entries) {
      const sectionId = String(entry?.sectionId || entry?.id || "").trim();
      const headings = Array.isArray(entry?.headings) ? entry.headings : [];
      for (const heading of headings) addHeading(index, heading, sectionId);
    }
  }
  return index;
}

function compileDocTypeSignatureIndex(files) {
  const out = {};
  for (const filePath of files) {
    if (!filePath.includes("doc_taxonomy.any.json")) continue;
    const bank = readJson(filePath);
    const docs = Array.isArray(bank?.docTypes)
      ? bank.docTypes
      : Array.isArray(bank?.types)
        ? bank.types
        : [];
    for (const doc of docs) {
      const docType = String(doc?.id || doc?.docType || "").trim();
      if (!docType) continue;
      const signals = new Set();
      const aliases = Array.isArray(doc?.aliases) ? doc.aliases : [];
      const keywords = Array.isArray(doc?.keywords) ? doc.keywords : [];
      for (const value of [...aliases, ...keywords]) {
        const token = normalizeText(value);
        if (token) signals.add(token);
      }
      out[docType] = Array.from(signals).sort((a, b) => a.localeCompare(b));
    }
  }
  return out;
}

function compileAliasTrie(files) {
  const trie = {};
  for (const filePath of files) {
    if (!filePath.includes("/normalizers/doc_aliases/")) continue;
    const bank = readJson(filePath);
    const aliases = Array.isArray(bank?.aliases) ? bank.aliases : [];
    for (const alias of aliases) {
      const phrase = normalizeText(alias?.phrase || alias?.alias || alias?.name);
      const docType = String(alias?.docType || alias?.docTypeId || "").trim();
      if (!phrase || !docType) continue;
      const parts = phrase.split(" ").filter(Boolean);
      let node = trie;
      for (const part of parts) {
        if (!node[part]) node[part] = {};
        node = node[part];
      }
      if (!Array.isArray(node.$)) node.$ = [];
      if (!node.$.includes(docType)) node.$.push(docType);
    }
  }
  return trie;
}

function compileTableHeaderHashIndex(files) {
  const out = {};
  for (const filePath of files) {
    if (!filePath.includes("table_header_ontology.")) continue;
    const bank = readJson(filePath);
    const entries = Array.isArray(bank?.entries)
      ? bank.entries
      : Array.isArray(bank?.headers)
        ? bank.headers
        : [];
    for (const entry of entries) {
      const header =
        entry?.header || entry?.name || (typeof entry === "string" ? entry : "");
      const normalized = normalizeText(header);
      if (!normalized) continue;
      out[hash(normalized)] = normalized;
    }
  }
  return out;
}

function writeArtifact(name, content) {
  const filePath = join(OUT_DIR, name);
  writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
  return filePath;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = walk(BANK_ROOT);

  const sectionHeadingIndex = compileSectionHeadingIndex(files);
  const docTypeSignatureIndex = compileDocTypeSignatureIndex(files);
  const aliasTrie = compileAliasTrie(files);
  const tableHeaderHashIndex = compileTableHeaderHashIndex(files);

  const outputFiles = [
    writeArtifact("section_heading_index.any.json", sectionHeadingIndex),
    writeArtifact("docType_signature_index.any.json", docTypeSignatureIndex),
    writeArtifact("alias_trie.any.json", aliasTrie),
    writeArtifact("table_header_hash_index.any.json", tableHeaderHashIndex),
  ];

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot: BANK_ROOT,
    artifactCount: outputFiles.length,
    artifacts: outputFiles.map((filePath) => ({
      filePath,
      checksumSha256: hash(readFileSync(filePath, "utf8")),
    })),
  };
  writeArtifact("compiled_manifest.any.json", manifest);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir: OUT_DIR,
        artifacts: outputFiles.length,
      },
      null,
      2,
    ),
  );
}

main();

