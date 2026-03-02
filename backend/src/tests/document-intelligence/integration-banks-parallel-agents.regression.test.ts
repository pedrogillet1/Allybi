import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function resolveDataBanksRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "data_banks"),
    path.resolve(process.cwd(), "src", "data_banks"),
    path.resolve(process.cwd(), "backend", "src", "data_banks"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot locate data_banks root. Tried: ${candidates.join(", ")}`);
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();

function loadJson(relPath: string): any {
  return JSON.parse(
    fs.readFileSync(path.join(DATA_BANKS_ROOT, relPath), "utf8"),
  );
}

function normalizeSet(values: unknown): Set<string> {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

describe("Integration banks parallel-agent regression", () => {
  test("connector/email operator sets stay coherent across routing, intent, families, contracts, and shapes", () => {
    const connectorsRouting = loadJson("routing/connectors_routing.any.json");
    const emailRouting = loadJson("routing/email_routing.any.json");
    const intentConfig = loadJson("routing/intent_config.any.json");
    const operatorFamilies = loadJson("routing/operator_families.any.json");
    const operatorContracts = loadJson("operators/operator_contracts.any.json");
    const outputShapes = loadJson("operators/operator_output_shapes.any.json");
    const capabilities = loadJson("semantics/capabilities_catalog.any.json");

    const connectorsFromRouting = normalizeSet(
      connectorsRouting?.operators?.canonical,
    );
    const emailFromRouting = normalizeSet(emailRouting?.operators?.canonical);

    const connectorsFromIntent = normalizeSet(
      intentConfig?.intentFamilies?.find((item: any) => item?.id === "connectors")
        ?.operatorsAllowed,
    );
    const emailFromIntent = normalizeSet(
      intentConfig?.intentFamilies?.find((item: any) => item?.id === "email")
        ?.operatorsAllowed,
    );

    const connectorsFromFamily = normalizeSet(
      operatorFamilies?.families?.find((item: any) => item?.id === "connectors")
        ?.operators,
    );
    const emailFromFamily = normalizeSet(
      operatorFamilies?.families?.find((item: any) => item?.id === "email")
        ?.operators,
    );

    const contractsSet = new Set(
      (operatorContracts?.operators || []).map((item: any) =>
        String(item?.id || "").trim(),
      ),
    );
    const shapesSet = new Set(Object.keys(outputShapes?.mapping || {}));
    const capabilitiesSet = normalizeSet(
      capabilities?.groups?.find((item: any) => item?.id === "connectors_email")
        ?.sourceOperators,
    );

    const required = new Set([...connectorsFromRouting, ...emailFromRouting]);
    expect(connectorsFromIntent).toEqual(connectorsFromRouting);
    expect(emailFromIntent).toEqual(emailFromRouting);
    expect(connectorsFromFamily).toEqual(connectorsFromRouting);
    expect(emailFromFamily).toEqual(emailFromRouting);

    for (const operatorId of required) {
      expect(contractsSet.has(operatorId)).toBe(true);
      expect(shapesSet.has(operatorId)).toBe(true);
      expect(capabilitiesSet.has(operatorId)).toBe(true);
    }
  });

  test("integration policy and routing banks include explicit regression cases", () => {
    const connectorsRouting = loadJson("routing/connectors_routing.any.json");
    const emailRouting = loadJson("routing/email_routing.any.json");
    const connectorPermissions = loadJson(
      "policies/allybi_connector_permissions.any.json",
    );
    const allybiIntents = loadJson("routing/allybi_intents.any.json");

    expect((connectorsRouting?.tests?.cases || []).length).toBeGreaterThanOrEqual(
      3,
    );
    expect((emailRouting?.tests?.cases || []).length).toBeGreaterThanOrEqual(5);
    expect(
      (connectorPermissions?.tests?.cases || []).length,
    ).toBeGreaterThanOrEqual(2);
    expect((allybiIntents?.tests?.cases || []).length).toBeGreaterThanOrEqual(2);
  });

  test("integration collision rules use active queryRegexAny and known operators", () => {
    const matrix = loadJson("operators/operator_collision_matrix.any.json");
    const fileActions = loadJson("operators/file_action_operators.any.json");
    const contracts = loadJson("operators/operator_contracts.any.json");

    const knownOps = new Set<string>([
      ...Object.keys(fileActions?.operators || {}).map((id) =>
        String(id || "").trim().toLowerCase(),
      ),
      ...(contracts?.operators || []).map((item: any) =>
        String(item?.id || "").trim().toLowerCase(),
      ),
    ]);

    const rules = Array.isArray(matrix?.rules) ? matrix.rules : [];
    const ids = new Set(
      rules.map((rule: any) => String(rule?.id || "").trim()).filter(Boolean),
    );
    expect(ids.has("CM_0006_connector_vs_doc_retrieval")).toBe(true);
    expect(ids.has("CM_0008_email_draft_vs_email_explain")).toBe(true);

    for (const ruleId of [
      "CM_0006_connector_vs_doc_retrieval",
      "CM_0008_email_draft_vs_email_explain",
    ]) {
      const rule = rules.find((item: any) => item?.id === ruleId);
      const queryRegexAny = rule?.when?.queryRegexAny || {};
      expect((queryRegexAny.en || []).length).toBeGreaterThan(0);
      expect((queryRegexAny.pt || []).length).toBeGreaterThan(0);
      expect((queryRegexAny.es || []).length).toBeGreaterThan(0);

      for (const operator of rule?.when?.operators || []) {
        expect(knownOps.has(String(operator || "").trim().toLowerCase())).toBe(
          true,
        );
      }
    }
  });
});
