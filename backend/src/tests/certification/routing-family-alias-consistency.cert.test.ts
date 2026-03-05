import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"),
  );
}

function sortedStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

describe("Certification: routing-family-alias-consistency", () => {
  const intentConfig = readJson("routing/intent_config.any.json");
  const intentPatterns = readJson("routing/intent_patterns.any.json");
  const operatorFamilies = readJson("routing/operator_families.any.json");

  const configFamilies = Array.isArray(intentConfig?.intentFamilies)
    ? intentConfig.intentFamilies
    : [];
  const patternFamilies =
    intentPatterns?.intentFamilies && typeof intentPatterns.intentFamilies === "object"
      ? intentPatterns.intentFamilies
      : {};
  const opFamilies = Array.isArray(operatorFamilies?.families)
    ? operatorFamilies.families
    : [];

  function findConfigFamily(id: string): any {
    return configFamilies.find((entry: any) => String(entry?.id || "").trim() === id) || null;
  }

  function findOpFamily(id: string): any {
    return opFamilies.find((entry: any) => String(entry?.id || "").trim() === id) || null;
  }

  test("intent_config defaults for connectors and integrations are aligned", () => {
    const defaults = intentConfig?.config?.defaultOperatorByFamily || {};
    expect(String(defaults.connectors || "")).toBe(String(defaults.integrations || ""));
  });

  test("intent_config operatorsAllowed for connectors and integrations are aligned", () => {
    const connectors = findConfigFamily("connectors");
    const integrations = findConfigFamily("integrations");
    expect(connectors).toBeTruthy();
    expect(integrations).toBeTruthy();
    expect(sortedStrings(connectors?.operatorsAllowed)).toEqual(
      sortedStrings(integrations?.operatorsAllowed),
    );
  });

  test("intent_patterns operatorsAllowed for connectors and integrations are aligned", () => {
    expect(sortedStrings(patternFamilies.connectors?.operatorsAllowed)).toEqual(
      sortedStrings(patternFamilies.integrations?.operatorsAllowed),
    );
  });

  test("operator_families has integrations family with connector operators", () => {
    const integrations = findOpFamily("integrations");
    expect(integrations).toBeTruthy();
    const operators = sortedStrings(integrations?.operators);
    expect(operators).toEqual(
      sortedStrings([
        "CONNECT_START",
        "CONNECTOR_SYNC",
        "CONNECTOR_SEARCH",
        "CONNECTOR_STATUS",
        "CONNECTOR_DISCONNECT",
      ]),
    );
  });

  test("write certification gate report", () => {
    const failures: string[] = [];

    const defaults = intentConfig?.config?.defaultOperatorByFamily || {};
    if (String(defaults.connectors || "") !== String(defaults.integrations || "")) {
      failures.push("DEFAULT_OPERATOR_MISMATCH_CONNECTORS_INTEGRATIONS");
    }

    const configConnectors = findConfigFamily("connectors");
    const configIntegrations = findConfigFamily("integrations");
    if (!configConnectors) failures.push("MISSING_CONFIG_FAMILY_CONNECTORS");
    if (!configIntegrations) failures.push("MISSING_CONFIG_FAMILY_INTEGRATIONS");
    if (
      configConnectors &&
      configIntegrations &&
      JSON.stringify(sortedStrings(configConnectors?.operatorsAllowed)) !==
        JSON.stringify(sortedStrings(configIntegrations?.operatorsAllowed))
    ) {
      failures.push("CONFIG_OPERATORS_MISMATCH_CONNECTORS_INTEGRATIONS");
    }

    const patternConnectors = sortedStrings(patternFamilies.connectors?.operatorsAllowed);
    const patternIntegrations = sortedStrings(patternFamilies.integrations?.operatorsAllowed);
    if (patternConnectors.length === 0) failures.push("MISSING_PATTERN_FAMILY_CONNECTORS");
    if (patternIntegrations.length === 0) failures.push("MISSING_PATTERN_FAMILY_INTEGRATIONS");
    if (
      patternConnectors.length > 0 &&
      patternIntegrations.length > 0 &&
      JSON.stringify(patternConnectors) !== JSON.stringify(patternIntegrations)
    ) {
      failures.push("PATTERN_OPERATORS_MISMATCH_CONNECTORS_INTEGRATIONS");
    }

    const integrationsFamily = findOpFamily("integrations");
    if (!integrationsFamily) failures.push("MISSING_OPERATOR_FAMILY_INTEGRATIONS");

    writeCertificationGateReport("routing-family-alias-consistency", {
      passed: failures.length === 0,
      metrics: {
        connectorPatternOperatorCount: patternConnectors.length,
        integrationPatternOperatorCount: patternIntegrations.length,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
