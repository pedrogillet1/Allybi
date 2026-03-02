import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DataBankLoaderService, DataBankError } from "./dataBankLoader.service";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeMeta(id: string) {
  return {
    id,
    version: "1.0.0",
    description: `test ${id}`,
    languages: ["any"],
    lastUpdated: "2026-02-28",
  };
}

function envAll(value: boolean) {
  return {
    production: value,
    staging: value,
    dev: value,
    local: value,
  };
}

describe("DataBankLoaderService hardening", () => {
  test("rejects unknown registry categories when bank_manifest strict category policy is enabled", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "koda-banks-cats-"));

    writeJson(path.join(root, "manifest/bank_manifest.any.json"), {
      _meta: makeMeta("bank_manifest"),
      config: {
        enabled: true,
        strictCategories: true,
        failOnUnknownCategory: true,
      },
      allowedCategoryIds: ["manifest"],
    });

    writeJson(path.join(root, "manifest/bank_registry.any.json"), {
      _meta: makeMeta("bank_registry"),
      config: { enabled: true },
      loadOrder: ["manifest", "mystery"],
      banks: [
        {
          id: "mystery_bank",
          category: "mystery",
          path: "mystery/mystery_bank.any.json",
          filename: "mystery_bank.any.json",
          version: "1.0.0",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(false),
        },
      ],
    });

    const loader = new DataBankLoaderService({
      rootDir: root,
      env: "dev",
      strict: true,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
    });

    await expect(loader.loadAll()).rejects.toThrow(
      /categories not allowed by bank_manifest/i,
    );
  });

  test("rejects registry categories missing from loadOrder in strict mode", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "koda-banks-loadorder-"),
    );

    writeJson(path.join(root, "manifest/bank_manifest.any.json"), {
      _meta: makeMeta("bank_manifest"),
      config: {
        enabled: true,
        strictCategories: true,
        failOnUnknownCategory: true,
      },
      allowedCategoryIds: ["manifest", "semantics"],
    });

    writeJson(path.join(root, "manifest/bank_registry.any.json"), {
      _meta: makeMeta("bank_registry"),
      config: { enabled: true },
      loadOrder: ["manifest"],
      banks: [
        {
          id: "semantic_bank",
          category: "semantics",
          path: "semantics/semantic_bank.any.json",
          filename: "semantic_bank.any.json",
          version: "1.0.0",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(false),
        },
      ],
    });

    const loader = new DataBankLoaderService({
      rootDir: root,
      env: "dev",
      strict: true,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
    });

    await expect(loader.loadAll()).rejects.toThrow(
      /categories missing from loadOrder/i,
    );
  });

  test("rejects dependency overlays missing registry nodes in strict mode", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "koda-banks-deps-"));

    writeJson(path.join(root, "manifest/bank_manifest.any.json"), {
      _meta: makeMeta("bank_manifest"),
      config: {
        enabled: true,
        strictCategories: true,
        failOnUnknownCategory: true,
      },
      allowedCategoryIds: ["manifest", "semantics"],
    });

    writeJson(path.join(root, "manifest/bank_registry.any.json"), {
      _meta: makeMeta("bank_registry"),
      config: { enabled: true },
      loadOrder: ["manifest", "semantics"],
      banks: [
        {
          id: "alpha_bank",
          category: "semantics",
          path: "semantics/alpha_bank.any.json",
          filename: "alpha_bank.any.json",
          version: "1.0.0",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(false),
        },
        {
          id: "beta_bank",
          category: "semantics",
          path: "semantics/beta_bank.any.json",
          filename: "beta_bank.any.json",
          version: "1.0.0",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(false),
        },
      ],
    });

    writeJson(path.join(root, "manifest/bank_dependencies.any.json"), {
      _meta: makeMeta("bank_dependencies"),
      config: {
        enabled: true,
        failOnMissingNode: true,
        failOnCycle: true,
      },
      banks: [{ id: "alpha_bank", dependsOn: [] }],
    });

    const loader = new DataBankLoaderService({
      rootDir: root,
      env: "dev",
      strict: true,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
    });

    await expect(loader.loadAll()).rejects.toThrow(
      /missing nodes for registered banks/i,
    );
  });

  test("rejects registry entries that point to _deprecated paths", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "koda-banks-deprecated-"),
    );
    writeJson(path.join(root, "manifest/bank_registry.any.json"), {
      _meta: makeMeta("bank_registry"),
      config: { enabled: true },
      loadOrder: ["manifest"],
      banks: [
        {
          id: "legacy_bank",
          category: "manifest",
          path: "_deprecated/legacy_bank.any.json",
          filename: "legacy_bank.any.json",
          version: "1.0.0",
          enabledByEnv: {
            production: true,
            staging: true,
            dev: true,
            local: true,
          },
          requiredByEnv: {
            production: false,
            staging: false,
            dev: false,
            local: false,
          },
        },
      ],
    });

    const loader = new DataBankLoaderService({
      rootDir: root,
      env: "dev",
      strict: true,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
    });

    await expect(loader.loadAll()).rejects.toThrow(/deprecated bank path/i);
  });

  test("uses top-level schema bank payload for validation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "koda-banks-schema-"));

    writeJson(path.join(root, "manifest/bank_registry.any.json"), {
      _meta: makeMeta("bank_registry"),
      config: { enabled: true },
      loadOrder: ["schemas", "semantics"],
      banks: [
        {
          id: "custom_schema",
          category: "schemas",
          path: "schemas/custom_schema.any.json",
          filename: "custom_schema.any.json",
          version: "1.0.0",
          enabledByEnv: {
            production: true,
            staging: true,
            dev: true,
            local: true,
          },
          requiredByEnv: {
            production: true,
            staging: true,
            dev: true,
            local: true,
          },
        },
        {
          id: "sample_bank",
          category: "semantics",
          path: "semantics/sample_bank.any.json",
          filename: "sample_bank.any.json",
          version: "1.0.0",
          schemaId: "custom_schema",
          enabledByEnv: {
            production: true,
            staging: true,
            dev: true,
            local: true,
          },
          requiredByEnv: {
            production: true,
            staging: true,
            dev: true,
            local: true,
          },
        },
      ],
    });

    writeJson(path.join(root, "schemas/custom_schema.any.json"), {
      _meta: makeMeta("custom_schema"),
      config: { enabled: true },
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["_meta", "config", "requiredArray"],
      properties: {
        _meta: { type: "object" },
        config: { type: "object" },
        requiredArray: { type: "array" },
      },
      additionalProperties: true,
    });

    writeJson(path.join(root, "semantics/sample_bank.any.json"), {
      _meta: makeMeta("sample_bank"),
      config: { enabled: true },
      note: "missing requiredArray on purpose",
    });

    const loader = new DataBankLoaderService({
      rootDir: root,
      env: "dev",
      strict: true,
      validateSchemas: true,
      allowEmptyChecksumsInNonProd: true,
    });

    let compiledRequiredKeys: string[] = [];
    (loader as any).ajv = {
      compile: (schema: any) => {
        compiledRequiredKeys = Array.isArray(schema?.required)
          ? [...schema.required]
          : [];
        const validate = (data: any) => {
          const missing = compiledRequiredKeys.filter(
            (key) => !(key in (data || {})),
          );
          (validate as any).errors =
            missing.length > 0
              ? missing.map((key) => ({
                  keyword: "required",
                  message: `must have required property '${key}'`,
                }))
              : null;
          return missing.length === 0;
        };
        return validate;
      },
    };

    await expect(loader.loadAll()).rejects.toThrow(DataBankError);
    await expect(loader.loadAll()).rejects.toThrow(/schema validation failed/i);
    expect(compiledRequiredKeys).toContain("requiredArray");
  });

  test("rejects alias collisions in strict mode", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "koda-banks-aliases-"));

    writeJson(path.join(root, "manifest/bank_registry.any.json"), {
      _meta: makeMeta("bank_registry"),
      config: { enabled: true },
      loadOrder: ["semantics"],
      banks: [
        {
          id: "alpha_bank",
          category: "semantics",
          path: "semantics/alpha_bank.any.json",
          filename: "alpha_bank.any.json",
          version: "1.0.0",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(false),
        },
        {
          id: "beta_bank",
          category: "semantics",
          path: "semantics/beta_bank.any.json",
          filename: "beta_bank.any.json",
          version: "1.0.0",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(false),
        },
      ],
    });

    writeJson(path.join(root, "manifest/bank_aliases.any.json"), {
      _meta: makeMeta("bank_aliases"),
      config: {
        enabled: true,
        caseSensitive: false,
        collapseWhitespace: true,
        stripDiacritics: true,
        failOnCollision: true,
        failOnDanglingAliasByEnv: envAll(true),
      },
      aliases: [
        { alias: "legacy.search", canonicalId: "alpha_bank" },
        { alias: "Legacy.Search", canonicalId: "beta_bank" },
      ],
    });

    writeJson(path.join(root, "manifest/bank_dependencies.any.json"), {
      _meta: makeMeta("bank_dependencies"),
      config: {
        enabled: true,
      },
      banks: [],
    });

    writeJson(path.join(root, "semantics/alpha_bank.any.json"), {
      _meta: makeMeta("alpha_bank"),
      config: { enabled: true },
      rules: [{ id: "a1" }],
    });
    writeJson(path.join(root, "semantics/beta_bank.any.json"), {
      _meta: makeMeta("beta_bank"),
      config: { enabled: true },
      rules: [{ id: "b1" }],
    });

    const loader = new DataBankLoaderService({
      rootDir: root,
      env: "dev",
      strict: true,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
    });

    await expect(loader.loadAll()).rejects.toThrow(/alias collision/i);
  });

  test("rejects orphan document intelligence banks in strict mode", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "koda-banks-orphans-"));

    writeJson(path.join(root, "manifest/bank_registry.any.json"), {
      _meta: makeMeta("bank_registry"),
      config: { enabled: true },
      loadOrder: ["manifest", "schemas", "semantics"],
      banks: [
        {
          id: "bank_schema",
          category: "schemas",
          path: "schemas/bank_schema.any.json",
          filename: "bank_schema.any.json",
          version: "1.0.0",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "document_intelligence_manifest_schema",
          category: "schemas",
          path: "schemas/document_intelligence_manifest_schema.any.json",
          filename: "document_intelligence_manifest_schema.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "document_intelligence_bank_map",
          category: "semantics",
          path: "semantics/document_intelligence_bank_map.any.json",
          filename: "document_intelligence_bank_map.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "doc_taxonomy",
          category: "semantics",
          path: "semantics/doc_taxonomy.any.json",
          filename: "doc_taxonomy.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "document_intelligence_schema_registry",
          category: "manifest",
          path: "manifest/document_intelligence_schema_registry.any.json",
          filename: "document_intelligence_schema_registry.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "document_intelligence_dependency_graph",
          category: "manifest",
          path: "manifest/document_intelligence_dependency_graph.any.json",
          filename: "document_intelligence_dependency_graph.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "document_intelligence_usage_manifest",
          category: "manifest",
          path: "manifest/document_intelligence_usage_manifest.any.json",
          filename: "document_intelligence_usage_manifest.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "document_intelligence_orphan_allowlist",
          category: "manifest",
          path: "manifest/document_intelligence_orphan_allowlist.any.json",
          filename: "document_intelligence_orphan_allowlist.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
        {
          id: "document_intelligence_runtime_wiring_gates",
          category: "manifest",
          path: "manifest/document_intelligence_runtime_wiring_gates.any.json",
          filename: "document_intelligence_runtime_wiring_gates.any.json",
          version: "1.0.0",
          schemaId: "bank_schema",
          enabledByEnv: envAll(true),
          requiredByEnv: envAll(true),
        },
      ],
    });

    writeJson(path.join(root, "manifest/bank_aliases.any.json"), {
      _meta: makeMeta("bank_aliases"),
      config: { enabled: true },
      aliases: {},
    });

    writeJson(path.join(root, "manifest/bank_dependencies.any.json"), {
      _meta: makeMeta("bank_dependencies"),
      config: {
        enabled: true,
        failOnMissingNode: true,
      },
      banks: [
        { id: "bank_schema", dependsOn: [] },
        { id: "doc_taxonomy", dependsOn: [] },
        { id: "document_intelligence_bank_map", dependsOn: [] },
        { id: "document_intelligence_manifest_schema", dependsOn: [] },
        { id: "document_intelligence_schema_registry", dependsOn: [] },
        { id: "document_intelligence_dependency_graph", dependsOn: [] },
        { id: "document_intelligence_usage_manifest", dependsOn: [] },
        { id: "document_intelligence_orphan_allowlist", dependsOn: [] },
        { id: "document_intelligence_runtime_wiring_gates", dependsOn: [] },
      ],
    });

    writeJson(
      path.join(root, "semantics/document_intelligence_bank_map.any.json"),
      {
        _meta: makeMeta("document_intelligence_bank_map"),
        config: { enabled: true },
        requiredCoreBankIds: ["doc_taxonomy"],
        optionalBankIds: [],
      },
    );
    writeJson(path.join(root, "semantics/doc_taxonomy.any.json"), {
      _meta: makeMeta("doc_taxonomy"),
      config: { enabled: true },
      typeDefinitions: [{ id: "invoice" }],
    });
    writeJson(path.join(root, "schemas/bank_schema.any.json"), {
      _meta: makeMeta("bank_schema"),
      config: { enabled: true },
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["_meta", "config"],
      additionalProperties: true,
    });
    writeJson(
      path.join(root, "schemas/document_intelligence_manifest_schema.any.json"),
      {
        _meta: makeMeta("document_intelligence_manifest_schema"),
        config: { enabled: true },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          additionalProperties: true,
        },
      },
    );
    writeJson(
      path.join(
        root,
        "manifest/document_intelligence_schema_registry.any.json",
      ),
      {
        _meta: makeMeta("document_intelligence_schema_registry"),
        config: {
          enabled: true,
          failOnMissingAssignmentsInStrict: true,
          failOnSchemaMismatchInStrict: true,
        },
        schemaFamilies: [],
        schemaAssignments: [
          { bankId: "doc_taxonomy", schemaId: "bank_schema" },
          {
            bankId: "document_intelligence_manifest_schema",
            schemaId: "bank_schema",
          },
          {
            bankId: "document_intelligence_schema_registry",
            schemaId: "bank_schema",
          },
          {
            bankId: "document_intelligence_dependency_graph",
            schemaId: "bank_schema",
          },
          {
            bankId: "document_intelligence_usage_manifest",
            schemaId: "bank_schema",
          },
          {
            bankId: "document_intelligence_orphan_allowlist",
            schemaId: "bank_schema",
          },
          {
            bankId: "document_intelligence_runtime_wiring_gates",
            schemaId: "bank_schema",
          },
        ],
      },
    );
    writeJson(
      path.join(
        root,
        "manifest/document_intelligence_dependency_graph.any.json",
      ),
      {
        _meta: makeMeta("document_intelligence_dependency_graph"),
        config: { enabled: true },
        edges: [],
      },
    );
    writeJson(
      path.join(root, "manifest/document_intelligence_usage_manifest.any.json"),
      {
        _meta: makeMeta("document_intelligence_usage_manifest"),
        config: { enabled: true, failOnOrphanInStrict: true },
        runtimeConsumers: [{ id: "test-consumer", path: "src/test.ts" }],
        consumedBankIds: [],
        consumedIdPrefixes: [],
        consumedIdPatterns: [],
      },
    );
    writeJson(
      path.join(
        root,
        "manifest/document_intelligence_orphan_allowlist.any.json",
      ),
      {
        _meta: makeMeta("document_intelligence_orphan_allowlist"),
        config: { enabled: true },
        allowlistedBankIds: [],
        allowlistedIdPrefixes: [],
        allowlistedIdPatterns: [],
      },
    );
    writeJson(
      path.join(
        root,
        "manifest/document_intelligence_runtime_wiring_gates.any.json",
      ),
      {
        _meta: makeMeta("document_intelligence_runtime_wiring_gates"),
        config: { enabled: true },
        gates: [
          {
            id: "gate_doc_taxonomy_loaded",
            requiredBanks: ["doc_taxonomy"],
          },
        ],
      },
    );

    const loader = new DataBankLoaderService({
      rootDir: root,
      env: "dev",
      strict: true,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
    });

    await expect(loader.loadAll()).rejects.toThrow(/orphan banks detected/i);
  });
});
