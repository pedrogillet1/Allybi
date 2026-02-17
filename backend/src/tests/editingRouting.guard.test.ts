import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

function readRepoFile(relativePath: string): string {
  const p = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(p, "utf8");
}

describe("editing routing guardrails", () => {
  test("main editing entry path does not use legacy viewer phrase gates", () => {
    const src = readRepoFile("src/services/prismaChat.service.ts");
    expect(src).not.toContain("viewerWantsChart");
    expect(src).not.toContain("viewerWantsTable");
    expect(src).not.toContain("viewerWantsColumn");
    expect(src).not.toContain("viewerWantsCompute");
    expect(src).not.toContain("isViewerLikelyEditInstruction");
    expect(src).not.toContain("detectInsertBelowLastBullet");
  });

  test("chat routing paths avoid legacy connector fallback detectors", () => {
    const src = readRepoFile("src/services/prismaChat.service.ts");
    expect(src).not.toContain("const composeQuery = await this.detectComposeQuery");
    expect(src).not.toContain("const latestConnector = await this.detectLatestConnectorQuery");
    expect(src).not.toContain("connectorAction = await this.detectConnectorActionQuery");
    expect(src).not.toContain("this.isEmailDocFusionRequest(req.message)");
    expect(src).not.toContain("private async detectComposeQuery(");
    expect(src).not.toContain("private async detectLatestConnectorQuery(");
    expect(src).not.toContain("private async detectConnectorActionQuery(");
    expect(src).not.toContain("private isEmailDocFusionRequest(");
    expect(src).not.toContain("private parseConnectorProviderHint(");
    expect(src).not.toContain("private isConnectorActionRequest(");
    expect(src).not.toContain("private extractConnectorSearchQuery(");
    expect(src).not.toContain("legacy fallback");
  });

  test("operator alias normalization is domain-deterministic (no phrase heuristics)", () => {
    const src = readRepoFile("src/services/editing/editOperatorAliases.service.ts");
    expect(src).not.toContain("looksLikeChartRequest");
    expect(src).not.toContain("looksLikeTableOrComputeRequest");
  });
});
