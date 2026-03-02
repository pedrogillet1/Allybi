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

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".any.json")) out.push(full);
  }
  return out;
}

function countCategoryValue(input: unknown, value: string): number {
  if (Array.isArray(input)) {
    return input.reduce(
      (sum, entry) => sum + countCategoryValue(entry, value),
      0,
    );
  }
  if (input && typeof input === "object") {
    let total = 0;
    for (const [key, nested] of Object.entries(input)) {
      if (key === "category" && nested === value) total += 1;
      total += countCategoryValue(nested, value);
    }
    return total;
  }
  return 0;
}

describe("Global semantics coherence", () => {
  test("taxonomy and bank-map enforce canonical domain normalization", () => {
    const taxonomy = loadJson("semantics/taxonomy/doc_taxonomy.any.json");
    const bankMap = loadJson(
      "semantics/document_intelligence_bank_map.any.json",
    );

    expect(taxonomy?.config?.domainAliases?.operations).toBe("ops");
    expect(taxonomy?.config?.canonicalDomains).toEqual([
      "accounting",
      "finance",
      "legal",
      "medical",
      "ops",
    ]);
    expect(taxonomy?.config?.domainValidation?.failOnUnknown).toBe(true);
    expect(taxonomy?.config?.domainValidation?.enforceCanonicalSet).toBe(true);

    expect(bankMap?.config?.domainAliases?.operations).toBe("ops");
    expect(bankMap?.config?.domainNormalization?.required).toBe(true);
    expect(bankMap?.config?.domainNormalization?.coreDomains).toEqual([
      "accounting",
      "finance",
      "legal",
      "medical",
      "ops",
    ]);
  });

  test("spreadsheet semantics does not use legacy 'operations' category", () => {
    const sheetSemantics = loadJson("semantics/spreadsheet_semantics.any.json");
    expect(sheetSemantics?.config?.domainAliases?.operations).toBe("ops");
    expect(countCategoryValue(sheetSemantics, "operations")).toBe(0);
  });

  test("every domain rule has deterministic precedence contract fields", () => {
    const domainDir = path.join(DATA_BANKS_ROOT, "semantics", "domain");
    const files = walkFiles(domainDir);
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const filePath of files) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      const bank = loadJson(rel);
      const rules = Array.isArray(bank?.rules) ? bank.rules : [];

      if (!bank?.config?.ruleContract?.requirePrecedence) {
        failures.push(`${rel}: config.ruleContract.requirePrecedence missing`);
      }

      for (const rule of rules) {
        const id = String(rule?.id || "<missing>");
        if (
          !(
            typeof rule?.precedence === "number" &&
            Number.isFinite(rule.precedence)
          )
        ) {
          failures.push(`${rel}#${id}: missing numeric precedence`);
        }
        if (!Array.isArray(rule?.conflictsWith)) {
          failures.push(`${rel}#${id}: conflictsWith must be array`);
        }
        if (
          !["first_match", "highest_confidence", "ask_clarification"].includes(
            String(rule?.resolutionPolicy || ""),
          )
        ) {
          failures.push(`${rel}#${id}: invalid resolutionPolicy`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("domain curation is deep (profiles, rationale, diversity, conflict coverage)", () => {
    const domainDir = path.join(DATA_BANKS_ROOT, "semantics", "domain");
    const files = walkFiles(domainDir);
    const failures: string[] = [];

    let totalRules = 0;
    let rulesWithConflicts = 0;
    const globalPolicies = new Set<string>();

    for (const filePath of files) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      const bank = loadJson(rel);
      const rules = Array.isArray(bank?.rules) ? bank.rules : [];
      totalRules += rules.length;

      if (!String(bank?.config?.curationProfile?.strategy || "").trim()) {
        failures.push(`${rel}: config.curationProfile.strategy missing`);
      }

      const filePolicies = new Set<string>();
      for (const rule of rules) {
        const id = String(rule?.id || "<missing>");
        const policy = String(rule?.resolutionPolicy || "");
        if (policy) {
          filePolicies.add(policy);
          globalPolicies.add(policy);
        }
        if (
          !Array.isArray(rule?.curation?.priorityDrivers) ||
          !rule.curation.priorityDrivers.length
        ) {
          failures.push(`${rel}#${id}: missing curation.priorityDrivers`);
        }
        if (
          Array.isArray(rule?.conflictsWith) &&
          rule.conflictsWith.length > 0
        ) {
          rulesWithConflicts += 1;
        }
      }

      if (rules.length >= 25 && filePolicies.size < 2) {
        failures.push(`${rel}: low policy diversity (${filePolicies.size})`);
      }
    }

    const conflictRatio = totalRules > 0 ? rulesWithConflicts / totalRules : 0;
    if (globalPolicies.size < 3) {
      failures.push(
        `domain global policy diversity too low (${globalPolicies.size})`,
      );
    }
    if (conflictRatio < 0.05) {
      failures.push(
        `domain conflict coverage too low (${conflictRatio.toFixed(3)})`,
      );
    }

    expect(failures).toEqual([]);
  });

  test("every entity rule has normalization contract metadata", () => {
    const entitiesDir = path.join(DATA_BANKS_ROOT, "semantics", "entities");
    const files = walkFiles(entitiesDir);
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const filePath of files) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      const bank = loadJson(rel);
      const rules = Array.isArray(bank?.rules) ? bank.rules : [];
      for (const rule of rules) {
        const id = String(rule?.id || "<missing>");
        const contract = rule?.normalizationContract;
        if (!contract || typeof contract !== "object") {
          failures.push(`${rel}#${id}: missing normalizationContract`);
          continue;
        }
        if (!String(contract.type || "").trim()) {
          failures.push(`${rel}#${id}: normalizationContract.type missing`);
        }
        if (!String(contract.localeSensitivity || "").trim()) {
          failures.push(
            `${rel}#${id}: normalizationContract.localeSensitivity missing`,
          );
        }
        if (!String(contract.ambiguityPolicy || "").trim()) {
          failures.push(
            `${rel}#${id}: normalizationContract.ambiguityPolicy missing`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("entity curation is deep (contextual coverage and explicit rationale)", () => {
    const entitiesDir = path.join(DATA_BANKS_ROOT, "semantics", "entities");
    const files = walkFiles(entitiesDir);

    const failures: string[] = [];
    let totalRules = 0;
    let contextualRules = 0;
    const policies = new Set<string>();

    for (const filePath of files) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      const bank = loadJson(rel);
      const rules = Array.isArray(bank?.rules) ? bank.rules : [];

      if (!bank?.config?.normalizationContract?.requireCurationReason) {
        failures.push(
          `${rel}: config.normalizationContract.requireCurationReason missing`,
        );
      }

      for (const rule of rules) {
        totalRules += 1;
        const id = String(rule?.id || "<missing>");
        const contract = rule?.normalizationContract || {};
        const policy = String(contract?.ambiguityPolicy || "");
        if (policy) policies.add(policy);

        if (!String(contract?.confidenceModel || "").trim()) {
          failures.push(
            `${rel}#${id}: normalizationContract.confidenceModel missing`,
          );
        }
        if (!Array.isArray(contract?.requiresContextKeys)) {
          failures.push(
            `${rel}#${id}: normalizationContract.requiresContextKeys must be array`,
          );
        }
        if (!String(contract?.curationReason || "").trim()) {
          failures.push(
            `${rel}#${id}: normalizationContract.curationReason missing`,
          );
        }
        if (String(contract?.confidenceModel) === "contextual_resolution") {
          contextualRules += 1;
        }
      }
    }

    const contextualRatio = totalRules > 0 ? contextualRules / totalRules : 0;
    if (policies.size < 3) {
      failures.push(
        `entity ambiguity policy diversity too low (${policies.size})`,
      );
    }
    if (contextualRatio < 0.1) {
      failures.push(
        `entity contextual coverage too low (${contextualRatio.toFixed(3)})`,
      );
    }

    expect(failures).toEqual([]);
  });

  test("structure banks carry deterministic tie-break metadata", () => {
    const structureDir = path.join(DATA_BANKS_ROOT, "semantics", "structure");
    const files = walkFiles(structureDir);
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    const candidateArrays = [
      "headings",
      "cues",
      "patterns",
      "headers",
      "levels",
      "formats",
      "formatFamilies",
    ];

    for (const filePath of files) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      const bank = loadJson(rel);
      if (!bank?.config?.tiebreakContract?.deterministic) {
        failures.push(`${rel}: config.tiebreakContract.deterministic missing`);
      }

      for (const key of candidateArrays) {
        const rows = Array.isArray(bank?.[key]) ? bank[key] : [];
        for (const row of rows) {
          const rowId = String(
            row?.id || row?.canonical || row?.level || "<row>",
          ).trim();
          if (
            !(
              typeof row?.priority === "number" && Number.isFinite(row.priority)
            )
          ) {
            failures.push(`${rel}:${key}:${rowId}: missing numeric priority`);
          }
          if (!String(row?.scope || "").trim()) {
            failures.push(`${rel}:${key}:${rowId}: missing scope`);
          }
          if (!String(row?.disambiguationRuleId || "").trim()) {
            failures.push(
              `${rel}:${key}:${rowId}: missing disambiguationRuleId`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("structure curation is deep (non-default disambiguation and rationale coverage)", () => {
    const structureDir = path.join(DATA_BANKS_ROOT, "semantics", "structure");
    const files = walkFiles(structureDir);
    const candidateArrays = [
      "headings",
      "cues",
      "patterns",
      "headers",
      "levels",
      "formats",
      "formatFamilies",
    ];

    const failures: string[] = [];
    let totalRows = 0;
    let nonDefaultDisambiguation = 0;
    let rowsWithReason = 0;

    for (const filePath of files) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      const bank = loadJson(rel);
      const fileDisambIds = new Set<string>();

      if (!String(bank?.config?.tiebreakContract?.strategy || "").trim()) {
        failures.push(`${rel}: config.tiebreakContract.strategy missing`);
      }

      for (const key of candidateArrays) {
        const rows = Array.isArray(bank?.[key]) ? bank[key] : [];
        for (const row of rows) {
          totalRows += 1;
          const disamb = String(row?.disambiguationRuleId || "");
          if (disamb && !disamb.startsWith("structure_tiebreak_default")) {
            nonDefaultDisambiguation += 1;
            fileDisambIds.add(disamb);
          }
          if (String(row?.curationReason || "").trim()) {
            rowsWithReason += 1;
          }
        }
      }

      if (fileDisambIds.size < 3) {
        failures.push(
          `${rel}: disambiguation IDs not curated enough (${fileDisambIds.size})`,
        );
      }
    }

    if (nonDefaultDisambiguation !== totalRows) {
      failures.push(
        `structure has default disambiguation IDs remaining (${nonDefaultDisambiguation}/${totalRows})`,
      );
    }
    if (rowsWithReason !== totalRows) {
      failures.push(
        `structure curationReason coverage incomplete (${rowsWithReason}/${totalRows})`,
      );
    }

    expect(failures).toEqual([]);
  });

  test("help editable operation claims map to real allybi operators", () => {
    const help = loadJson("microcopy/koda_product_help.any.json");
    const capabilities = loadJson("semantics/allybi_capabilities.any.json");

    const claims = Array.isArray(help?.editableOperationClaims)
      ? help.editableOperationClaims
      : [];
    expect(claims.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const claim of claims) {
      const claimId = String(claim?.id || "<missing>");
      const operators = Array.isArray(claim?.operators) ? claim.operators : [];
      for (const operatorId of operators) {
        const operator = capabilities?.operators?.[operatorId];
        if (!operator) {
          failures.push(`${claimId}: missing operator ${operatorId}`);
          continue;
        }
        if (!String(operator?.runtimeOperator || "").trim()) {
          failures.push(
            `${claimId}: operator ${operatorId} missing runtimeOperator`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
