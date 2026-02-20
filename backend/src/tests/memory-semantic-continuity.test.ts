import * as fs from "fs";
import * as path from "path";

describe("Centralized memory/semantic continuity wiring", () => {
  const delegatePath = path.resolve(
    process.cwd(),
    "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
  );
  const gatewayPath = path.resolve(
    process.cwd(),
    "src/services/llm/core/llmGateway.service.ts",
  );
  const memoryPolicyPath = path.resolve(
    process.cwd(),
    "src/data_banks/policies/memory_policy.any.json",
  );
  const memoryPolicyTestsPath = path.resolve(
    process.cwd(),
    "src/data_banks/policies/memory_policy_tests.any.json",
  );
  const memorySemanticContinuityBankPath = path.resolve(
    process.cwd(),
    "src/data_banks/tests/memory_semantic_continuity.any.json",
  );
  const hasMemoryPolicyTests = fs.existsSync(memoryPolicyTestsPath);
  const hasSemanticContinuityBank = fs.existsSync(
    memorySemanticContinuityBankPath,
  );

  test("delegate persists durable memory artifacts and injects memory blocks", () => {
    const src = fs.readFileSync(delegatePath, "utf8");
    expect(src).toContain("recordConversationMemoryArtifacts");
    expect(src).toContain("contextMeta");
    expect(src).toContain("nextConversationSummary");
    expect(src).not.toContain('"conversation_states"');
    expect(src).not.toContain('"conversation_context_states"');
    expect(src).not.toContain('"conversation_chunks"');
    expect(src).toContain("CONVERSATION_MEMORY_STATE");
    expect(src).toContain("CONVERSATION_MEMORY_RECALL");
  });

  test("gateway reads memory tuning from databanks", () => {
    const src = fs.readFileSync(gatewayPath, "utf8");
    expect(src).toContain('getOptionalBank<any>("memory_policy")');
    expect(src).toContain("resolveDialogueTurnLimit");
    expect(src).toContain("resolveMemoryPackCharCap");
  });

  test("memory policy defines runtime tuning contract", () => {
    const raw = fs.readFileSync(memoryPolicyPath, "utf8");
    const bank = JSON.parse(raw);
    const tuning = bank?.config?.runtimeTuning;
    expect(tuning).toBeTruthy();
    expect(typeof tuning.recentContextLimit).toBe("number");
    expect(typeof tuning.historyClampMax).toBe("number");
    expect(typeof tuning.inMemoryMessageCacheLimit).toBe("number");
    expect(typeof tuning.memorySummaryMaxChars).toBe("number");
    expect(typeof tuning.memoryRecallMaxItems).toBe("number");
    expect(typeof tuning.memoryRecallSnippetChars).toBe("number");
    expect(typeof tuning.evidenceSnippetMaxChars).toBe("number");
    expect(typeof tuning.queryKeywordMaxTerms).toBe("number");
    expect(typeof tuning.queryKeywordMinLength).toBe("number");
    expect(tuning.queryStopWords).toBeTruthy();
    expect(tuning.memoryArtifactStore).toBeTruthy();
    expect(tuning.semanticSignals).toBeTruthy();
    expect(tuning.gateway).toBeTruthy();
    expect(tuning.semanticRetrieval).toBeTruthy();
  });

  (hasMemoryPolicyTests ? test : test.skip)(
    "memory policy tests bank has multilingual high-coverage corpus",
    () => {
      const bank = JSON.parse(fs.readFileSync(memoryPolicyTestsPath, "utf8"));
      const cases = Array.isArray(bank?.cases) ? bank.cases : [];
      const counts = cases.reduce((acc: Record<string, number>, entry: any) => {
        const lang = String(entry?.language || "any").toLowerCase();
        acc[lang] = (acc[lang] || 0) + 1;
        return acc;
      }, {});

      expect(cases.length).toBeGreaterThanOrEqual(45);
      expect(counts.en || 0).toBeGreaterThanOrEqual(12);
      expect(counts.pt || 0).toBeGreaterThanOrEqual(12);
      expect(counts.es || 0).toBeGreaterThanOrEqual(12);
    },
  );

  (hasSemanticContinuityBank ? test : test.skip)(
    "memory semantic continuity bank has deep turn scenarios",
    () => {
      const bank = JSON.parse(
        fs.readFileSync(memorySemanticContinuityBankPath, "utf8"),
      );
      const scenarios = Array.isArray(bank?.scenarios) ? bank.scenarios : [];
      expect(scenarios.length).toBeGreaterThanOrEqual(24);
      for (const scenario of scenarios) {
        const turns = Array.isArray(scenario?.turns) ? scenario.turns : [];
        expect(turns.length).toBeGreaterThanOrEqual(6);
      }
    },
  );
});
