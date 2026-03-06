import fs from "node:fs";
import path from "node:path";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniq(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const key = typeof value === "string" ? value : JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function parseEditOperatorsFromTypesFile(repoRoot) {
  const filePath = path.join(repoRoot, "src/services/editing/editing.types.ts");
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/export\s+type\s+EditOperator\s*=\s*([\s\S]*?);/);
  const block = match?.[1] || "";
  const operators = new Set();
  for (const hit of block.matchAll(/"([A-Z0-9_]+)"/g)) operators.add(hit[1]);
  return operators;
}

function parseViewerSafeAutoApplyOps(repoRoot) {
  const filePath = path.join(
    repoRoot,
    "../frontend/src/components/documents/DocumentViewer.jsx",
  );
  const text = fs.readFileSync(filePath, "utf8");
  const declarationIndex = text.indexOf("const safeAutoApplyOperators");
  const slice = declarationIndex >= 0 ? text.slice(declarationIndex) : text;
  const start = slice.indexOf("[");
  const end = start >= 0 ? slice.indexOf("]") : -1;
  const block = start >= 0 && end > start ? slice.slice(start + 1, end) : "";
  const operators = new Set();
  for (const hit of block.matchAll(/'([A-Z0-9_]+)'/g)) operators.add(hit[1]);
  return operators;
}

