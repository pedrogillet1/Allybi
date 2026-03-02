import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

import EditingCapabilityMatrixService from "../../services/editing/capabilities/capabilityMatrix.service";

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
  return JSON.parse(fs.readFileSync(path.join(DATA_BANKS_ROOT, relPath), "utf8"));
}

function normalizedTokens(input: unknown): Set<string> {
  return new Set(
    String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .split("_")
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 1;
  const intersection = Array.from(left).filter((token) => right.has(token))
    .length;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}

function keywordSet(rule: any): Set<string> {
  const out = new Set<string>();
  const keywords = rule?.trigger?.keywords;
  if (!keywords || typeof keywords !== "object") return out;
  for (const values of Object.values(keywords)) {
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const token = String(value || "").trim().toLowerCase();
      if (token) out.add(token);
    }
  }
  return out;
}

function countBilingualPairs(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  if (Array.isArray(node)) {
    return node.reduce((total, item) => total + countBilingualPairs(item), 0);
  }

  let total = 0;
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (
    typeof obj.en === "string" &&
    obj.en.trim() &&
    typeof obj.pt === "string" &&
    obj.pt.trim()
  ) {
    total += 1;
  }

  for (const key of keys) {
    if (!key.endsWith("En")) continue;
    const base = key.slice(0, -2);
    const pair = `${base}Pt`;
    const left = obj[key];
    const right = obj[pair];
    const hasLeft =
      (typeof left === "string" && left.trim()) ||
      (Array.isArray(left) &&
        left.some(
          (value) => typeof value === "string" && String(value).trim().length > 0,
        ));
    const hasRight =
      (typeof right === "string" && right.trim()) ||
      (Array.isArray(right) &&
        right.some(
          (value) => typeof value === "string" && String(value).trim().length > 0,
        ));
    if (
      hasLeft &&
      hasRight
    ) {
      total += 1;
    }
  }

  for (const value of Object.values(obj)) {
    total += countBilingualPairs(value);
  }
  return total;
}

