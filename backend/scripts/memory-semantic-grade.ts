/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";

type Severity = "pass" | "warn" | "fail";

type Finding = {
  id: string;
  severity: Severity;
  scoreImpact: number;
  summary: string;
  evidence: string[];
};

type Category = {
  id: string;
  name: string;
  maxScore: number;
  score: number;
  findings: Finding[];
};

type GradeReport = {
  generatedAt: string;
  repoRoot: string;
  scope: string;
  overall: {
    maxScore: number;
    score: number;
    percentage: number;
    letter: string;
  };
  categories: Category[];
  hardFacts: Record<string, unknown>;
  codexParityAssessment: {
    parityLevel: "none" | "partial" | "near" | "high";
    blockers: string[];
  };
};

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

function parseJson(relPath: string): any {
  return JSON.parse(read(relPath));
}

function contains(text: string, regex: RegExp): boolean {
  return regex.test(text);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function letterFromPct(pct: number): string {
  if (pct >= 95) return "A+";
  if (pct >= 90) return "A";
  if (pct >= 85) return "B+";
  if (pct >= 80) return "B";
  if (pct >= 75) return "C+";
  if (pct >= 70) return "C";
  if (pct >= 65) return "D+";
  if (pct >= 60) return "D";
  return "F";
}

function addFinding(category: Category, finding: Finding): void {
  category.findings.push(finding);
  category.score = clamp(
    category.score - Math.max(0, finding.scoreImpact),
    0,
    category.maxScore,
  );
}

function main() {
  const delegatePath =
    "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts";
  const gatewayPath = "src/services/llm/core/llmGateway.service.ts";
  const memorySvcPath = "src/services/memory/conversationMemory.service.ts";
  const memoryPolicyPath = "src/data_banks/policies/memory_policy.any.json";
  const memoryPolicyTestsPath =
    "src/data_banks/policies/tests/memory_policy_tests.any.json";
  const memorySemanticContinuityBankPath =
    "src/data_banks/tests/memory_semantic_continuity.any.json";
  const unusedBankAuditScriptPath = "scripts/lint/unused-bank-audit.mjs";

  const delegate = read(delegatePath);
  const gateway = read(gatewayPath);
  const memorySvc = read(memorySvcPath);
  const memoryPolicy = parseJson(memoryPolicyPath);
  const memoryPolicyTests = parseJson(memoryPolicyTestsPath);
  const memorySemanticContinuity = parseJson(memorySemanticContinuityBankPath);

  const categories: Category[] = [
    {
      id: "working_memory",
      name: "Working Memory Window",
      maxScore: 20,
      score: 20,
      findings: [],
    },
    {
      id: "persistent_memory",
      name: "Persistent Memory Integration",
      maxScore: 25,
      score: 25,
      findings: [],
    },
    {
      id: "semantic_retrieval",
      name: "Semantic Retrieval Fidelity",
      maxScore: 20,
      score: 20,
      findings: [],
    },
    {
      id: "drift_control",
      name: "Drift Resistance",
      maxScore: 15,
      score: 15,
      findings: [],
    },
    {
      id: "bank_driven",
      name: "Data-Bank Driven Controls",
      maxScore: 10,
      score: 10,
      findings: [],
    },
    {
      id: "test_rigor",
      name: "Memory Test Rigor",
      maxScore: 10,
      score: 10,
      findings: [],
    },
  ];
  const byId = new Map(categories.map((c) => [c.id, c]));

  const working = byId.get("working_memory")!;
  const persistent = byId.get("persistent_memory")!;
  const semantic = byId.get("semantic_retrieval")!;
  const drift = byId.get("drift_control")!;
  const bankDriven = byId.get("bank_driven")!;
  const rigor = byId.get("test_rigor")!;

  const usesFixed60History = contains(
    delegate,
    /loadRecentForEngine\(\s*conversationId,\s*60,/,
  );
  if (usesFixed60History) {
    addFinding(working, {
      id: "WM_001",
      severity: "fail",
      scoreImpact: 10,
      summary: "Centralized runtime still hard-codes a 60-message history window.",
      evidence: [delegatePath],
    });
  }

  const delegateUsesRuntimeTuning = contains(delegate, /getMemoryRuntimeTuning/);
  if (!delegateUsesRuntimeTuning) {
    addFinding(working, {
      id: "WM_002",
      severity: "fail",
      scoreImpact: 10,
      summary:
        "Centralized runtime does not use memory policy runtime tuning for context sizing.",
      evidence: [delegatePath],
    });
  }

  const gatewayUsesMemoryPolicy = contains(
    gateway,
    /getOptionalBank<any>\("memory_policy"\)/,
  );
  if (!gatewayUsesMemoryPolicy) {
    addFinding(working, {
      id: "WM_003",
      severity: "fail",
      scoreImpact: 6,
      summary:
        "Gateway memory packing is not sourced from memory_policy databank.",
      evidence: [gatewayPath],
    });
  }

  const memoryServiceIntegrated = contains(
    delegate,
    /new ConversationMemoryService\(\)/,
  );
  if (!memoryServiceIntegrated) {
    addFinding(persistent, {
      id: "PM_001",
      severity: "fail",
      scoreImpact: 10,
      summary:
        "Conversation memory service is not integrated in centralized runtime.",
      evidence: [delegatePath],
    });
  }

  const writesActiveConversationMemory =
    contains(delegate, /recordConversationMemoryArtifacts\(\{/) &&
    contains(delegate, /contextMeta:\s*\{/) &&
    contains(delegate, /summary:\s*nextConversationSummary/);
  if (!writesActiveConversationMemory) {
    addFinding(persistent, {
      id: "PM_002",
      severity: "fail",
      scoreImpact: 15,
      summary:
        "Centralized runtime does not persist durable memory artifacts into active conversations storage.",
      evidence: [delegatePath],
    });
  }

  const dependsOnDroppedTables =
    contains(delegate, /"conversation_states"/) ||
    contains(delegate, /"conversation_context_states"/) ||
    contains(delegate, /"conversation_chunks"/);
  if (dependsOnDroppedTables) {
    addFinding(persistent, {
      id: "PM_004",
      severity: "fail",
      scoreImpact: 10,
      summary:
        "Centralized runtime still references dropped legacy conversation memory tables.",
      evidence: [delegatePath],
    });
  }

  const memoryServiceBankDriven = contains(
    memorySvc,
    /getBankLoaderInstance\(\)\.getBank<any>\("memory_policy"\)/,
  );
  if (!memoryServiceBankDriven) {
    addFinding(persistent, {
      id: "PM_003",
      severity: "fail",
      scoreImpact: 8,
      summary:
        "ConversationMemoryService cache sizing is not bank-driven from memory_policy.",
      evidence: [memorySvcPath],
    });
  }

  const retrievalEngineUsed = contains(delegate, /new RetrievalEngineService\(/);
  if (!retrievalEngineUsed) {
    addFinding(semantic, {
      id: "SR_001",
      severity: "fail",
      scoreImpact: 12,
      summary:
        "Centralized runtime is not using RetrievalEngineService for semantic/hybrid evidence retrieval.",
      evidence: [delegatePath],
    });
  }

  const globalSemanticScopeEnabled = contains(delegate, /allowGlobalScope/);
  if (!globalSemanticScopeEnabled) {
    addFinding(semantic, {
      id: "SR_002",
      severity: "fail",
      scoreImpact: 8,
      summary:
        "Runtime does not allow bank-gated global semantic retrieval when no docs are explicitly attached.",
      evidence: [delegatePath],
    });
  }

  const noShortQueryAutoReference =
    !contains(delegate, /wordCount <= 10 && !hasDocName/) &&
    !contains(delegate, /isReferentialFollowUp\(/);
  if (!noShortQueryAutoReference) {
    addFinding(drift, {
      id: "DR_001",
      severity: "fail",
      scoreImpact: 10,
      summary:
        "Drift-prone short-query referential heuristic still exists in centralized runtime.",
      evidence: [delegatePath],
    });
  }

  const hasMemorySystemBlocks = contains(
    delegate,
    /CONVERSATION_MEMORY_STATE|CONVERSATION_MEMORY_RECALL/,
  );
  if (!hasMemorySystemBlocks) {
    addFinding(drift, {
      id: "DR_002",
      severity: "fail",
      scoreImpact: 5,
      summary:
        "Centralized runtime is not injecting memory state/recall system blocks into turn assembly.",
      evidence: [delegatePath],
    });
  }

  const runtimeTuning = memoryPolicy?.config?.runtimeTuning || {};
  const requiredTuningKeys = [
    "recentContextLimit",
    "historyClampMax",
    "inMemoryMessageCacheLimit",
    "memorySummaryMaxChars",
    "memoryRecallMaxItems",
    "memoryRecallSnippetChars",
    "evidenceSnippetMaxChars",
    "queryKeywordMaxTerms",
    "queryKeywordMinLength",
    "queryStopWords",
    "memoryArtifactStore",
    "semanticSignals",
    "gateway",
    "semanticRetrieval",
  ];
  const missingTuning = requiredTuningKeys.filter(
    (k) => !(k in runtimeTuning),
  );
  if (missingTuning.length > 0) {
    addFinding(bankDriven, {
      id: "BK_001",
      severity: "fail",
      scoreImpact: 10,
      summary:
        "memory_policy.runtimeTuning is missing required memory/semantic runtime controls.",
      evidence: [`${memoryPolicyPath} missing: ${missingTuning.join(", ")}`],
    });
  }

  const gatewayStillUsesHardcodedEnvCaps = contains(
    gateway,
    /LLM_GATEWAY_DIALOGUE_TURN_LIMIT|LLM_GATEWAY_MEMORY_PACK_CHAR_CAP|LLM_GATEWAY_DIALOGUE_CHAR_BUDGET/,
  );
  if (gatewayStillUsesHardcodedEnvCaps) {
    addFinding(bankDriven, {
      id: "BK_002",
      severity: "fail",
      scoreImpact: 6,
      summary:
        "Gateway still depends on hard-coded env-based memory caps instead of databank-only tuning.",
      evidence: [gatewayPath],
    });
  }

  const delegateSignalPatternsBankDriven =
    contains(delegate, /semanticSignals/) &&
    contains(delegate, /resolveSemanticSignalPatterns/) &&
    contains(delegate, /collectSemanticSignals/);
  if (!delegateSignalPatternsBankDriven) {
    addFinding(bankDriven, {
      id: "BK_003",
      severity: "fail",
      scoreImpact: 6,
      summary:
        "Centralized semantic signal extraction is not fully databank-driven.",
      evidence: [delegatePath],
    });
  }

  const semanticSignalPatterns =
    memoryPolicy?.config?.runtimeTuning?.semanticSignals?.patterns || {};
  const requiredSignalPatternKeys = [
    "hasQuotedText",
    "hasFilename",
    "userAskedForTable",
    "userAskedForQuote",
    "sheetHintPresent",
    "rangeExplicit",
    "timeConstraintsPresent",
    "explicitYearOrQuarterComparison",
    "tableExpected",
  ];
  const missingSignalPatternKeys = requiredSignalPatternKeys.filter((key) => {
    const value = semanticSignalPatterns[key];
    return !Array.isArray(value) || value.length === 0;
  });
  if (missingSignalPatternKeys.length > 0) {
    addFinding(bankDriven, {
      id: "BK_004",
      severity: "fail",
      scoreImpact: 6,
      summary:
        "memory_policy semantic signal patterns are incomplete for required retrieval signals.",
      evidence: [
        `${memoryPolicyPath} missing semanticSignals.patterns keys: ${missingSignalPatternKeys.join(", ")}`,
      ],
    });
  }

  const hasUnusedBankAuditScript = fs.existsSync(
    path.resolve(process.cwd(), unusedBankAuditScriptPath),
  );
  if (!hasUnusedBankAuditScript) {
    addFinding(bankDriven, {
      id: "BK_005",
      severity: "fail",
      scoreImpact: 4,
      summary:
        "Unused databank audit script is missing; orphan JSONs can bypass manifest governance.",
      evidence: [unusedBankAuditScriptPath],
    });
  }

  const testFiles = fs.readdirSync(path.resolve(process.cwd(), "src/tests"));
  const hasMemoryContinuityTest = testFiles.some((name) =>
    /memory|semantic|continuity|long[-_]?conversation/i.test(name),
  );
  if (!hasMemoryContinuityTest) {
    addFinding(rigor, {
      id: "TR_001",
      severity: "fail",
      scoreImpact: 4,
      summary:
        "No centralized memory/semantic continuity regression test suite found.",
      evidence: ["src/tests/*"],
    });
  }

  const memoryPolicyCases = Array.isArray(memoryPolicyTests?.cases)
    ? memoryPolicyTests.cases
    : [];
  const memoryPolicyCaseCountsByLanguage = memoryPolicyCases.reduce(
    (acc: Record<string, number>, entry: any) => {
      const lang = String(entry?.language || "any").toLowerCase();
      acc[lang] = (acc[lang] || 0) + 1;
      return acc;
    },
    {},
  );
  const hasPolicyCaseVolume =
    memoryPolicyCases.length >= 45 &&
    (memoryPolicyCaseCountsByLanguage.en || 0) >= 12 &&
    (memoryPolicyCaseCountsByLanguage.pt || 0) >= 12 &&
    (memoryPolicyCaseCountsByLanguage.es || 0) >= 12;
  if (!hasPolicyCaseVolume) {
    addFinding(rigor, {
      id: "TR_002",
      severity: "fail",
      scoreImpact: 3,
      summary:
        "memory_policy_tests corpus lacks required multilingual depth for 10/10 memory validation.",
      evidence: [
        `${memoryPolicyTestsPath} cases=${memoryPolicyCases.length} en=${memoryPolicyCaseCountsByLanguage.en || 0} pt=${memoryPolicyCaseCountsByLanguage.pt || 0} es=${memoryPolicyCaseCountsByLanguage.es || 0}`,
      ],
    });
  }

  const continuityScenarios = Array.isArray(memorySemanticContinuity?.scenarios)
    ? memorySemanticContinuity.scenarios
    : [];
  const minTurnsViolations = continuityScenarios.filter((scenario: any) => {
    const turns = Array.isArray(scenario?.turns) ? scenario.turns : [];
    return turns.length < 6;
  });
  if (continuityScenarios.length < 24 || minTurnsViolations.length > 0) {
    addFinding(rigor, {
      id: "TR_003",
      severity: "fail",
      scoreImpact: 3,
      summary:
        "memory_semantic_continuity scenarios are below required volume/depth for long-horizon continuity verification.",
      evidence: [
        `${memorySemanticContinuityBankPath} scenarios=${continuityScenarios.length} withShortTurns=${minTurnsViolations.length}`,
      ],
    });
  }

  const totalMax = categories.reduce((sum, c) => sum + c.maxScore, 0);
  const totalScore = categories.reduce((sum, c) => sum + c.score, 0);
  const pct = (totalScore / totalMax) * 100;

  const blockers = [
    usesFixed60History
      ? "Centralized runtime still hard-caps history at 60 turns."
      : null,
    !memoryServiceIntegrated
      ? "Conversation memory service is not active in centralized runtime."
      : null,
    !writesActiveConversationMemory
      ? "Durable memory artifacts are not written into active conversations storage."
      : null,
    dependsOnDroppedTables
      ? "Centralized runtime still depends on dropped legacy memory tables."
      : null,
    !retrievalEngineUsed
      ? "Semantic/hybrid retrieval engine is not active in centralized runtime."
      : null,
    missingTuning.length > 0
      ? "memory_policy.runtimeTuning is incomplete."
      : null,
    missingSignalPatternKeys.length > 0
      ? "memory_policy semantic signal pattern coverage is incomplete."
      : null,
    !hasPolicyCaseVolume
      ? "memory_policy_tests does not meet multilingual coverage thresholds."
      : null,
    continuityScenarios.length < 24 || minTurnsViolations.length > 0
      ? "memory_semantic_continuity does not meet scenario depth thresholds."
      : null,
  ].filter((x): x is string => Boolean(x));

  const parityLevel: GradeReport["codexParityAssessment"]["parityLevel"] =
    pct >= 85
      ? "high"
      : pct >= 70
        ? "near"
        : pct >= 50
          ? "partial"
          : "none";

  const report: GradeReport = {
    generatedAt: new Date().toISOString(),
    repoRoot: process.cwd(),
    scope:
      "Centralized Allybi memory and semantic continuity runtime (delegate + gateway + databanks)",
    overall: {
      maxScore: totalMax,
      score: totalScore,
      percentage: Number(pct.toFixed(2)),
      letter: letterFromPct(pct),
    },
    categories,
    hardFacts: {
      delegateUsesRuntimeTuning,
      gatewayUsesMemoryPolicy,
      memoryServiceIntegrated,
      writesActiveConversationMemory,
      dependsOnDroppedTables,
      delegateSignalPatternsBankDriven,
      requiredSignalPatternKeys,
      missingSignalPatternKeys,
      hasUnusedBankAuditScript,
      memoryPolicyCases: memoryPolicyCases.length,
      memoryPolicyCaseCountsByLanguage,
      continuityScenarios: continuityScenarios.length,
      continuityShortTurnViolations: minTurnsViolations.length,
      retrievalEngineUsed,
      globalSemanticScopeEnabled,
      memoryPolicyRuntimeTuningKeys: Object.keys(runtimeTuning || {}),
    },
    codexParityAssessment: {
      parityLevel,
      blockers,
    },
  };

  const outPath = path.resolve(
    process.cwd(),
    "memory_semantic_grade_report.json",
  );
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Memory/Semantic grade report generated:");
  console.log(`- ${outPath}`);
  console.log(
    `- score: ${report.overall.score}/${report.overall.maxScore} (${report.overall.percentage}%, ${report.overall.letter})`,
  );
  if (blockers.length > 0) {
    console.log("- critical blockers:");
    for (const blocker of blockers) console.log(`  - ${blocker}`);
  }
}

main();
