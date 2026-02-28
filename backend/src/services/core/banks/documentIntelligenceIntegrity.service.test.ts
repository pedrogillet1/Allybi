import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import * as fs from "fs";

jest.mock("./bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
  getBankLoaderInstance: jest.fn(),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(),
}));

import { getBankLoaderInstance, getOptionalBank } from "./bankLoader.service";
import { DocumentIntelligenceIntegrityService } from "./documentIntelligenceIntegrity.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;
const mockedGetBankLoaderInstance =
  getBankLoaderInstance as jest.MockedFunction<typeof getBankLoaderInstance>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;

describe("DocumentIntelligenceIntegrityService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedGetBankLoaderInstance.mockReturnValue({
      getRegistryEntry: jest.fn(),
    } as any);

    mockedExistsSync.mockReturnValue(true);
  });

  test("fails when map bank is missing", () => {
    mockedGetOptionalBank.mockReturnValue(null);

    const result = new DocumentIntelligenceIntegrityService().validate();

    expect(result.ok).toBe(false);
    expect(result.missingMapBank).toBe(true);
    expect(result.mapRequiredCoreCount).toBe(0);
  });

  test("passes when all required core banks, registry entries, and files exist", () => {
    const mapBank = {
      requiredCoreBankIds: ["doc_taxonomy", "headings_map"],
      optionalBankIds: ["pattern_library"],
    };

    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "document_intelligence_bank_map") return mapBank as any;
      if (id === "doc_taxonomy")
        return { _meta: { id: "doc_taxonomy" } } as any;
      if (id === "headings_map")
        return { _meta: { id: "headings_map" } } as any;
      if (id === "bank_dependencies") {
        return {
          banks: [{ id: "doc_taxonomy" }, { id: "headings_map" }],
        } as any;
      }
      if (
        id === "document_intelligence_schema_registry" ||
        id === "document_intelligence_dependency_graph" ||
        id === "document_intelligence_runtime_wiring_gates"
      ) {
        return { _meta: { id } } as any;
      }
      if (id === "document_intelligence_usage_manifest") {
        return {
          consumedBankIds: ["doc_taxonomy", "headings_map", "pattern_library"],
        } as any;
      }
      if (id === "document_intelligence_orphan_allowlist") {
        return {
          allowlistedBankIds: [],
          allowlistedIdPrefixes: [],
          allowlistedIdPatterns: [],
        } as any;
      }
      return null as any;
    });

    const getRegistryEntry = jest.fn((id: string) => {
      if (id === "doc_taxonomy") {
        return { path: "semantics/taxonomy/doc_taxonomy.any.json" };
      }
      if (id === "headings_map") {
        return { path: "semantics/structure/headings_map.any.json" };
      }
      return null;
    });

    mockedGetBankLoaderInstance.mockReturnValue({
      getRegistryEntry,
    } as any);

    const result = new DocumentIntelligenceIntegrityService().validate();

    expect(result.ok).toBe(true);
    expect(result.missingMapBank).toBe(false);
    expect(result.missingCoreBanks).toHaveLength(0);
    expect(result.missingRegistryEntries).toHaveLength(0);
    expect(result.missingBankFiles).toHaveLength(0);
    expect(result.mapRequiredCoreCount).toBe(2);
    expect(result.mapOptionalCount).toBe(1);
  });

  test("reports missing core banks and missing registry entries", () => {
    const mapBank = {
      requiredCoreBankIds: ["doc_taxonomy", "headings_map"],
      optionalBankIds: [],
    };

    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "document_intelligence_bank_map") return mapBank as any;
      if (id === "doc_taxonomy")
        return { _meta: { id: "doc_taxonomy" } } as any;
      return null as any;
    });

    mockedGetBankLoaderInstance.mockReturnValue({
      getRegistryEntry: jest.fn((id: string) =>
        id === "doc_taxonomy"
          ? { path: "semantics/taxonomy/doc_taxonomy.any.json" }
          : null,
      ),
    } as any);

    const result = new DocumentIntelligenceIntegrityService().validate();

    expect(result.ok).toBe(false);
    expect(result.missingCoreBanks).toContain("headings_map");
    expect(result.missingRegistryEntries).toContain("headings_map");
  });
});
