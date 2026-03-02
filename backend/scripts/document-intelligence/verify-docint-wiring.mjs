#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const strict = process.argv.includes("--strict");

const paths = {
  map: path.join(dataBanksRoot, "semantics", "document_intelligence_bank_map.any.json"),
  registry: path.join(dataBanksRoot, "manifest", "bank_registry.any.json"),
  deps: path.join(dataBanksRoot, "manifest", "bank_dependencies.any.json"),
  aliases: path.join(dataBanksRoot, "manifest", "bank_aliases.any.json"),
  usage: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "usage_manifest.any.json",
  ),
  orphan: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "orphan_allowlist.any.json",
  ),
  schemaRegistry: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "bank_schema_registry.any.json",
  ),
  runtimeGates: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "runtime_wiring_gates.any.json",
  ),
  dependencyGraph: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "dependency_graph.any.json",
  ),
  report: path.join(
    dataBanksRoot,
    "document_intelligence",
    "__implementation_report.any.json",
  ),
};

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeAliasKey(value, config) {
  let out = String(value || "").trim();
  if (config?.collapseWhitespace !== false) {
    out = out.replace(/\s+/g, " ");
  }
  if (config?.stripDiacritics) {
    out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (!config?.caseSensitive) {
    out = out.toLowerCase();
  }
  return out;
}

function getByPath(value, pathExpr) {
  const parts = String(pathExpr || "").split(".").filter(Boolean);
  let cur = value;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function hasMeaningfulContent(bank) {
  if (!bank || typeof bank !== "object") return false;
  const keys = Object.keys(bank).filter(
    (key) => !["_meta", "config", "tests"].includes(key),
  );
  for (const key of keys) {
    const value = bank[key];
    if (Array.isArray(value) && value.length > 0) return true;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      return true;
    }
  }
  return false;
}

function extractSchema(schemaBank) {
  if (!schemaBank || typeof schemaBank !== "object") return null;
  if (schemaBank.schema && typeof schemaBank.schema === "object") return schemaBank.schema;
  if (
    schemaBank.action &&
    schemaBank.action.schema &&
    typeof schemaBank.action.schema === "object"
  ) {
    return schemaBank.action.schema;
  }
  if (
    schemaBank.config &&
    schemaBank.config.schema &&
    typeof schemaBank.config.schema === "object"
  ) {
    return schemaBank.config.schema;
  }
  if (schemaBank.$schema || schemaBank.type || schemaBank.properties) {
    const { _meta, config, tests, ...candidate } = schemaBank;
    void _meta;
    void config;
    void tests;
    if (candidate && (candidate.$schema || candidate.type || candidate.properties)) {
      return candidate;
    }
  }
  return null;
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toInstancePath(pathSegments) {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) return "";
  return "/" + pathSegments.join("/");
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveLocalRef(rootSchema, ref) {
  if (typeof ref !== "string") return null;
  if (ref === "#") return rootSchema;
  if (!ref.startsWith("#/")) return null;
  const parts = ref
    .slice(2)
    .split("/")
    .map((part) => decodeURIComponent(part.replace(/~1/g, "/").replace(/~0/g, "~")));
  let cur = rootSchema;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[part];
  }
  return cur || null;
}

function matchesSchemaType(expectedType, value) {
  switch (expectedType) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
      return typeof value === "string";
    case "array":
      return Array.isArray(value);
    case "object":
      return isPlainObject(value);
    default:
      return true;
  }
}

