import fs from "fs";
import path from "path";

type Json = any;

function readJson(p: string): Json {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function uniq<T>(xs: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const k = typeof x === "string" ? x : JSON.stringify(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function parseEditOperatorsFromTypesFile(repoRoot: string): Set<string> {
  const p = path.join(repoRoot, "src/services/editing/editing.types.ts");
  const text = fs.readFileSync(p, "utf8");
  const m = text.match(/export\s+type\s+EditOperator\s*=\s*([\s\S]*?);/);
  const block = m?.[1] || "";
  const ops = new Set<string>();
  for (const hit of block.matchAll(/"([A-Z0-9_]+)"/g)) ops.add(hit[1]);
  return ops;
}

function parseViewerSafeAutoApplyOps(repoRoot: string): Set<string> {
  const p = path.join(repoRoot, "../frontend/src/components/documents/DocumentViewer.jsx");
  const text = fs.readFileSync(p, "utf8");
  const declIdx = text.indexOf("const safeAutoApplyOperators");
  const slice = declIdx >= 0 ? text.slice(declIdx) : text;
  const start = slice.indexOf("[");
  const end = start >= 0 ? slice.indexOf("]") : -1;
  const block = start >= 0 && end > start ? slice.slice(start + 1, end) : "";
  const ops = new Set<string>();
  for (const hit of block.matchAll(/'([A-Z0-9_]+)'/g)) ops.add(hit[1]);
  return ops;
}

function main() {
  const repoRoot = path.resolve(__dirname, ".."); // backend/
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

  const problems: string[] = [];

  // --- Editing routing bank shape ---
  if (editingRouting?.config?.enabled !== true) {
    problems.push(`[editing_routing] expected config.enabled=true`);
  }
  const guardrails = Array.isArray(editingRouting?.guardrails) ? editingRouting.guardrails : [];
  if (guardrails.length === 0) problems.push(`[editing_routing] guardrails must be a non-empty array`);
  const guardrailIds = new Set<string>();
  for (const rule of guardrails) {
    const id = typeof rule?.id === "string" ? rule.id.trim() : "";
    if (!id) {
      problems.push(`[editing_routing] guardrail missing id`);
      continue;
    }
    if (guardrailIds.has(id)) problems.push(`[editing_routing] duplicate guardrail id ${id}`);
    guardrailIds.add(id);
  }

  const tiebreakers = Array.isArray(editingRouting?.tiebreakers) ? editingRouting.tiebreakers : [];
  if (tiebreakers.length === 0) problems.push(`[editing_routing] tiebreakers must be a non-empty array`);
  for (const t of tiebreakers) {
    const id = typeof t?.id === "string" ? t.id.trim() : "";
    if (!id) problems.push(`[editing_routing] tiebreaker missing id`);
    if (typeof t?.weight !== "number" || !Number.isFinite(t.weight)) {
      problems.push(`[editing_routing] tiebreaker ${id || "(no id)"} missing numeric weight`);
    }
  }

  // intent_config editing family
  const families = Array.isArray(intentConfig?.intentFamilies)
    ? intentConfig.intentFamilies
    : Array.isArray(intentConfig?.config?.intentFamilies)
      ? intentConfig.config.intentFamilies
      : [];
  const editingFam = families.find((f: any) => f?.id === "editing") || null;
  if (!editingFam) problems.push(`[intent_config] missing intentFamily=editing`);
  if (editingFam) {
    const allowed = new Set<string>((editingFam.operatorsAllowed || []).filter((s: any) => typeof s === "string"));
    for (const op of editOps) if (!allowed.has(op)) problems.push(`[intent_config] editing.operatorsAllowed missing ${op}`);
    for (const op of allowed) if (!editOps.has(op)) problems.push(`[intent_config] editing.operatorsAllowed contains non-EditOperator ${op}`);
  }

  // operator_families editing family
  const fams = Array.isArray(operatorFamilies?.families) ? operatorFamilies.families : [];
  const opFamEditing = fams.find((f: any) => f?.id === "editing") || null;
  if (!opFamEditing) problems.push(`[operator_families] missing family id=editing`);
  if (opFamEditing) {
    const ops = new Set<string>((opFamEditing.operators || []).filter((s: any) => typeof s === "string"));
    for (const op of editOps) if (!ops.has(op)) problems.push(`[operator_families] editing missing operator ${op}`);
    for (const op of ops) if (!editOps.has(op)) problems.push(`[operator_families] editing contains non-EditOperator ${op}`);
  }

  // contracts + output shapes: all edit ops must exist
  const contractIds = new Set<string>((operatorContracts?.operators || []).map((o: any) => o?.id).filter((s: any) => typeof s === "string"));
  const shapeIds = new Set<string>(Object.keys(operatorShapes?.mapping || {}));
  for (const op of editOps) {
    if (!contractIds.has(op)) problems.push(`[operator_contracts] missing contract for ${op}`);
    if (!shapeIds.has(op)) problems.push(`[operator_output_shapes] missing shape mapping for ${op}`);
  }

  // --- Core routing operators: intent_config + operator_families must be covered by contracts + shapes ---
  const familyOps = new Set<string>();
  for (const fam of (operatorFamilies?.families || [])) {
    for (const op of (fam?.operators || [])) if (typeof op === "string") familyOps.add(op);
  }

  const intentAllowed = new Set<string>();
  for (const fam of (intentConfig?.intentFamilies || [])) {
    for (const op of (fam?.operatorsAllowed || [])) if (typeof op === "string") intentAllowed.add(op);
  }

  for (const op of familyOps) {
    if (editOps.has(op)) continue;
    if (!contractIds.has(op)) problems.push(`[operator_contracts] missing contract for operator_families op ${op}`);
    if (!shapeIds.has(op)) problems.push(`[operator_output_shapes] missing shape mapping for operator_families op ${op}`);
  }

  for (const op of intentAllowed) {
    const known = editOps.has(op) || familyOps.has(op) || contractIds.has(op);
    if (!known) problems.push(`[intent_config] operatorsAllowed references unknown operator ${op}`);
    if (!editOps.has(op)) {
      if (!contractIds.has(op)) problems.push(`[operator_contracts] missing contract for intent_config op ${op}`);
      if (!shapeIds.has(op)) problems.push(`[operator_output_shapes] missing shape mapping for intent_config op ${op}`);
    }
  }

  const confirmationModeOps = new Set<string>(
    (operatorContracts?.operators || [])
      .filter((o: any) => o?.preferredAnswerMode === "action_confirmation" && typeof o?.id === "string")
      .map((o: any) => o.id),
  );

  // viewer safe auto apply must not include explicit confirmation operators
  for (const op of viewerSafeOps) {
    if (confirmationModeOps.has(op)) problems.push(`[viewer] safeAutoApplyOperators includes action_confirmation op ${op}`);
  }

  // --- Connectors: banks should be consistent across routing + intent_config + operator_families + contracts + shapes ---
  if (connectorsRouting?.config?.enabled !== true) {
    problems.push(`[connectors_routing] expected config.enabled=true (bank should be authoritative in routing)`);
  }

  const connectorsCanonical = new Set<string>((connectorsRouting?.operators?.canonical || []).filter((s: any) => typeof s === "string"));
  for (const op of connectorsCanonical) {
    if (!contractIds.has(op)) problems.push(`[operator_contracts] missing contract for connectors op ${op}`);
    if (!shapeIds.has(op)) problems.push(`[operator_output_shapes] missing shape mapping for connectors op ${op}`);
  }

  const connectorsFam = families.find((f: any) => f?.id === "connectors") || null;
  if (!connectorsFam) problems.push(`[intent_config] missing intentFamily=connectors`);
  if (connectorsFam) {
    const allowed = new Set<string>((connectorsFam.operatorsAllowed || []).filter((s: any) => typeof s === "string"));
    for (const op of connectorsCanonical) if (!allowed.has(op)) problems.push(`[intent_config] connectors.operatorsAllowed missing ${op}`);
  }

  const opFamConnectors = fams.find((f: any) => f?.id === "connectors") || null;
  if (!opFamConnectors) problems.push(`[operator_families] missing family id=connectors`);
  if (opFamConnectors) {
    const ops = new Set<string>((opFamConnectors.operators || []).filter((s: any) => typeof s === "string"));
    for (const op of connectorsCanonical) if (!ops.has(op)) problems.push(`[operator_families] connectors missing operator ${op}`);
  }

  // --- Email: banks should be consistent across routing + intent_config + operator_families + contracts + shapes ---
  if (emailRouting?.config?.enabled !== true) {
    problems.push(`[email_routing] expected config.enabled=true (bank should be authoritative in routing)`);
  }

  const emailCanonical = new Set<string>((emailRouting?.operators?.canonical || []).filter((s: any) => typeof s === "string"));
  for (const op of emailCanonical) {
    if (!contractIds.has(op)) problems.push(`[operator_contracts] missing contract for email op ${op}`);
    if (!shapeIds.has(op)) problems.push(`[operator_output_shapes] missing shape mapping for email op ${op}`);
  }

  const emailFam = families.find((f: any) => f?.id === "email") || null;
  if (!emailFam) problems.push(`[intent_config] missing intentFamily=email`);
  if (emailFam) {
    const allowed = new Set<string>((emailFam.operatorsAllowed || []).filter((s: any) => typeof s === "string"));
    for (const op of emailCanonical) if (!allowed.has(op)) problems.push(`[intent_config] email.operatorsAllowed missing ${op}`);
  }

  const opFamEmail = fams.find((f: any) => f?.id === "email") || null;
  if (!opFamEmail) problems.push(`[operator_families] missing family id=email`);
  if (opFamEmail) {
    const ops = new Set<string>((opFamEmail.operators || []).filter((s: any) => typeof s === "string"));
    for (const op of emailCanonical) if (!ops.has(op)) problems.push(`[operator_families] email missing operator ${op}`);
  }

  const ok = problems.length === 0;
  const report = {
    ok,
    problems: uniq(problems),
    counts: {
      editOps: editOps.size,
      viewerSafeOps: viewerSafeOps.size,
      contracts: contractIds.size,
      shapes: shapeIds.size,
    },
  };

  const asJson = process.argv.includes("--json");
  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    if (ok) {
      console.log("OK: routing/operator/editing alignment checks passed.");
    } else {
      console.log("FAIL: routing/operator/editing alignment checks failed:");
      for (const p of report.problems) console.log(`- ${p}`);
      console.log("");
      console.log(`Counts: editOps=${report.counts.editOps}, viewerSafeOps=${report.counts.viewerSafeOps}`);
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
