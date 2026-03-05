#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const policyPath = path.resolve(__dirname, "model-governance-policy.json");
const strictAuditPath = path.resolve(__dirname, "model-governance-strict.mjs");
const providerCapsPath = path.resolve(
  repoRoot,
  "backend/src/data_banks/llm/provider_capabilities.any.json",
);
const providerFallbacksPath = path.resolve(
  repoRoot,
  "backend/src/data_banks/llm/provider_fallbacks.any.json",
);
const lanePolicyPath = path.resolve(
  repoRoot,
  "backend/src/data_banks/llm/composition_lane_policy.any.json",
);
const costTablePath = path.resolve(
  repoRoot,
  "backend/src/data_banks/llm/llm_cost_table.any.json",
);
const openaiConfigPath = path.resolve(
  repoRoot,
  "backend/src/services/llm/providers/openai/openaiConfig.ts",
);
const geminiConfigPath = path.resolve(
  repoRoot,
  "backend/src/services/llm/providers/gemini/geminiConfig.ts",
);
const routerPath = path.resolve(
  repoRoot,
  "backend/src/services/llm/core/llmRouter.service.ts",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function toFamily(model) {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return normalized;
  return normalized
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{3,4}$/, "")
    .replace(/-(latest|exp)$/, "");
}

const policy = readJson(policyPath);
const allowedFamilies = new Set(
  (Array.isArray(policy.allowedModelFamilies) ? policy.allowedModelFamilies : [])
    .map((entry) => toFamily(entry?.family))
    .filter(Boolean),
);

const failures = [];
const notes = [];

function assertAllowed(model, context) {
  const family = toFamily(model);
  if (!allowedFamilies.has(family)) {
    failures.push(`${context}:unsupported_family:${family || "empty"}`);
  }
}

const caps = readJson(providerCapsPath);
assertAllowed(caps?.defaults?.draft?.model, "provider_capabilities.defaults.draft");
assertAllowed(caps?.defaults?.final?.model, "provider_capabilities.defaults.final");
for (const [providerId, providerCfg] of Object.entries(caps?.providers || {})) {
  for (const [modelId, modelCfg] of Object.entries(providerCfg?.models || {})) {
    assertAllowed(modelId, `provider_capabilities.providers.${providerId}.models`);
    assertAllowed(
      modelCfg?.pinnedVersion || modelId,
      `provider_capabilities.providers.${providerId}.models.${modelId}.pinnedVersion`,
    );
  }
}

const fallbacks = readJson(providerFallbacksPath);
for (const [idx, rule] of (fallbacks?.fallbacks || []).entries()) {
  for (const target of rule?.try || []) {
    assertAllowed(target?.model, `provider_fallbacks.fallbacks[${idx}].try`);
  }
}

const lanes = readJson(lanePolicyPath);
for (const [idx, lane] of (lanes?.lanes || []).entries()) {
  assertAllowed(lane?.route?.model, `composition_lane_policy.lanes[${idx}].route.model`);
  if (lane?.route?.modelFamily) {
    assertAllowed(
      lane.route.modelFamily,
      `composition_lane_policy.lanes[${idx}].route.modelFamily`,
    );
  }
}

const costTable = readJson(costTablePath);
for (const key of Object.keys(costTable?.models || {})) {
  const [, modelPart] = String(key || "").split(":", 2);
  if (modelPart === "*") continue;
  assertAllowed(modelPart, `llm_cost_table.models.${key}`);
}

const strictAuditText = readText(strictAuditPath);
if (!strictAuditText.includes("model-governance-policy.json")) {
  failures.push("model_governance_strict:policy_not_loaded");
}
if (!strictAuditText.includes("model-governance-perimeter.json")) {
  failures.push("model_governance_strict:perimeter_not_loaded");
}

const openaiConfigText = readText(openaiConfigPath);
if (!openaiConfigText.includes("OPENAI_STRICT_ALLOWLIST must remain enabled")) {
  failures.push("openai_config:missing_strict_allowlist_guard");
}
const geminiConfigText = readText(geminiConfigPath);
if (!geminiConfigText.includes("GEMINI_STRICT_ALLOWLIST must remain enabled")) {
  failures.push("gemini_config:missing_strict_allowlist_guard");
}

const routerText = readText(routerPath);
for (const family of allowedFamilies) {
  if (!routerText.includes(family)) {
    failures.push(`llm_router:missing_family_guard:${family}`);
  }
}
const routeFamilyMatches = routerText.match(/family === "([^"]+)"/g) || [];
for (const expr of routeFamilyMatches) {
  const family = toFamily(expr.replace(/.*"([^"]+)".*/, "$1"));
  if (family && !allowedFamilies.has(family)) {
    failures.push(`llm_router:unexpected_family_guard:${family}`);
  }
}

notes.push(`allowed_families=${Array.from(allowedFamilies).join(",")}`);
notes.push(`checked_paths=7`);

if (failures.length > 0) {
  console.error("[audit:models:consistency] FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[audit:models:consistency] PASS");
for (const note of notes) console.log(`- ${note}`);