function validateFallbackSchema(schema, value, ctx, pathSegments = []) {
  if (!isPlainObject(schema)) return true;
  const errors = ctx.errors;

  if (typeof schema.$ref === "string") {
    const target = resolveLocalRef(ctx.rootSchema, schema.$ref);
    if (!target) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `unresolved $ref: ${schema.$ref}`,
      });
      return false;
    }
    return validateFallbackSchema(target, value, ctx, pathSegments);
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      validateFallbackSchema(sub, value, ctx, pathSegments);
    }
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    let anyOk = false;
    for (const sub of schema.anyOf) {
      const branchErrors = [];
      validateFallbackSchema(sub, value, { ...ctx, errors: branchErrors }, pathSegments);
      if (branchErrors.length === 0) {
        anyOk = true;
        break;
      }
    }
    if (!anyOk) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: "must satisfy at least one schema in anyOf",
      });
      return false;
    }
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    let matchCount = 0;
    for (const sub of schema.oneOf) {
      const branchErrors = [];
      validateFallbackSchema(sub, value, { ...ctx, errors: branchErrors }, pathSegments);
      if (branchErrors.length === 0) matchCount += 1;
    }
    if (matchCount !== 1) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: "must satisfy exactly one schema in oneOf",
      });
      return false;
    }
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push({
      instancePath: toInstancePath(pathSegments),
      message: "must equal const value",
    });
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const inEnum = schema.enum.some((candidate) => deepEqual(candidate, value));
    if (!inEnum) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: "must be one of enum values",
      });
    }
  }

  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const typeOk = allowedTypes.some((type) => matchesSchemaType(type, value));
    if (!typeOk) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `must be ${allowedTypes.join(" or ")}`,
      });
      return false;
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `must NOT have fewer than ${schema.minLength} characters`,
      });
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `must NOT have more than ${schema.maxLength} characters`,
      });
    }
    if (typeof schema.pattern === "string") {
      try {
        const re = new RegExp(schema.pattern);
        if (!re.test(value)) {
          errors.push({
            instancePath: toInstancePath(pathSegments),
            message: `must match pattern ${schema.pattern}`,
          });
        }
      } catch {
        // Ignore invalid fallback regex patterns; AJV handles these strictly when available.
      }
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `must be >= ${schema.minimum}`,
      });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `must be <= ${schema.maximum}`,
      });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `must NOT have fewer than ${schema.minItems} items`,
      });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push({
        instancePath: toInstancePath(pathSegments),
        message: `must NOT have more than ${schema.maxItems} items`,
      });
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push({
            instancePath: toInstancePath(pathSegments),
            message: "must NOT have duplicate items",
          });
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        for (let i = 0; i < schema.items.length && i < value.length; i++) {
          validateFallbackSchema(schema.items[i], value[i], ctx, [...pathSegments, String(i)]);
        }
      } else {
        for (let i = 0; i < value.length; i++) {
          validateFallbackSchema(schema.items, value[i], ctx, [...pathSegments, String(i)]);
        }
      }
    }
  }

  if (isPlainObject(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const reqKey of required) {
      if (!(reqKey in value)) {
        errors.push({
          instancePath: toInstancePath(pathSegments),
          message: `must have required property '${reqKey}'`,
        });
      }
    }

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in value) {
        validateFallbackSchema(propSchema, value[key], ctx, [...pathSegments, key]);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push({
            instancePath: toInstancePath([...pathSegments, key]),
            message: "must NOT have additional properties",
          });
        }
      }
    } else if (isPlainObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          validateFallbackSchema(
            schema.additionalProperties,
            value[key],
            ctx,
            [...pathSegments, key],
          );
        }
      }
    }
  }

  return errors.length === 0;
}

function createFallbackSchemaValidator(schemaObj) {
  const validator = (value) => {
    const errors = [];
    validateFallbackSchema(schemaObj, value, { rootSchema: schemaObj, errors }, []);
    validator.errors = errors;
    return errors.length === 0;
  };
  validator.errors = [];
  return validator;
}

