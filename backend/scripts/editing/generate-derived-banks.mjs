#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../src/data_banks");
const operatorCatalogPath = path.join(ROOT, "parsers/operator_catalog.any.json");
const capabilitiesPath = path.join(ROOT, "semantics/allybi_capabilities.any.json");
const docxOperatorsPath = path.join(ROOT, "operators/allybi_docx_operators.any.json");
const xlsxOperatorsPath = path.join(ROOT, "operators/allybi_xlsx_operators.any.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mapDomainToFiletype(domain) {
  if (String(domain || "").toLowerCase() === "docx") return "docx";
  if (String(domain || "").toLowerCase() === "excel") return "xlsx";
  return "unknown";
}

function derive() {
  const operatorCatalog = readJson(operatorCatalogPath);
  const operators = operatorCatalog?.operators && typeof operatorCatalog.operators === "object"
    ? operatorCatalog.operators
    : {};

  const capabilityOperators = {};
  const docxOperators = {};
  const xlsxOperators = {};

  for (const [operatorId, entry] of Object.entries(operators)) {
    const domain = String(entry?.domain || "").toLowerCase();
    const runtimeOperator = String(entry?.runtimeOperator || "").trim();
    const previewType = String(entry?.previewType || entry?.diffType || "text_diff").trim();
    const requiresConfirm = Boolean(entry?.confirmationPolicy?.requiresExplicitConfirm);
    const filetype = mapDomainToFiletype(domain);

    capabilityOperators[operatorId] = {
      supported: true,
      filetype,
      runtimeOperator,
      engine: String(entry?.engine || "local"),
      renderCard: previewType,
      ...(requiresConfirm ? { requiresConfirmation: true } : {}),
    };

    if (domain === "docx") docxOperators[operatorId] = entry;
    if (domain === "excel") xlsxOperators[operatorId] = entry;
  }

  const alwaysConfirmOperators = Object.entries(operators)
    .filter(([, entry]) => Boolean(entry?.confirmationPolicy?.requiresExplicitConfirm))
    .map(([id]) => id);

  const capabilities = {
    _meta: {
      id: "allybi_capabilities",
      version: "derived-ssot-1",
      description: "Derived from operator_catalog.any.json. Do not hand edit.",
      languages: ["any"],
      lastUpdated: new Date().toISOString().slice(0, 10),
      owner: "allybi-editing",
      generatedFrom: "parsers/operator_catalog.any.json",
    },
    config: {
      enabled: true,
      previewApplyUndoRequired: true,
      selectionFirst: true,
    },
    operators: capabilityOperators,
    alwaysConfirmOperators,
  };

  return {
    capabilities,
    docxOperators: {
      _meta: {
        id: "allybi_docx_operators",
        version: "derived-ssot-1",
        description: "Derived compatibility view from operator_catalog.any.json (DOCX).",
        languages: ["any"],
      },
      operators: docxOperators,
    },
    xlsxOperators: {
      _meta: {
        id: "allybi_xlsx_operators",
        version: "derived-ssot-1",
        description: "Derived compatibility view from operator_catalog.any.json (XLSX).",
        languages: ["any"],
      },
      operators: xlsxOperators,
    },
  };
}

function main() {
  const write = process.argv.includes("--write");
  const out = derive();
  if (!write) {
    console.log("Derived banks generated in-memory.");
    console.log(`Capabilities operators: ${Object.keys(out.capabilities.operators).length}`);
    console.log("Run with --write to persist derived files.");
    return;
  }
  writeJson(capabilitiesPath, out.capabilities);
  writeJson(docxOperatorsPath, out.docxOperators);
  writeJson(xlsxOperatorsPath, out.xlsxOperators);
  console.log(`Wrote ${path.relative(process.cwd(), capabilitiesPath)}`);
  console.log(`Wrote ${path.relative(process.cwd(), docxOperatorsPath)}`);
  console.log(`Wrote ${path.relative(process.cwd(), xlsxOperatorsPath)}`);
}

main();
