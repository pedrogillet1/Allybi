import fs from "fs";
import path from "path";

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
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
  const p = path.join(
    repoRoot,
    "../frontend/src/components/documents/DocumentViewer.jsx",
  );
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

describe("Routing/Operator Alignment", () => {
  const backendRoot = path.resolve(__dirname, "..", ".."); // backend/
  const banksRoot = path.join(backendRoot, "src/data_banks");

  test("editing operators are consistent across backend + banks + viewer", () => {
    const editOps = parseEditOperatorsFromTypesFile(backendRoot);
    const viewerSafe = parseViewerSafeAutoApplyOps(backendRoot);

    const editingRouting = readJson(
      path.join(banksRoot, "routing/editing_routing.any.json"),
    );
    const intentConfig = readJson(
      path.join(banksRoot, "routing/intent_config.any.json"),
    );
    const operatorFamilies = readJson(
      path.join(banksRoot, "routing/operator_families.any.json"),
    );
    const operatorContracts = readJson(
      path.join(banksRoot, "operators/operator_contracts.any.json"),
    );
    const operatorShapes = readJson(
      path.join(banksRoot, "operators/operator_output_shapes.any.json"),
    );

    const canonical = new Set<string>(
      (editingRouting?.operators?.canonical || []).filter(
        (s: any) => typeof s === "string",
      ),
    );
    const alwaysConfirm = new Set<string>(
      (editingRouting?.operators?.alwaysConfirm || []).filter(
        (s: any) => typeof s === "string",
      ),
    );

    // canonical <-> EditOperator
    for (const op of editOps) expect(canonical.has(op)).toBe(true);
    for (const op of canonical) expect(editOps.has(op)).toBe(true);

    // alwaysConfirm subset
    for (const op of alwaysConfirm) expect(editOps.has(op)).toBe(true);

    // rules only use supported operators
    for (const r of editingRouting?.rules || []) {
      const op = r?.then?.operator;
      if (typeof op === "string") expect(editOps.has(op)).toBe(true);
    }

    // intent_config includes editing family and matches
    const fam = (intentConfig?.intentFamilies || []).find(
      (f: any) => f?.id === "editing",
    );
    expect(Boolean(fam)).toBe(true);
    const allowed = new Set<string>(
      (fam?.operatorsAllowed || []).filter((s: any) => typeof s === "string"),
    );
    for (const op of editOps) expect(allowed.has(op)).toBe(true);
    for (const op of allowed) expect(editOps.has(op)).toBe(true);

    // operator_families includes editing family and matches
    const ofam = (operatorFamilies?.families || []).find(
      (f: any) => f?.id === "editing",
    );
    expect(Boolean(ofam)).toBe(true);
    const fops = new Set<string>(
      (ofam?.operators || []).filter((s: any) => typeof s === "string"),
    );
    for (const op of editOps) expect(fops.has(op)).toBe(true);
    for (const op of fops) expect(editOps.has(op)).toBe(true);

    // contracts + shapes exist for edit ops
    const contractIds = new Set<string>(
      (operatorContracts?.operators || [])
        .map((o: any) => o?.id)
        .filter((s: any) => typeof s === "string"),
    );
    const shapeIds = new Set<string>(
      Object.keys(operatorShapes?.mapping || {}),
    );
    for (const op of editOps) {
      expect(contractIds.has(op)).toBe(true);
      expect(shapeIds.has(op)).toBe(true);
    }

    // viewer safe auto apply excludes always-confirm ops
    for (const op of viewerSafe) {
      expect(alwaysConfirm.has(op)).toBe(false);
    }
  });

  test("intent_config and operator_families operators are covered by contracts + output shapes", () => {
    const editOps = parseEditOperatorsFromTypesFile(backendRoot);

    const intentConfig = readJson(
      path.join(banksRoot, "routing/intent_config.any.json"),
    );
    const operatorFamilies = readJson(
      path.join(banksRoot, "routing/operator_families.any.json"),
    );
    const operatorContracts = readJson(
      path.join(banksRoot, "operators/operator_contracts.any.json"),
    );
    const operatorShapes = readJson(
      path.join(banksRoot, "operators/operator_output_shapes.any.json"),
    );

    const contractIds = new Set<string>(
      (operatorContracts?.operators || [])
        .map((o: any) => o?.id)
        .filter((s: any) => typeof s === "string"),
    );
    const shapeIds = new Set<string>(
      Object.keys(operatorShapes?.mapping || {}),
    );

    const familyOps = new Set<string>();
    for (const fam of operatorFamilies?.families || []) {
      for (const op of fam?.operators || [])
        if (typeof op === "string") familyOps.add(op);
    }

    const intentAllowed = new Set<string>();
    for (const fam of intentConfig?.intentFamilies || []) {
      for (const op of fam?.operatorsAllowed || [])
        if (typeof op === "string") intentAllowed.add(op);
    }

    // Any operator in operator_families must have contract+shape (unless it's an EditOperator).
    for (const op of familyOps) {
      if (editOps.has(op)) continue;
      expect(contractIds.has(op)).toBe(true);
      expect(shapeIds.has(op)).toBe(true);
    }

    // Any operator in intent_config must exist and have contract+shape (unless it's an EditOperator).
    for (const op of intentAllowed) {
      const known = editOps.has(op) || familyOps.has(op) || contractIds.has(op);
      expect(known).toBe(true);
      if (editOps.has(op)) continue;
      expect(contractIds.has(op)).toBe(true);
      expect(shapeIds.has(op)).toBe(true);
    }
  });

  test("connectors_routing is enabled once it is authoritative", () => {
    const connectorsRouting = readJson(
      path.join(banksRoot, "routing/connectors_routing.any.json"),
    );
    expect(connectorsRouting?.config?.enabled).toBe(true);
  });

  test("email_routing is enabled once it is authoritative", () => {
    const emailRouting = readJson(
      path.join(banksRoot, "routing/email_routing.any.json"),
    );
    expect(emailRouting?.config?.enabled).toBe(true);
  });
});
