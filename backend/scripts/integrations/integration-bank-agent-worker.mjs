#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const servicesRoot = path.join(repoRoot, "src", "services");

const AGENTS = {
  routing_agent: {
    id: "routing_agent",
    title: "Routing Agent",
    ownedBanks: [
      "routing/connectors_routing.any.json",
      "routing/email_routing.any.json",
    ],
  },
  intent_family_agent: {
    id: "intent_family_agent",
    title: "Intent Family Agent",
    ownedBanks: [
      "routing/intent_config.any.json",
      "routing/operator_families.any.json",
    ],
  },
  operator_contract_agent: {
    id: "operator_contract_agent",
    title: "Operator Contract Agent",
    ownedBanks: [
      "operators/operator_contracts.any.json",
      "operators/operator_output_shapes.any.json",
    ],
  },
  capabilities_agent: {
    id: "capabilities_agent",
    title: "Capabilities Agent",
    ownedBanks: [
      "semantics/capabilities_catalog.any.json",
      "microcopy/koda_product_help.any.json",
    ],
  },
  policy_agent: {
    id: "policy_agent",
    title: "Policy Agent",
    ownedBanks: [
      "policies/allybi_connector_permissions.any.json",
      "routing/allybi_intents.any.json",
    ],
  },
  collision_agent: {
    id: "collision_agent",
    title: "Collision Agent",
    ownedBanks: ["operators/operator_collision_matrix.any.json"],
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { agentId: "", asJson: false };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--agent") out.agentId = String(args[i + 1] || "").trim();
    if (token === "--json") out.asJson = true;
  }
  return out;
}

