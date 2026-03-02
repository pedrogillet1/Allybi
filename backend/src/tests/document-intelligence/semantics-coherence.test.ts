import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function resolveDataBanksRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "data_banks"),
    path.resolve(process.cwd(), "src", "data_banks"),
    path.resolve(process.cwd(), "backend", "src", "data_banks"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Cannot locate data_banks root. Tried: ${candidates.join(", ")}`,
  );
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();

function loadJson(relPath: string): any {
  const fullPath = path.join(DATA_BANKS_ROOT, relPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw);
}

describe("Semantics coherence", () => {
  test("capabilities catalog exposes engine caveat for sheets-bridge chart ops", () => {
    const catalog = loadJson("semantics/capabilities_catalog.any.json");
    const capabilities = loadJson("semantics/allybi_capabilities.any.json");

    const chartGroup = Array.isArray(catalog?.groups)
      ? catalog.groups.find((group: any) => group?.id === "xlsx_charts")
      : null;
    expect(chartGroup).toBeTruthy();

    const chartOps = Array.isArray(chartGroup?.sourceOperators)
      ? chartGroup.sourceOperators
      : [];
    const requiresBridge = chartOps.every(
      (operatorId: string) =>
        capabilities?.operators?.[operatorId]?.engine ===
        "sheets_bridge_required",
    );
    expect(requiresBridge).toBe(true);

    expect(chartGroup?.constraints?.runtime?.engineRequirement).toBe(
      "sheets_bridge_required",
    );
  });

  test("capabilities catalog keeps connector availability constraints explicit", () => {
    const catalog = loadJson("semantics/capabilities_catalog.any.json");
    const connectorGroup = Array.isArray(catalog?.groups)
      ? catalog.groups.find((group: any) => group?.id === "connectors_email")
      : null;

    expect(connectorGroup).toBeTruthy();
    expect(
      connectorGroup?.constraints?.availability?.requiresActiveConnector,
    ).toBe(true);
    expect(
      connectorGroup?.constraints?.availability?.requiresPermissionsForSend,
    ).toBe(true);
  });
});