export function generateRoutingAlignmentReport(repoRoot) {
  const banksRoot = path.join(repoRoot, "src/data_banks");
  const intentConfig = readJson(path.join(banksRoot, "routing/intent_config.any.json"));
  const operatorFamilies = readJson(path.join(banksRoot, "routing/operator_families.any.json"));
  const operatorContracts = readJson(path.join(banksRoot, "operators/operator_contracts.any.json"));
  const operatorShapes = readJson(path.join(banksRoot, "operators/operator_output_shapes.any.json"));
  const editingRouting = readJson(path.join(banksRoot, "routing/editing_routing.any.json"));
  const connectorsRouting = readJson(path.join(banksRoot, "routing/connectors_routing.any.json"));
  const emailRouting = readJson(path.join(banksRoot, "routing/email_routing.any.json"));

  const editOps = parseEditOperatorsFromTypesFile(repoRoot);
  const viewerSafeOps = parseViewerSafeAutoApplyOps(repoRoot);
  const problems = [];

  if (editingRouting?.config?.enabled !== true) {
    problems.push("[editing_routing] expected config.enabled=true");
  }
  const guardrails = Array.isArray(editingRouting?.guardrails)
    ? editingRouting.guardrails
    : [];
  if (guardrails.length === 0) {
    problems.push("[editing_routing] guardrails must be a non-empty array");
  }
  const guardrailIds = new Set();
  for (const rule of guardrails) {
    const id = typeof rule?.id === "string" ? rule.id.trim() : "";
    if (!id) {
      problems.push("[editing_routing] guardrail missing id");
      continue;
    }
    if (guardrailIds.has(id)) {
      problems.push(`[editing_routing] duplicate guardrail id ${id}`);
    }
    guardrailIds.add(id);
  }

  const tiebreakers = Array.isArray(editingRouting?.tiebreakers)
    ? editingRouting.tiebreakers
    : [];
  if (tiebreakers.length === 0) {
    problems.push("[editing_routing] tiebreakers must be a non-empty array");
  }
  for (const tiebreaker of tiebreakers) {
    const id = typeof tiebreaker?.id === "string" ? tiebreaker.id.trim() : "";
    if (!id) problems.push("[editing_routing] tiebreaker missing id");
    if (
      typeof tiebreaker?.weight !== "number" ||
      !Number.isFinite(tiebreaker.weight)
    ) {
      problems.push(
        `[editing_routing] tiebreaker ${id || "(no id)"} missing numeric weight`,
      );
    }
  }

  const families = Array.isArray(intentConfig?.intentFamilies)
    ? intentConfig.intentFamilies
    : Array.isArray(intentConfig?.config?.intentFamilies)
      ? intentConfig.config.intentFamilies
      : [];
  const editingFamily = families.find((family) => family?.id === "editing") || null;
  if (!editingFamily) problems.push("[intent_config] missing intentFamily=editing");
  if (editingFamily) {
    const allowed = new Set(
      (editingFamily.operatorsAllowed || []).filter((value) => typeof value === "string"),
    );
    for (const op of editOps) {
      if (!allowed.has(op)) {
        problems.push(`[intent_config] editing.operatorsAllowed missing ${op}`);
      }
    }
    for (const op of allowed) {
      if (!editOps.has(op)) {
        problems.push(
          `[intent_config] editing.operatorsAllowed contains non-EditOperator ${op}`,
        );
      }
    }
  }

  const familyDefs = Array.isArray(operatorFamilies?.families)
    ? operatorFamilies.families
    : [];
  const editingOperatorFamily = familyDefs.find((family) => family?.id === "editing") || null;
  if (!editingOperatorFamily) problems.push("[operator_families] missing family id=editing");
  if (editingOperatorFamily) {
    const operators = new Set(
      (editingOperatorFamily.operators || []).filter((value) => typeof value === "string"),
    );
    for (const op of editOps) {
      if (!operators.has(op)) {
        problems.push(`[operator_families] editing missing operator ${op}`);
      }
    }
    for (const op of operators) {
      if (!editOps.has(op)) {
        problems.push(`[operator_families] editing contains non-EditOperator ${op}`);
      }
    }
  }

  const contractIds = new Set(
    (operatorContracts?.operators || [])
      .map((operator) => operator?.id)
      .filter((value) => typeof value === "string"),
  );
  const shapeIds = new Set(Object.keys(operatorShapes?.mapping || {}));
  for (const op of editOps) {
    if (!contractIds.has(op)) {
      problems.push(`[operator_contracts] missing contract for ${op}`);
    }
    if (!shapeIds.has(op)) {
      problems.push(`[operator_output_shapes] missing shape mapping for ${op}`);
    }
  }

  const familyOps = new Set();
  for (const family of familyDefs) {
    for (const op of family?.operators || []) {
      if (typeof op === "string") familyOps.add(op);
    }
  }
  const intentAllowed = new Set();
  for (const family of intentConfig?.intentFamilies || []) {
    for (const op of family?.operatorsAllowed || []) {
      if (typeof op === "string") intentAllowed.add(op);
    }
  }
  for (const op of familyOps) {
    if (editOps.has(op)) continue;
    if (!contractIds.has(op)) {
      problems.push(`[operator_contracts] missing contract for operator_families op ${op}`);
    }
    if (!shapeIds.has(op)) {
      problems.push(
        `[operator_output_shapes] missing shape mapping for operator_families op ${op}`,
      );
    }
  }
  for (const op of intentAllowed) {
    const known = editOps.has(op) || familyOps.has(op) || contractIds.has(op);
    if (!known) problems.push(`[intent_config] operatorsAllowed references unknown operator ${op}`);
    if (!editOps.has(op)) {
      if (!contractIds.has(op)) {
        problems.push(`[operator_contracts] missing contract for intent_config op ${op}`);
      }
      if (!shapeIds.has(op)) {
        problems.push(
          `[operator_output_shapes] missing shape mapping for intent_config op ${op}`,
        );
      }
    }
  }

  const confirmationModeOps = new Set(
    (operatorContracts?.operators || [])
      .filter(
        (operator) =>
          operator?.preferredAnswerMode === "action_confirmation" &&
          typeof operator?.id === "string",
      )
      .map((operator) => operator.id),
  );
  for (const op of viewerSafeOps) {
    if (confirmationModeOps.has(op)) {
      problems.push(`[viewer] safeAutoApplyOperators includes action_confirmation op ${op}`);
    }
  }

  if (connectorsRouting?.config?.enabled !== true) {
    problems.push(
      "[connectors_routing] expected config.enabled=true (bank should be authoritative in routing)",
    );
  }
  const connectorsCanonical = new Set(
    (connectorsRouting?.operators?.canonical || []).filter(
      (value) => typeof value === "string",
    ),
  );
  for (const op of connectorsCanonical) {
    if (!contractIds.has(op)) {
      problems.push(`[operator_contracts] missing contract for connectors op ${op}`);
    }
    if (!shapeIds.has(op)) {
      problems.push(`[operator_output_shapes] missing shape mapping for connectors op ${op}`);
    }
  }
  const connectorsFamily = families.find((family) => family?.id === "connectors") || null;
  if (!connectorsFamily) problems.push("[intent_config] missing intentFamily=connectors");
  if (connectorsFamily) {
    const allowed = new Set(
      (connectorsFamily.operatorsAllowed || []).filter(
        (value) => typeof value === "string",
      ),
    );
    for (const op of connectorsCanonical) {
      if (!allowed.has(op)) {
        problems.push(`[intent_config] connectors.operatorsAllowed missing ${op}`);
      }
    }
  }
  const connectorsOperatorFamily =
    familyDefs.find((family) => family?.id === "connectors") || null;
  if (!connectorsOperatorFamily) {
    problems.push("[operator_families] missing family id=connectors");
  }
  if (connectorsOperatorFamily) {
    const operators = new Set(
      (connectorsOperatorFamily.operators || []).filter(
        (value) => typeof value === "string",
      ),
    );
    for (const op of connectorsCanonical) {
      if (!operators.has(op)) {
        problems.push(`[operator_families] connectors missing operator ${op}`);
      }
    }
  }

  if (emailRouting?.config?.enabled !== true) {
    problems.push(
      "[email_routing] expected config.enabled=true (bank should be authoritative in routing)",
    );
  }
  const emailCanonical = new Set(
    (emailRouting?.operators?.canonical || []).filter(
      (value) => typeof value === "string",
    ),
  );
  for (const op of emailCanonical) {
    if (!contractIds.has(op)) {
      problems.push(`[operator_contracts] missing contract for email op ${op}`);
    }
    if (!shapeIds.has(op)) {
      problems.push(`[operator_output_shapes] missing shape mapping for email op ${op}`);
    }
  }
  const emailFamily = families.find((family) => family?.id === "email") || null;
  if (!emailFamily) problems.push("[intent_config] missing intentFamily=email");
  if (emailFamily) {
    const allowed = new Set(
      (emailFamily.operatorsAllowed || []).filter((value) => typeof value === "string"),
    );
    for (const op of emailCanonical) {
      if (!allowed.has(op)) {
        problems.push(`[intent_config] email.operatorsAllowed missing ${op}`);
      }
    }
  }
  const emailOperatorFamily = familyDefs.find((family) => family?.id === "email") || null;
  if (!emailOperatorFamily) {
    problems.push("[operator_families] missing family id=email");
  }
  if (emailOperatorFamily) {
    const operators = new Set(
      (emailOperatorFamily.operators || []).filter((value) => typeof value === "string"),
    );
    for (const op of emailCanonical) {
      if (!operators.has(op)) {
        problems.push(`[operator_families] email missing operator ${op}`);
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems: uniq(problems),
    counts: {
      editOps: editOps.size,
      viewerSafeOps: viewerSafeOps.size,
      contracts: contractIds.size,
      shapes: shapeIds.size,
    },
  };
}