function loadJson(relPath) {
  const fullPath = path.join(dataBanksRoot, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function gradeFromScore(score) {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  return "F";
}

function normalizeSet(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function check(checks, id, pass, weight, detail, severity = "medium") {
  checks.push({ id, pass, weight, detail, severity });
}

function scoreChecks(checks) {
  let score = 100;
  for (const item of checks) {
    if (!item.pass) score -= item.weight;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function runRoutingAgent() {
  const checks = [];
  const connectors = loadJson("routing/connectors_routing.any.json");
  const email = loadJson("routing/email_routing.any.json");

  const connectorsOps = normalizeSet(connectors?.operators?.canonical);
  const emailOps = normalizeSet(email?.operators?.canonical);
  const connectorsRuleOps = new Set(
    (Array.isArray(connectors?.rules) ? connectors.rules : []).map((rule) =>
      String(rule?.then?.operator || "").trim(),
    ),
  );
  const emailRuleOps = new Set(
    (Array.isArray(email?.rules) ? email.rules : []).map((rule) =>
      String(rule?.then?.operator || "").trim(),
    ),
  );

  check(
    checks,
    "routing.connectors.operator_coverage",
    Array.from(connectorsOps).every((op) => connectorsRuleOps.has(op)),
    16,
    "Every canonical connectors operator should be emitted by at least one routing rule.",
    "high",
  );
  check(
    checks,
    "routing.email.operator_coverage",
    Array.from(emailOps).every((op) => emailRuleOps.has(op)),
    16,
    "Every canonical email operator should be emitted by at least one routing rule.",
    "high",
  );
  check(
    checks,
    "routing.connectors.tests.depth",
    (connectors?.tests?.cases || []).length >= 3,
    8,
    "connectors_routing should include at least 3 bank test cases.",
  );
  check(
    checks,
    "routing.email.tests.depth",
    (email?.tests?.cases || []).length >= 5,
    10,
    "email_routing should include at least 5 bank test cases.",
    "high",
  );
  check(
    checks,
    "routing.email.disambiguation.missing_provider",
    Boolean(email?.disambiguation?.requiredWhen?.missingProviderForOperators),
    14,
    "email_routing should define explicit missing-provider disambiguation gates.",
    "high",
  );
  check(
    checks,
    "routing.locale.parity",
    Array.isArray(connectors?.localeSupport) &&
      Array.isArray(email?.localeSupport) &&
      connectors.localeSupport.includes("en") &&
      connectors.localeSupport.includes("pt") &&
      email.localeSupport.includes("en") &&
      email.localeSupport.includes("pt"),
    6,
    "Integration routing banks must preserve EN/PT locale coverage.",
  );

  const score = scoreChecks(checks);
  return {
    ...AGENTS.routing_agent,
    checks,
    score,
    grade: gradeFromScore(score),
  };
}

function runIntentFamilyAgent() {
  const checks = [];
  const intentConfig = loadJson("routing/intent_config.any.json");
  const operatorFamilies = loadJson("routing/operator_families.any.json");

  const icConnectors =
    intentConfig?.intentFamilies?.find((item) => item?.id === "connectors")
      ?.operatorsAllowed || [];
  const icEmail =
    intentConfig?.intentFamilies?.find((item) => item?.id === "email")
      ?.operatorsAllowed || [];
  const famConnectors =
    operatorFamilies?.families?.find((item) => item?.id === "connectors")
      ?.operators || [];
  const famEmail =
    operatorFamilies?.families?.find((item) => item?.id === "email")
      ?.operators || [];

  check(
    checks,
    "intent.connectors.operator_parity",
    JSON.stringify([...normalizeSet(icConnectors)].sort()) ===
      JSON.stringify([...normalizeSet(famConnectors)].sort()),
    18,
    "connectors operators should be identical across intent_config and operator_families.",
    "high",
  );
  check(
    checks,
    "intent.email.operator_parity",
    JSON.stringify([...normalizeSet(icEmail)].sort()) ===
      JSON.stringify([...normalizeSet(famEmail)].sort()),
    18,
    "email operators should be identical across intent_config and operator_families.",
    "high",
  );
  check(
    checks,
    "intent.defaults.operator_validity",
    normalizeSet(icConnectors).has(
      String(intentConfig?.config?.defaultOperatorByFamily?.connectors || ""),
    ) &&
      normalizeSet(icEmail).has(
        String(intentConfig?.config?.defaultOperatorByFamily?.email || ""),
      ),
    10,
    "Default operators by family should always exist inside each family operator set.",
    "high",
  );
  check(
    checks,
    "intent.tests.depth",
    (intentConfig?.tests?.cases || []).length >= 8,
    10,
    "intent_config should include at least 8 parity tests for family/operator contracts.",
  );
  check(
    checks,
    "family.email.default_mode",
    String(
      operatorFamilies?.families?.find((item) => item?.id === "email")
        ?.defaultAnswerMode || "",
    ) === "general_answer",
    8,
    "email family default answer mode should favor general_answer for read/explain flows.",
  );

  const score = scoreChecks(checks);
  return {
    ...AGENTS.intent_family_agent,
    checks,
    score,
    grade: gradeFromScore(score),
  };
}

function runOperatorContractAgent() {
  const checks = [];
  const contracts = loadJson("operators/operator_contracts.any.json");
  const outputShapes = loadJson("operators/operator_output_shapes.any.json");
  const routingConnectors = loadJson("routing/connectors_routing.any.json");
  const routingEmail = loadJson("routing/email_routing.any.json");

  const contractOps = new Set(
    (Array.isArray(contracts?.operators) ? contracts.operators : []).map((item) =>
      String(item?.id || "").trim(),
    ),
  );
  const shapeOps = new Set(
    Object.keys(outputShapes?.mapping || {}).map((item) =>
      String(item || "").trim(),
    ),
  );
  const requiredOps = [
    ...(routingConnectors?.operators?.canonical || []),
    ...(routingEmail?.operators?.canonical || []),
  ].map((value) => String(value || "").trim());

  check(
    checks,
    "contracts.coverage",
    requiredOps.every((op) => contractOps.has(op)),
    20,
    "Every integration operator used by routing banks must exist in operator_contracts.",
    "high",
  );
  check(
    checks,
    "output_shapes.coverage",
    requiredOps.every((op) => shapeOps.has(op)),
    18,
    "Every integration operator used by routing banks must exist in operator_output_shapes mapping.",
    "high",
  );
  check(
    checks,
    "contracts.connector_search.sources_required",
    contracts?.operators?.find((item) => item?.id === "CONNECTOR_SEARCH")
      ?.outputs?.sources?.required === true,
    10,
    "CONNECTOR_SEARCH contract must require sources for evidence-grade responses.",
  );
  check(
    checks,
    "contracts.email_doc_fusion.sources_required",
    contracts?.operators?.find((item) => item?.id === "EMAIL_DOC_FUSION")
      ?.outputs?.sources?.required === true,
    10,
    "EMAIL_DOC_FUSION contract must require sources.",
  );
  check(
    checks,
    "output_shapes.tests.depth",
    (outputShapes?.tests?.cases || []).length >= 6,
    8,
    "operator_output_shapes should include at least 6 shape contract tests.",
  );

  const score = scoreChecks(checks);
  return {
    ...AGENTS.operator_contract_agent,
    checks,
    score,
    grade: gradeFromScore(score),
  };
}

function runCapabilitiesAgent() {
  const checks = [];
  const caps = loadJson("semantics/capabilities_catalog.any.json");
  const contracts = loadJson("operators/operator_contracts.any.json");
  const help = loadJson("microcopy/koda_product_help.any.json");

  const connectorGroup = (caps?.groups || []).find(
    (group) => group?.id === "connectors_email",
  );
  const contractOps = new Set(
    (contracts?.operators || [])
      .filter((item) => item?.family === "connectors" || item?.family === "email")
      .map((item) => String(item?.id || "").trim()),
  );
  const sourceOps = new Set(
    (connectorGroup?.sourceOperators || []).map((item) =>
      String(item || "").trim(),
    ),
  );

  check(
    checks,
    "capabilities.connectors_group.exists",
    Boolean(connectorGroup),
    20,
    "Capabilities catalog must expose the connectors_email group.",
    "high",
  );
  check(
    checks,
    "capabilities.connectors_group.operator_parity",
    Array.from(contractOps).every((op) => sourceOps.has(op)),
    16,
    "connectors_email sourceOperators must include every connector/email contract operator.",
    "high",
  );
  check(
    checks,
    "capabilities.connectors_constraints",
    connectorGroup?.constraints?.availability?.requiresActiveConnector === true &&
      connectorGroup?.constraints?.availability?.requiresPermissionsForSend ===
        true,
    12,
    "connectors_email constraints must keep connector and send permission requirements explicit.",
    "high",
  );
  check(
    checks,
    "product_help.references_connectors_group",
    help?.sections?.by_domain_capabilities?.connectors_email?.sourceGroup ===
    "connectors_email",
    8,
    "Product help claims must explicitly bind to connectors_email source group.",
  );
  check(
    checks,
    "product_help.limitations.connector_note",
    (help?.sections?.limitations_memory_scope?.notes || []).some(
      (note) => note?.id === "connector_permission_requirement",
    ),
    8,
    "Product help limitation notes should include connector permission caveat.",
  );

  const score = scoreChecks(checks);
  return {
    ...AGENTS.capabilities_agent,
    checks,
    score,
    grade: gradeFromScore(score),
  };
}

function recursiveFindFiles(dirPath) {
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...recursiveFindFiles(full));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

function runPolicyAgent() {
  const checks = [];
  const permissions = loadJson("policies/allybi_connector_permissions.any.json");
  const intents = loadJson("routing/allybi_intents.any.json");

  check(
    checks,
    "policy.permissions.actions_present",
    Boolean(permissions?.actions?.CONNECTOR_READ_LIST) &&
      Boolean(permissions?.actions?.CONNECTOR_DRAFT) &&
      Boolean(permissions?.actions?.CONNECTOR_SEND_CONFIRM),
    16,
    "Connector permissions bank must define read/draft/send actions.",
    "high",
  );
  check(
    checks,
    "policy.permissions.tests.depth",
    (permissions?.tests?.cases || []).length >= 2,
    10,
    "Connector permissions bank should include at least 2 tests.",
  );
  check(
    checks,
    "policy.intents.viewer_fallback_guard",
    (intents?.config?.viewerDisallowedFallbacks || []).includes("CONNECTOR_*"),
    14,
    "allybi_intents should explicitly block connector fallbacks in viewer mode.",
    "high",
  );
  check(
    checks,
    "policy.intents.tests.depth",
    (intents?.tests?.cases || []).length >= 2,
    8,
    "allybi_intents should include explicit policy regression tests.",
  );

  const editingFiles = recursiveFindFiles(path.join(servicesRoot, "editing", "allybi"));
  let connectorPermissionMentions = 0;
  for (const filePath of editingFiles) {
    const raw = fs.readFileSync(filePath, "utf8");
    const matches = raw.match(/connectorPermissions/g);
    connectorPermissionMentions += matches ? matches.length : 0;
  }
  check(
    checks,
    "policy.runtime.wiring_usage",
    connectorPermissionMentions >= 3,
    16,
    "Connector permissions should be consumed by runtime logic, not only loaded.",
    "high",
  );

  const score = scoreChecks(checks);
  return {
    ...AGENTS.policy_agent,
    checks,
    score,
    grade: gradeFromScore(score),
  };
}

function runCollisionAgent() {
  const checks = [];
  const matrix = loadJson("operators/operator_collision_matrix.any.json");
  const fileAction = loadJson("operators/file_action_operators.any.json");
  const contracts = loadJson("operators/operator_contracts.any.json");
  const knownOps = new Set([
    ...Object.keys(fileAction?.operators || {}).map((op) =>
      String(op || "").trim().toLowerCase(),
    ),
    ...(contracts?.operators || []).map((op) =>
      String(op?.id || "").trim().toLowerCase(),
    ),
  ]);

  const rules = Array.isArray(matrix?.rules) ? matrix.rules : [];
  const cm6 = rules.find((rule) => rule?.id === "CM_0006_connector_vs_doc_retrieval");
  const cm8 = rules.find((rule) => rule?.id === "CM_0008_email_draft_vs_email_explain");

  const integrationRules = [cm6, cm8].filter(Boolean);
  check(
    checks,
    "collision.integration_rules.present",
    integrationRules.length === 2,
    18,
    "Collision matrix must include integration-specific suppression rules.",
    "high",
  );

  const haveLocalizedRegex = integrationRules.every((rule) => {
    const queryRegexAny = rule?.when?.queryRegexAny || {};
    return (
      Array.isArray(queryRegexAny.en) &&
      queryRegexAny.en.length > 0 &&
      Array.isArray(queryRegexAny.pt) &&
      queryRegexAny.pt.length > 0 &&
      Array.isArray(queryRegexAny.es) &&
      queryRegexAny.es.length > 0
    );
  });
  check(
    checks,
    "collision.integration_rules.query_regex_locales",
    haveLocalizedRegex,
    16,
    "Integration collision rules must define EN/PT/ES queryRegexAny patterns.",
    "high",
  );

  const unknownOps = [];
  for (const rule of integrationRules) {
    const operators = Array.isArray(rule?.when?.operators)
      ? rule.when.operators
      : [];
    for (const operator of operators) {
      const normalized = String(operator || "").trim().toLowerCase();
      if (normalized && !knownOps.has(normalized)) {
        unknownOps.push(`${rule.id}:${normalized}`);
      }
    }
  }
  check(
    checks,
    "collision.integration_rules.known_operators",
    unknownOps.length === 0,
    14,
    "Integration collision rules should reference only known runtime operators.",
    "high",
  );
  check(
    checks,
    "collision.tests.depth",
    (matrix?.tests?.cases || []).length >= 4,
    6,
    "Collision matrix should include at least 4 regression cases.",
  );

  const score = scoreChecks(checks);
  return {
    ...AGENTS.collision_agent,
    checks,
    score,
    grade: gradeFromScore(score),
  };
}

function runAgent(agentId) {
  if (!AGENTS[agentId]) {
    throw new Error(
      `Unknown agent '${agentId}'. Valid agents: ${Object.keys(AGENTS).join(", ")}`,
    );
  }
  switch (agentId) {
    case "routing_agent":
      return runRoutingAgent();
    case "intent_family_agent":
      return runIntentFamilyAgent();
    case "operator_contract_agent":
      return runOperatorContractAgent();
    case "capabilities_agent":
      return runCapabilitiesAgent();
    case "policy_agent":
      return runPolicyAgent();
    case "collision_agent":
      return runCollisionAgent();
    default:
      throw new Error(`Unhandled agent '${agentId}'.`);
  }
}

const args = parseArgs();
if (!args.agentId) {
  console.error("Usage: node integration-bank-agent-worker.mjs --agent <id> [--json]");
  process.exit(1);
}

try {
  const result = runAgent(args.agentId);
  if (args.asJson) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        agentId: args.agentId,
        error: String(error?.message || error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