function compileSchemaValidators(registry) {
  let Ajv;
  let usingFallback = false;
  try {
    Ajv = require("ajv");
  } catch {
    usingFallback = true;
  }

  let ajv = null;
  if (!usingFallback) {
    ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    try {
      const addFormats = require("ajv-formats");
      if (typeof addFormats === "function") {
        addFormats(ajv);
      }
    } catch {
      // Optional dependency; schema checks still run without format helpers.
    }
  }

  const validators = new Map();
  const schemaEntries = (registry.banks || []).filter(
    (entry) => entry.category === "schemas" || String(entry.id || "").endsWith("_schema"),
  );

  for (const entry of schemaEntries) {
    const relPath = String(entry.path || "").trim();
    if (!relPath) continue;
    const fullPath = path.join(dataBanksRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const schemaBank = readJson(fullPath);
    const schemaObj = extractSchema(schemaBank);
    if (!schemaObj || typeof schemaObj !== "object") continue;
    try {
      if (usingFallback) {
        validators.set(entry.id, createFallbackSchemaValidator(schemaObj));
      } else {
        const schemaForAjv =
          schemaObj && typeof schemaObj === "object" ? { ...schemaObj } : schemaObj;
        if (
          schemaForAjv &&
          typeof schemaForAjv === "object" &&
          typeof schemaForAjv.$schema === "string" &&
          schemaForAjv.$schema.includes("json-schema.org/draft/2020-12")
        ) {
          delete schemaForAjv.$schema;
        }
        validators.set(entry.id, ajv.compile(schemaForAjv));
      }
    } catch (err) {
      fail(`Schema compile failed for ${entry.id}: ${err?.message || err}`);
    }
  }

  return { available: true, validators };
}

for (const filePath of Object.values(paths).filter((value) => value !== paths.report)) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}`);
  }
}

let mapBank = null;
let registry = null;
let deps = null;
let aliases = null;
let usageManifest = null;
let orphanAllowlist = null;
let schemaRegistry = null;
let runtimeGates = null;
let dependencyGraph = null;

if (failures.length === 0) {
  try {
    mapBank = readJson(paths.map);
    registry = readJson(paths.registry);
    deps = readJson(paths.deps);
    aliases = readJson(paths.aliases);
    usageManifest = readJson(paths.usage);
    orphanAllowlist = readJson(paths.orphan);
    schemaRegistry = readJson(paths.schemaRegistry);
    runtimeGates = readJson(paths.runtimeGates);
    dependencyGraph = readJson(paths.dependencyGraph);
  } catch (err) {
    fail(`Failed to parse one or more manifests: ${err?.message || err}`);
  }
}

const idsRequiredCore = toList(mapBank?.requiredCoreBankIds);
const idsOptional = toList(mapBank?.optionalBankIds);
const idsToCheck = [...idsRequiredCore, ...idsOptional];
const infraIds = [
  "document_intelligence_manifest_schema",
  "document_intelligence_schema_registry",
  "document_intelligence_dependency_graph",
  "document_intelligence_usage_manifest",
  "document_intelligence_orphan_allowlist",
  "document_intelligence_runtime_wiring_gates",
];
const allValidationIds = [...new Set([...idsToCheck, ...infraIds, "document_intelligence_bank_map"])];

const registryById = new Map((registry?.banks || []).map((entry) => [String(entry.id), entry]));
const depsById = new Map((deps?.banks || []).map((entry) => [String(entry.id), entry]));
const { available: schemaValidationAvailable, validators } = registry
  ? compileSchemaValidators(registry)
  : { available: false, validators: new Map() };

if (idsRequiredCore.length === 0) fail("Map has empty requiredCoreBankIds");
if (toList(mapBank?.domains).length === 0) fail("Map has empty domains array");
if (toList(mapBank?.operators).length === 0) fail("Map has empty operators array");
if (!Array.isArray(runtimeGates?.gates) || runtimeGates.gates.length === 0) {
  fail("runtime_wiring_gates has empty gates array");
}
if (!Array.isArray(usageManifest?.runtimeConsumers) || usageManifest.runtimeConsumers.length === 0) {
  fail("usage_manifest has empty runtimeConsumers array");
}
if (!Array.isArray(schemaRegistry?.schemaFamilies) || schemaRegistry.schemaFamilies.length === 0) {
  fail("schema_registry has empty schemaFamilies array");
}
if (!Array.isArray(dependencyGraph?.banks) || dependencyGraph.banks.length === 0) {
  fail("dependency_graph has empty banks array");
}

const aliasConfig = aliases?.config || {};
const aliasEntries = Array.isArray(aliases?.aliases)
  ? aliases.aliases
      .map((entry) => ({
        alias: String(entry?.alias || "").trim(),
        canonicalId: String(entry?.canonicalId || "").trim(),
      }))
      .filter((entry) => entry.alias && entry.canonicalId)
  : Object.entries(aliases?.aliases || {})
      .map(([alias, canonicalId]) => ({
        alias: String(alias || "").trim(),
        canonicalId: String(canonicalId || "").trim(),
      }))
      .filter((entry) => entry.alias && entry.canonicalId);

const aliasMap = new Map(aliasEntries.map((entry) => [entry.alias, entry.canonicalId]));
const normalizedAliasMap = new Map();
for (const entry of aliasEntries) {
  const key = normalizeAliasKey(entry.alias, aliasConfig);
  const existing = normalizedAliasMap.get(key);
  if (existing && existing !== entry.canonicalId) {
    fail(`Alias collision: ${entry.alias} maps to ${existing} and ${entry.canonicalId}`);
  } else {
    normalizedAliasMap.set(key, entry.canonicalId);
  }
}

function resolveAlias(alias) {
  let current = String(alias || "").trim();
  const seen = new Set();
  for (let i = 0; i < 16; i++) {
    if (!current) return null;
    const normalized = normalizeAliasKey(current, aliasConfig);
    if (seen.has(normalized)) return null;
    seen.add(normalized);

    const next = aliasMap.get(current) || normalizedAliasMap.get(normalized);
    if (!next) {
      if (registryById.has(current)) return current;
      return null;
    }
    if (next === current) return current;
    current = String(next || "").trim();
  }
  return null;
}

const parsedBanks = new Map();
let schemaValidatedCount = 0;
const schemaErrors = [];

for (const id of allValidationIds) {
  const entry = registryById.get(id);
  if (!entry) {
    fail(`Missing registry entry for bank id=${id}`);
    continue;
  }

  const relPath = String(entry.path || "").trim();
  const fullPath = path.join(dataBanksRoot, relPath);
  if (!relPath || !fs.existsSync(fullPath)) {
    fail(`Missing bank file for id=${id} path=${relPath}`);
    continue;
  }

  let parsed;
  try {
    parsed = readJson(fullPath);
  } catch (err) {
    fail(`Invalid JSON for id=${id} file=${relPath}: ${err?.message || err}`);
    continue;
  }

  const metaId = String(parsed?._meta?.id || "").trim();
  if (metaId !== id) {
    fail(`Bank id mismatch: registry=${id} meta.id=${metaId} file=${relPath}`);
  }

  parsedBanks.set(id, parsed);

  const schemaId = String(entry.schemaId || "").trim();
  if (schemaId && schemaValidationAvailable) {
    const validator = validators.get(schemaId);
    if (!validator) {
      fail(`Missing schema validator for id=${id} schemaId=${schemaId}`);
    } else {
      const ok = validator(parsed);
      if (!ok) {
        schemaErrors.push({
          id,
          schemaId,
          errors: (validator.errors || []).slice(0, 5),
        });
      } else {
        schemaValidatedCount += 1;
      }
    }
  }

  if (!depsById.has(id)) {
    fail(`Missing dependency node for id=${id} in bank_dependencies`);
  }

  const resolvedSelfAlias = resolveAlias(id);
  if (resolvedSelfAlias !== id) {
    fail(`Missing self-alias or dangling alias chain for id=${id}`);
  }
}

for (const err of schemaErrors) {
  fail(
    `Schema validation failed for ${err.id} against ${err.schemaId}: ${JSON.stringify(err.errors)}`,
  );
}

for (const id of idsRequiredCore) {
  const entry = registryById.get(id);
  const requiredByEnv = entry?.requiredByEnv || {};
  const requiredAll =
    requiredByEnv.production === true &&
    requiredByEnv.staging === true &&
    requiredByEnv.dev === true &&
    requiredByEnv.local === true;
  if (!requiredAll) {
    fail(`Required core bank not required in all envs: id=${id}`);
  }
}

const criticalRules = [
  {
    match: (id) => /^operator_playbook_/.test(id),
    keys: ["lookFor", "validationChecks", "askQuestionWhen", "outputStructure.requiredBlocks"],
  },
  { match: (id) => /^query_rewrites_/.test(id), keys: ["rules"] },
  { match: (id) => /^boost_rules_/.test(id), keys: ["rules"] },
  { match: (id) => /^section_priority_/.test(id), keys: ["priorities"] },
  { match: (id) => /^doc_aliases_/.test(id), keys: ["aliases"] },
  { match: (id) => /^doc_archetypes_/.test(id), keys: ["archetypes"] },
  { match: (id) => /^table_header_ontology_/.test(id), keys: ["headers"] },
  { match: (id) => /^keyword_taxonomy_/.test(id), keys: ["clusters"] },
  { match: (id) => /^pain_points_/.test(id), keys: ["signals"] },
  {
    match: (id) =>
      [
        "headings_map",
        "sheetname_patterns",
        "layout_cues",
        "money_patterns",
        "date_patterns",
        "party_patterns",
        "identifier_patterns",
        "numeric_integrity",
        "wrong_doc_lock",
        "source_policy",
        "ambiguity_questions",
      ].includes(id),
    keys: {
      headings_map: ["headings"],
      sheetname_patterns: ["patterns"],
      layout_cues: ["cues"],
      money_patterns: ["rules"],
      date_patterns: ["rules"],
      party_patterns: ["rules"],
      identifier_patterns: ["rules"],
      numeric_integrity: ["rules"],
      wrong_doc_lock: ["rules"],
      source_policy: ["rules"],
      ambiguity_questions: ["questions"],
    },
  },
];

for (const id of idsRequiredCore) {
  const bank = parsedBanks.get(id);
  if (!bank) continue;

  let checked = false;
  for (const rule of criticalRules) {
    if (!rule.match(id)) continue;
    const keyPaths = Array.isArray(rule.keys) ? rule.keys : rule.keys[id] || [];
    for (const keyPath of keyPaths) {
      checked = true;
      const value = getByPath(bank, keyPath);
      if (!Array.isArray(value)) {
        if (id === "ambiguity_questions") {
          const fallbackRules = getByPath(bank, "rules");
          if (Array.isArray(fallbackRules) && fallbackRules.length > 0) {
            continue;
          }
        }
        fail(`Critical array missing for ${id}: ${keyPath}`);
      } else if (value.length === 0) {
        fail(`Critical array empty for ${id}: ${keyPath}`);
      }
    }
  }

  if (!checked && !hasMeaningfulContent(bank)) {
    fail(`Critical bank has no meaningful content payload: ${id}`);
  }
}

const consumedIds = new Set(toList(usageManifest?.consumedBankIds));
const consumedPrefixes = toList(usageManifest?.consumedIdPrefixes);
const consumedPatterns = toList(usageManifest?.consumedIdPatterns)
  .map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch {
      fail(`Invalid consumedIdPattern regex: ${pattern}`);
      return null;
    }
  })
  .filter((pattern) => pattern != null);

const allowlistedIds = new Set(toList(orphanAllowlist?.allowlistedBankIds));
const allowlistedPrefixes = toList(orphanAllowlist?.allowlistedIdPrefixes);
const allowlistedPatterns = toList(orphanAllowlist?.allowlistedIdPatterns)
  .map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch {
      fail(`Invalid allowlistedIdPattern regex: ${pattern}`);
      return null;
    }
  })
  .filter((pattern) => pattern != null);

const isConsumed = (id) =>
  consumedIds.has(id) ||
  consumedPrefixes.some((prefix) => id.startsWith(prefix)) ||
  consumedPatterns.some((pattern) => pattern.test(id));

const isAllowlisted = (id) =>
  allowlistedIds.has(id) ||
  allowlistedPrefixes.some((prefix) => id.startsWith(prefix)) ||
  allowlistedPatterns.some((pattern) => pattern.test(id));

const orphanIds = idsToCheck.filter((id) => !isConsumed(id) && !isAllowlisted(id));
if (orphanIds.length > 0) {
  fail(`Orphan document-intelligence banks detected: ${orphanIds.join(", ")}`);
}

for (const consumer of Array.isArray(usageManifest?.runtimeConsumers)
  ? usageManifest.runtimeConsumers
  : []) {
  const relPath = String(consumer?.path || "").trim();
  if (!relPath) {
    fail(`usage_manifest runtime consumer has empty path: ${JSON.stringify(consumer)}`);
    continue;
  }
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    fail(`usage_manifest runtime consumer path missing: ${relPath}`);
  }
}

for (const gate of Array.isArray(runtimeGates?.gates) ? runtimeGates.gates : []) {
  for (const id of toList(gate?.requiredBanks)) {
    if (!registryById.has(id)) {
      fail(`runtime_wiring_gates required bank missing in registry: ${id}`);
    }
  }
  for (const relPath of toList(gate?.proofTests)) {
    const fullPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      fail(`runtime_wiring_gates proof test missing on disk: ${relPath}`);
    }
  }
}

const dependencyNodes = new Map(
  (dependencyGraph?.banks || [])
    .map((node) => ({
      id: String(node?.id || "").trim(),
      dependsOn: toList(node?.dependsOn),
    }))
    .filter((node) => node.id)
    .map((node) => [node.id, node]),
);

const visiting = new Set();
const visited = new Set();
let dependencyCycle = null;

function visitDependencyNode(id, stack) {
  if (dependencyCycle || visited.has(id)) return;
  if (visiting.has(id)) {
    dependencyCycle = [...stack, id].join(" -> ");
    return;
  }

  visiting.add(id);
  const node = dependencyNodes.get(id);
  for (const dep of node?.dependsOn || []) {
    if (!dependencyNodes.has(dep) && !registryById.has(dep)) {
      fail(`dependency_graph missing declared dependency node: ${id} -> ${dep}`);
      continue;
    }
    if (dependencyNodes.has(dep)) {
      visitDependencyNode(dep, [...stack, id]);
    }
  }
  visiting.delete(id);
  visited.add(id);
}

for (const id of dependencyNodes.keys()) {
  visitDependencyNode(id, []);
}
if (dependencyCycle) {
  fail(`dependency_graph cycle detected: ${dependencyCycle}`);
}

for (const assignment of Array.isArray(schemaRegistry?.schemaAssignments)
  ? schemaRegistry.schemaAssignments
  : []) {
  const bankId = String(assignment?.bankId || "").trim();
  const schemaId = String(assignment?.schemaId || "").trim();
  if (!bankId || !schemaId) continue;

  const bankEntry = registryById.get(bankId);
  if (!bankEntry) {
    fail(`schema_registry references missing bank id: ${bankId}`);
    continue;
  }

  const actualSchemaId = String(bankEntry.schemaId || "").trim();
  if (actualSchemaId !== schemaId) {
    fail(
      `schema_registry mismatch for ${bankId}: expected ${schemaId}, registry has ${actualSchemaId || "<empty>"}`,
    );
  }

  if (!registryById.has(schemaId)) {
    fail(`schema_registry references unknown schema id: ${schemaId}`);
  }
}

const groupedByArea = mapBank?.groupedByArea || {};
const coverageByFamily = {};
for (const [family, values] of Object.entries(groupedByArea)) {
  const ids = toList(values);
  let loaded = 0;
  for (const id of ids) {
    if (parsedBanks.has(id)) loaded += 1;
  }
  coverageByFamily[family] = {
    expected: ids.length,
    loaded,
    coverage: ids.length > 0 ? Number((loaded / ids.length).toFixed(4)) : 1,
  };
}

const loadedBankCount = allValidationIds.filter((id) => parsedBanks.has(id)).length;
const checkSummary = {
  strict,
  requiredCore: idsRequiredCore.length,
  optional: idsOptional.length,
  totalChecked: idsToCheck.length,
  loadedBankCount,
  schemaValidatedCount,
  warningCount: warnings.length,
  failureCount: failures.length,
};

const report = {
  _meta: {
    id: "document_intelligence_implementation_report",
    version: "1.0.0",
    description:
      "Automated verification report for document intelligence registry, schemas, dependencies, runtime wiring, and orphan policy.",
    languages: ["any"],
    lastUpdated: new Date().toISOString().slice(0, 10),
  },
  generatedAt: new Date().toISOString(),
  strict,
  loadedBankCount,
  expectedBankCount: allValidationIds.length,
  coverageByFamily,
  checks: checkSummary,
  failedChecks: [...failures],
  warnings: [...warnings],
  unresolvedBlockers: strict ? [...failures] : [],
};

fs.writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failures.length > 0) {
  console.error(`[docint:verify] failed with ${failures.length} issue(s)`);
  for (const issue of failures) {
    console.error(` - ${issue}`);
  }
  if (warnings.length > 0) {
    console.error(`[docint:verify] warnings (${warnings.length})`);
    for (const warning of warnings) {
      console.error(` - ${warning}`);
    }
  }
  process.exit(1);
}

console.log(`[docint:verify] ok ${JSON.stringify(checkSummary)}`);
if (warnings.length > 0) {
  console.log(`[docint:verify] warnings (${warnings.length})`);
  for (const warning of warnings) {
    console.log(` - ${warning}`);
  }
}