function extractFormulaFunctions(formula: string): string[] {
  return formula.match(/[A-Z][A-Z0-9_]*(?=\s*\()/g) || [];
}

describe("Global meaning layer regression", () => {
  test("taxonomy + archetypes preserve behavior-rich domain coverage", () => {
    const taxonomy = loadJson("semantics/taxonomy/doc_taxonomy.any.json");
    const canonicalDomains = Array.isArray(taxonomy?.config?.canonicalDomains)
      ? taxonomy.config.canonicalDomains.map((domain: any) =>
          String(domain || "").trim(),
        )
      : [];
    expect(canonicalDomains.length).toBeGreaterThan(0);

    const archetypeFields = [
      "expectedSections",
      "headings",
      "expectedTableFamilies",
      "fieldFamilies",
      "redFlags",
      "missingQuestions",
    ];
    const failures: string[] = [];
    let totalClusterItems = 0;
    let totalCoveredItems = 0;

    for (const domain of canonicalDomains) {
      const cluster = Array.isArray(taxonomy?.clusters?.[domain])
        ? taxonomy.clusters[domain]
        : [];
      const archetypesBank = loadJson(`semantics/taxonomy/doc_archetypes/${domain}.any.json`);
      const archetypes = Array.isArray(archetypesBank?.archetypes)
        ? archetypesBank.archetypes
        : [];

      if (archetypes.length < 20) {
        failures.push(`${domain}: low archetype coverage (${archetypes.length})`);
      }

      for (const archetype of archetypes) {
        const id = String(archetype?.id || "<missing>");
        for (const field of archetypeFields) {
          const values = Array.isArray(archetype?.[field]) ? archetype[field] : [];
          if (values.length < 6) {
            failures.push(`${domain}#${id}: ${field} too short (${values.length})`);
          }
          if (values.length % 2 !== 0) {
            failures.push(`${domain}#${id}: ${field} must preserve EN/PT pair symmetry`);
          }
        }
      }

      const archetypeTokenSets = archetypes.map((archetype: any) =>
        normalizedTokens(archetype?.id),
      );
      let covered = 0;

      for (const entry of cluster) {
        const clusterTokens = normalizedTokens(entry);
        let best = 0;
        for (const tokens of archetypeTokenSets) {
          const score = jaccardSimilarity(clusterTokens, tokens);
          if (score > best) best = score;
        }
        if (best >= 0.5) covered += 1;
      }

      totalClusterItems += cluster.length;
      totalCoveredItems += covered;
      const domainCoverage = cluster.length > 0 ? covered / cluster.length : 1;
      if (domainCoverage < 0.55) {
        failures.push(
          `${domain}: cluster/archetype lexical coverage below floor (${domainCoverage.toFixed(3)})`,
        );
      }
    }

    const globalCoverage =
      totalClusterItems > 0 ? totalCoveredItems / totalClusterItems : 1;
    expect(globalCoverage).toBeGreaterThanOrEqual(0.65);
    expect(failures).toEqual([]);
  });

  test("domain semantics resist drift with deterministic conflict behavior", () => {
    const domainDir = path.join(DATA_BANKS_ROOT, "semantics", "domain");
    const files = fs
      .readdirSync(domainDir)
      .filter((name) => name.endsWith(".any.json"))
      .sort();
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    let triggerRuleCount = 0;
    let nonTriggerRuleCount = 0;
    let conflictEdges = 0;

    for (const file of files) {
      const bank = loadJson(path.join("semantics", "domain", file));
      const rules = Array.isArray(bank?.rules) ? bank.rules : [];
      if (!rules.length) {
        failures.push(`${file}: no rules`);
        continue;
      }
      if (!bank?.config?.ruleContract?.requirePrecedence) {
        failures.push(`${file}: config.ruleContract.requirePrecedence missing`);
      }

      const precedenceValues = rules
        .map((rule: any) => Number(rule?.precedence))
        .filter((value: number) => Number.isFinite(value));
      const sortedUnique = Array.from(new Set(precedenceValues)).sort(
        (a, b) => a - b,
      );
      if (
        sortedUnique.length !== rules.length ||
        sortedUnique[0] !== 1 ||
        sortedUnique[sortedUnique.length - 1] !== rules.length ||
        sortedUnique.some((value, index) => value !== index + 1)
      ) {
        failures.push(`${file}: precedence must be contiguous 1..N without gaps`);
      }

      const byId = new Map(
        rules.map((rule: any) => [String(rule?.id || ""), rule]),
      );
      for (const rule of rules) {
        const id = String(rule?.id || "<missing>");
        const conflicts = Array.isArray(rule?.conflictsWith)
          ? rule.conflictsWith
          : [];
        const keys = keywordSet(rule);

        if (keys.size > 0) {
          triggerRuleCount += 1;
          if (!Array.isArray(rule?.trigger?.operators) || !rule.trigger.operators.length) {
            failures.push(`${file}#${id}: trigger operators missing`);
          }
          const question = rule?.failureAction?.questionTemplate;
          if (!String(question?.en || "").trim() || !String(question?.pt || "").trim()) {
            failures.push(`${file}#${id}: failureAction questionTemplate EN/PT missing`);
          }
        } else {
          nonTriggerRuleCount += 1;
          if (countBilingualPairs(rule) === 0) {
            failures.push(`${file}#${id}: non-trigger rule missing bilingual content pairs`);
          }
        }

        for (const conflictId of conflicts) {
          conflictEdges += 1;
          const peer = byId.get(String(conflictId || ""));
          if (!peer) {
            failures.push(`${file}#${id}: conflict references unknown rule ${conflictId}`);
            continue;
          }
          const peerConflicts = Array.isArray(peer?.conflictsWith)
            ? peer.conflictsWith.map((value: any) => String(value || ""))
            : [];
          if (!peerConflicts.includes(id)) {
            failures.push(`${file}#${id}: asymmetric conflict with ${conflictId}`);
          }

          const peerKeys = keywordSet(peer);
          if (keys.size > 0 && peerKeys.size > 0) {
            const overlap = jaccardSimilarity(keys, peerKeys);
            if (overlap > 0.5) {
              failures.push(
                `${file}#${id}<->${conflictId}: keyword overlap too high (${overlap.toFixed(3)})`,
              );
            }
          }
        }
      }
    }

    expect(triggerRuleCount).toBeGreaterThanOrEqual(750);
    expect(nonTriggerRuleCount).toBeGreaterThanOrEqual(500);
    expect(conflictEdges).toBeGreaterThanOrEqual(3000);
    expect(failures).toEqual([]);
  });

  test("entity ambiguity handling survives adversarial samples", () => {
    const entitiesDir = path.join(DATA_BANKS_ROOT, "semantics", "entities");
    const files = fs
      .readdirSync(entitiesDir)
      .filter((name) => name.endsWith(".any.json"))
      .sort();
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    const compiled: Array<{
      file: string;
      id: string;
      regex: RegExp;
      ambiguityPolicy: string;
      confidenceModel: string;
    }> = [];

    for (const file of files) {
      const bank = loadJson(path.join("semantics", "entities", file));
      const rules = Array.isArray(bank?.rules) ? bank.rules : [];
      for (const rule of rules) {
        const id = String(rule?.id || "<missing>");
        const contract = rule?.normalizationContract || {};
        const ambiguityPolicy = String(contract?.ambiguityPolicy || "").trim();
        const confidenceModel = String(contract?.confidenceModel || "").trim();

        if (!ambiguityPolicy) {
          failures.push(`${file}#${id}: ambiguityPolicy missing`);
        }
        if (!confidenceModel) {
          failures.push(`${file}#${id}: confidenceModel missing`);
        }

        try {
          compiled.push({
            file,
            id,
            regex: new RegExp(String(rule?.pattern || ""), "i"),
            ambiguityPolicy,
            confidenceModel,
          });
        } catch {
          failures.push(`${file}#${id}: invalid regex`);
        }
      }
    }

    const adversarialSamples: Array<{ sample: string; minMatches: number }> = [
      { sample: "03/04/2026", minMatches: 3 },
      { sample: "2026-03", minMatches: 2 },
      { sample: "INV-2026-001", minMatches: 3 },
      { sample: "123 Main St", minMatches: 3 },
      { sample: "+1 555-123-4567", minMatches: 2 },
    ];

    let multiBankAmbiguousCases = 0;
    for (const probe of adversarialSamples) {
      const matches = compiled.filter((entry) => entry.regex.test(probe.sample));
      if (matches.length < probe.minMatches) {
        failures.push(
          `adversarial:${probe.sample}: expected >=${probe.minMatches} matches, got ${matches.length}`,
        );
        continue;
      }

      const filesHit = new Set(matches.map((entry) => entry.file));
      if (filesHit.size >= 2) multiBankAmbiguousCases += 1;

      const hasContextualGuard = matches.some(
        (entry) =>
          entry.ambiguityPolicy === "require_context" ||
          entry.ambiguityPolicy === "ask_clarification" ||
          entry.confidenceModel === "contextual_resolution",
      );
      if (!hasContextualGuard) {
        failures.push(`adversarial:${probe.sample}: missing contextual ambiguity guard`);
      }
    }

    expect(multiBankAmbiguousCases).toBeGreaterThanOrEqual(3);
    expect(failures).toEqual([]);
  });

  test("structure semantics preserve deterministic tie-breaks for ambiguous headers", () => {
    const structureDir = path.join(DATA_BANKS_ROOT, "semantics", "structure");
    const files = fs
      .readdirSync(structureDir)
      .filter(
        (name) =>
          name.startsWith("table_header_ontology.") && name.endsWith(".any.json"),
      )
      .sort();
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    const synonymMap = new Map<
      string,
      Array<{
        file: string;
        domain: string;
        canonical: string;
        scope: string;
        disambiguationRuleId: string;
      }>
    >();

    for (const file of files) {
      const bank = loadJson(path.join("semantics", "structure", file));
      const headers = Array.isArray(bank?.headers) ? bank.headers : [];
      const domain = String(bank?.domain || file.split(".")[1] || "").trim();

      for (const row of headers) {
        const canonical = String(row?.canonical || "").trim();
        const synonyms = Array.isArray(row?.synonyms) ? row.synonyms : [];
        const scope = String(row?.scope || "").trim();
        const disambiguationRuleId = String(row?.disambiguationRuleId || "").trim();

        if (!canonical) failures.push(`${file}: missing canonical`);
        if (!(typeof row?.priority === "number" && Number.isFinite(row.priority))) {
          failures.push(`${file}#${canonical}: missing numeric priority`);
        }
        if (synonyms.length < 3) {
          failures.push(`${file}#${canonical}: low synonym coverage (${synonyms.length})`);
        }
        if (!scope.startsWith("table_header:")) {
          failures.push(`${file}#${canonical}: scope must start with table_header:`);
        }
        if (!disambiguationRuleId.startsWith("headers_disambiguation_")) {
          failures.push(`${file}#${canonical}: invalid disambiguationRuleId`);
        }

        for (const raw of synonyms) {
          const key = String(raw || "").trim().toLowerCase();
          if (!key) continue;
          if (!synonymMap.has(key)) synonymMap.set(key, []);
          synonymMap.get(key)!.push({
            file,
            domain,
            canonical,
            scope,
            disambiguationRuleId,
          });
        }
      }
    }

    let ambiguousSynonyms = 0;
    let crossDomainAmbiguousSynonyms = 0;

    for (const [synonym, entries] of synonymMap) {
      const canonicalIds = new Set(entries.map((entry) => entry.canonical));
      if (canonicalIds.size <= 1) continue;
      ambiguousSynonyms += 1;

      const disambiguationIds = new Set(
        entries.map((entry) => entry.disambiguationRuleId).filter(Boolean),
      );
      const domains = new Set(entries.map((entry) => entry.domain).filter(Boolean));
      if (domains.size > 1) crossDomainAmbiguousSynonyms += 1;

      if (disambiguationIds.size < canonicalIds.size) {
        failures.push(
          `synonym:${synonym}: insufficient disambiguation IDs (${disambiguationIds.size}/${canonicalIds.size})`,
        );
      }
    }

    expect(ambiguousSynonyms).toBeGreaterThanOrEqual(300);
    expect(crossDomainAmbiguousSynonyms).toBeGreaterThanOrEqual(150);
    expect(failures).toEqual([]);
  });

  test("capabilities and spreadsheet semantics remain meaning-consistent", () => {
    const spreadsheetSemantics = loadJson("semantics/spreadsheet_semantics.any.json");
    const capabilitiesCatalog = loadJson("semantics/capabilities_catalog.any.json");
    const capabilities = loadJson("semantics/allybi_capabilities.any.json");
    const formulaCatalog = loadJson("semantics/excel_formula_catalog.any.json");

    const knownFunctions = new Set(
      Array.isArray(formulaCatalog?.functions)
        ? formulaCatalog.functions.map((fn: any) => String(fn?.name || "").trim())
        : [],
    );
    const kpis = Array.isArray(spreadsheetSemantics?.kpiDefinitions)
      ? spreadsheetSemantics.kpiDefinitions
      : [];
    const kpiIds = new Set(kpis.map((kpi: any) => String(kpi?.id || "").trim()));

    const failures: string[] = [];
    const formulaFunctionsUsed = new Set<string>();
    let formulaFunctionInvocations = 0;
    for (const kpi of kpis) {
      const id = String(kpi?.id || "<missing>");
      const related = Array.isArray(kpi?.relatedKPIs) ? kpi.relatedKPIs : [];
      for (const relatedId of related) {
        if (!kpiIds.has(String(relatedId || "").trim())) {
          failures.push(`${id}: related KPI missing (${String(relatedId || "")})`);
        }
      }

      const formula = String(kpi?.formula || "");
      for (const fn of extractFormulaFunctions(formula)) {
        formulaFunctionInvocations += 1;
        formulaFunctionsUsed.add(fn);
        if (!knownFunctions.has(fn)) {
          failures.push(`${id}: unknown formula function ${fn}`);
        }
      }
    }

    const spreadsheetOperators = new Set<string>();
    const groups = Array.isArray(capabilitiesCatalog?.groups)
      ? capabilitiesCatalog.groups
      : [];
    for (const group of groups) {
      const id = String(group?.id || "");
      if (id !== "editing" && id !== "xlsx_charts") continue;
      const sourceOperators = Array.isArray(group?.sourceOperators)
        ? group.sourceOperators
        : [];
      for (const operator of sourceOperators) {
        const value = String(operator || "").trim();
        if (value.startsWith("XLSX_")) spreadsheetOperators.add(value);
      }
    }

    for (const operatorId of spreadsheetOperators) {
      const operator = capabilities?.operators?.[operatorId];
      if (!operator) {
        failures.push(`missing capability operator ${operatorId}`);
        continue;
      }
      if (operator?.supported === false) {
        failures.push(`unsupported spreadsheet operator in catalog ${operatorId}`);
      }
    }

    const matrix = new EditingCapabilityMatrixService().build("sheets");
    const matrixRows = new Map(
      matrix.rows.map((row) => [String(row.canonicalOperator || ""), row]),
    );
    for (const operatorId of spreadsheetOperators) {
      const row = matrixRows.get(operatorId);
      if (!row) {
        failures.push(`matrix missing operator ${operatorId}`);
        continue;
      }
      if (!row.supportedInExecutor) {
        failures.push(`operator not executable in matrix ${operatorId}`);
      }
    }

    expect(formulaFunctionsUsed.size).toBeGreaterThanOrEqual(2);
    expect(formulaFunctionInvocations).toBeGreaterThanOrEqual(10);
    expect(matrix.rows.length).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
  });
});
