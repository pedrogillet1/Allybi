import "reflect-metadata";
import path from "path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

jest.mock("../../../services/core/retrieval/evidenceGate.service", () => ({
  EvidenceGateService: class {
    checkEvidence() {
      return {
        hasEvidence: true,
        evidenceStrength: "strong",
        suggestedAction: "answer",
        missingEvidence: [],
        foundEvidence: [],
      };
    }
  },
}));

import { CentralizedChatRuntimeDelegate } from "./CentralizedChatRuntimeDelegate";
import { CentralizedChatRuntimeDelegate as CentralizedChatRuntimeDelegateV2 } from "./CentralizedChatRuntimeDelegate.v2";
import type { ChatEngine } from "../domain/chat.contracts";
import {
  getBankLoaderInstance,
  initializeBanks,
} from "../../../services/core/banks/bankLoader.service";
import * as enforcerModule from "../../../services/core/enforcement/responseContractEnforcer.service";
import { QualityGateRunnerService } from "../../../services/core/enforcement/qualityGateRunner.service";

describe("CentralizedChatRuntimeDelegate provenance enforcement", () => {
  let restoreEnforcer:
    | jest.SpiedFunction<typeof enforcerModule.getResponseContractEnforcer>
    | null = null;
  let restoreGenerateFollowups: jest.SpiedFunction<any> | null = null;
  let restoreGenerateFollowupsV2: jest.SpiedFunction<any> | null = null;
  let restoreQualityRunner:
    | jest.SpiedFunction<QualityGateRunnerService["runGates"]>
    | null = null;
  let restoreBankHealth: jest.SpiedFunction<any> | null = null;
  let priorFailSoftFlag: string | undefined;
  let priorQualityGatesEnforcingFlag: string | undefined;
  let priorNodeEnv: string | undefined;
  let priorStrictGovernanceFlag: string | undefined;
  let priorProvenanceFailOpenFlag: string | undefined;

  beforeAll(async () => {
    await initializeBanks({
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
    });
  });

  beforeEach(() => {
    priorFailSoftFlag = process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS;
    priorQualityGatesEnforcingFlag = process.env.QUALITY_GATES_ENFORCING;
    priorNodeEnv = process.env.NODE_ENV;
    priorStrictGovernanceFlag = process.env.CHAT_RUNTIME_STRICT_GOVERNANCE;
    priorProvenanceFailOpenFlag =
      process.env.PROVENANCE_USER_FAILOPEN_WITH_EVIDENCE;
    restoreEnforcer = jest
      .spyOn(enforcerModule, "getResponseContractEnforcer")
      .mockReturnValue({
        enforce(payload: { content: string; attachments: unknown[] }) {
          return {
            content: payload.content,
            attachments: payload.attachments,
            enforcement: {
              repairs: [],
              warnings: [],
              blocked: false,
            },
          };
        },
      } as any);
    restoreGenerateFollowups = jest
      .spyOn(
        CentralizedChatRuntimeDelegate.prototype as any,
        "generateFollowups",
      )
      .mockResolvedValue([]);
    restoreGenerateFollowupsV2 = jest
      .spyOn(
        CentralizedChatRuntimeDelegateV2.prototype as any,
        "generateFollowups",
      )
      .mockResolvedValue([]);
    restoreQualityRunner = jest
      .spyOn(QualityGateRunnerService.prototype, "runGates")
      .mockResolvedValue({
        allPassed: true,
        finalScore: 1,
        results: [],
      });
    restoreBankHealth = jest
      .spyOn(getBankLoaderInstance(), "health")
      .mockReturnValue({
        ok: true,
        env: "dev",
        loadedCount: 100,
        loadedIdsSample: ["quality_gates"],
      } as any);
  });

  afterEach(() => {
    restoreEnforcer?.mockRestore();
    restoreEnforcer = null;
    restoreGenerateFollowups?.mockRestore();
    restoreGenerateFollowups = null;
    restoreGenerateFollowupsV2?.mockRestore();
    restoreGenerateFollowupsV2 = null;
    restoreQualityRunner?.mockRestore();
    restoreQualityRunner = null;
    restoreBankHealth?.mockRestore();
    restoreBankHealth = null;
    if (priorFailSoftFlag === undefined) {
      delete process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS;
    } else {
      process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = priorFailSoftFlag;
    }
    if (priorQualityGatesEnforcingFlag === undefined) {
      delete process.env.QUALITY_GATES_ENFORCING;
    } else {
      process.env.QUALITY_GATES_ENFORCING = priorQualityGatesEnforcingFlag;
    }
    if (priorNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = priorNodeEnv;
    }
    if (priorStrictGovernanceFlag === undefined) {
      delete process.env.CHAT_RUNTIME_STRICT_GOVERNANCE;
    } else {
      process.env.CHAT_RUNTIME_STRICT_GOVERNANCE = priorStrictGovernanceFlag;
    }
    if (priorProvenanceFailOpenFlag === undefined) {
      delete process.env.PROVENANCE_USER_FAILOPEN_WITH_EVIDENCE;
    } else {
      process.env.PROVENANCE_USER_FAILOPEN_WITH_EVIDENCE =
        priorProvenanceFailOpenFlag;
    }
  });

  test("fails closed for missing provenance when scoped evidence exists by default", async () => {
    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const originalText =
      "UNRELATED_OUTPUT_WITHOUT_OVERLAP_SHOULD_NOT_PASS_PROVENANCE";
    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: originalText,
      req: {
        userId: "user-provenance-1",
        message: "quais sao os pontos principais do documento?",
        attachedDocumentIds: ["doc-1"],
        preferredLanguage: "pt",
        meta: { requestId: "req-provenance-failclosed" },
      },
      answerMode: "doc_grounded_single",
      answerClass: "DOCUMENT",
      retrievalPack: {
        evidence: [
          {
            docId: "doc-2",
            snippet: "Trecho curto sobre framework scrum e papeis de produto.",
            location: { page: 1 },
            score: 0.9,
            locationKey: "d:doc-2|p:1|c:1",
          },
        ],
        debug: null,
      },
      sources: [{ documentId: "doc-2", location: { page: 1 }, score: 0.9 }],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("missing_provenance");
    expect(finalized.assistantText).not.toBe(originalText);
    expect(finalized.provenance?.validated).toBe(false);
    expect(finalized.provenance?.failureCode).toBe("missing_provenance");
    expect(finalized.provenanceTelemetry).toBeNull();
  });

  test("keeps missing provenance fail-closed even when override flag is set", async () => {
    process.env.PROVENANCE_USER_FAILOPEN_WITH_EVIDENCE = "true";
    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const originalText =
      "UNRELATED_OUTPUT_WITHOUT_OVERLAP_SHOULD_NOT_PASS_PROVENANCE";
    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: originalText,
      req: {
        userId: "user-provenance-1",
        message: "quais sao os pontos principais do documento?",
        attachedDocumentIds: ["doc-1"],
        preferredLanguage: "pt",
        meta: { requestId: "req-provenance-failopen-override" },
      },
      answerMode: "doc_grounded_single",
      answerClass: "DOCUMENT",
      retrievalPack: {
        evidence: [
          {
            docId: "doc-2",
            snippet: "Trecho curto sobre framework scrum e papeis de produto.",
            location: { page: 1 },
            score: 0.9,
            locationKey: "d:doc-2|p:1|c:1",
          },
        ],
        debug: null,
      },
      sources: [{ documentId: "doc-2", location: { page: 1 }, score: 0.9 }],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("missing_provenance");
    expect(finalized.assistantText).not.toBe(originalText);
    expect(finalized.provenance?.validated).toBe(false);
    expect(finalized.provenance?.failureCode).toBe("missing_provenance");
    expect(finalized.provenanceTelemetry).toBeNull();
    expect(finalized.enforcement?.warnings || []).not.toContain(
      "PROVENANCE_FAILOPEN_WITH_EVIDENCE",
    );
  });

  test("fails closed for missing provenance when no scoped evidence exists", async () => {
    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const originalText = "Resposta curta sem citacao lexical explicita.";
    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: originalText,
      req: {
        userId: "user-provenance-2",
        message: "quais sao os principais pontos?",
        attachedDocumentIds: ["doc-1"],
        preferredLanguage: "pt",
        meta: { requestId: "req-provenance-demote-missing" },
      },
      answerMode: "doc_grounded_single",
      answerClass: "DOCUMENT",
      retrievalPack: {
        evidence: [],
        debug: null,
      },
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("missing_provenance");
    expect(finalized.assistantText).not.toBe(originalText);
    expect(finalized.provenance?.validated).toBe(false);
    expect(finalized.provenance?.failureCode).toBe("missing_provenance");
    expect(finalized.provenanceTelemetry).toBeNull();
  });

  test("fails closed on quality gate blocks even when fail-soft flag is enabled", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    restoreQualityRunner?.mockResolvedValue({
      allPassed: false,
      finalScore: 0,
      results: [
        {
          passed: false,
          gateName: "privacy_minimal",
          issues: ["blocked for test"],
        },
      ],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "Grounded answer text that should remain visible.",
      req: {
        userId: "user-quality-soft",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("quality_gate_blocked");
    expect(finalized.assistantText).not.toContain(
      "Grounded answer text that should remain visible.",
    );
    expect(finalized.userWarning?.code).toBe("quality_gate_blocked");
    expect(finalized.warnings?.map((w: any) => w.code)).toContain(
      "quality_gate_blocked",
    );
  });

  test("fails closed on quality gate blocks when fail-soft flag is disabled", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "false";
    restoreQualityRunner?.mockResolvedValue({
      allPassed: false,
      finalScore: 0,
      results: [
        {
          passed: false,
          gateName: "privacy_minimal",
          issues: ["blocked for test"],
        },
      ],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-quality-closed",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("quality_gate_blocked");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
    expect(finalized.userWarning?.code).toBe("quality_gate_blocked");
  });

  test("fails closed when quality gates are disabled by flag in production", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    process.env.QUALITY_GATES_ENFORCING = "false";
    process.env.NODE_ENV = "production";
    restoreQualityRunner?.mockResolvedValue({
      allPassed: false,
      finalScore: 0,
      results: [
        {
          passed: false,
          gateName: "privacy_minimal",
          issues: ["blocked for test"],
        },
      ],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-quality-production",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("quality_gate_blocked");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
  });

  test("keeps governance blocking outcome consistent across provider model families", async () => {
    restoreQualityRunner?.mockResolvedValue({
      allPassed: false,
      finalScore: 0,
      results: [
        {
          passed: false,
          gateName: "privacy_minimal",
          issues: ["blocked for parity test"],
        },
      ],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const models = ["openai:gpt-5.2", "gemini:gemini-2.5-flash"];
    const outcomes: Array<{ model: string; failureCode: string | null }> = [];
    for (const model of models) {
      const finalized = await (delegate as any).finalizeChatTurn({
        assistantText: "This text should be replaced by fallback.",
        req: {
          userId: `user-quality-${model}`,
          message: "summarize this",
          preferredLanguage: "en",
        },
        answerMode: "general_answer",
        answerClass: "GENERAL",
        retrievalPack: null,
        sources: [],
        telemetry: { model },
      });
      outcomes.push({ model, failureCode: finalized.failureCode || null });
    }

    expect(outcomes).toEqual([
      { model: "openai:gpt-5.2", failureCode: "quality_gate_blocked" },
      { model: "gemini:gemini-2.5-flash", failureCode: "quality_gate_blocked" },
    ]);
  });

  test("fails closed when bank loader health is degraded in strict governance mode", async () => {
    process.env.NODE_ENV = "production";
    restoreBankHealth?.mockReturnValue({
      ok: false,
      env: "production",
      loadedCount: 0,
      loadedIdsSample: [],
      missingCritical: ["clarification_policy"],
      lastError: {
        name: "DataBankError",
        message: "Dependency graph missing nodes for registered banks",
      },
    } as any);
    restoreQualityRunner?.mockResolvedValue({
      allPassed: true,
      finalScore: 1,
      results: [],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-bank-health",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("bank_loader_unhealthy");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
    expect(finalized.qualityGateIssues).toContain("bank_loader_unhealthy");
    expect(finalized.qualityGates.failed).toContainEqual(
      expect.objectContaining({
        gateName: "bank_loader_health",
        severity: "block",
      }),
    );
  });

  test("fails closed on bank loader health issues in non-protected env", async () => {
    process.env.NODE_ENV = "development";
    process.env.CHAT_RUNTIME_STRICT_GOVERNANCE = "false";
    restoreBankHealth?.mockReturnValue({
      ok: false,
      env: "dev",
      loadedCount: 0,
      loadedIdsSample: [],
      missingCritical: ["clarification_policy"],
      lastError: {
        name: "DataBankError",
        message: "Dependency graph missing nodes for registered banks",
      },
    } as any);
    restoreQualityRunner?.mockResolvedValue({
      allPassed: true,
      finalScore: 1,
      results: [],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should stay eligible for normal flow.",
      req: {
        userId: "user-bank-health-soft",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("bank_loader_unhealthy");
    expect(finalized.assistantText).not.toBe(
      "This text should stay eligible for normal flow.",
    );
  });

  test("treats domain_safety_rule_violation gates as blocking", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    restoreQualityRunner?.mockResolvedValue({
      allPassed: false,
      finalScore: 0,
      results: [
        {
          passed: false,
          gateName: "domain_safety_rule_violation:legal_safe_005_harmful_guidance",
          issues: ["blocked for test"],
        },
      ],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-domain-safety",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("quality_gate_blocked");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
  });

  test("forwards DI policy context payloads into quality gate runner context", async () => {
    let capturedCtx: Record<string, unknown> | null = null;
    restoreQualityRunner?.mockImplementation(async (_response: string, ctx: any) => {
      capturedCtx = ctx;
      return {
        allPassed: true,
        finalScore: 1,
        results: [],
      };
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    await (delegate as any).finalizeChatTurn({
      assistantText: "Grounded answer text.",
      req: {
        userId: "user-di-policy-context",
        message: "summarize this",
        preferredLanguage: "en",
        context: {
          signals: {
            diPolicyContext: { contradictions: 2, confidence: 0.4 },
            diPolicyAttachments: { sourceButtonsCount: 3 },
          },
        },
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: {
        evidence: [],
        telemetry: {
          summary: {
            diPolicyOutput: { statedTotal: 7, statedParts: [2, 2] },
            diPolicySource: { statedTotal: 8 },
            diPolicyConfig: { limits: { maxSourcesButtonsHard: 8 } },
          },
        },
      },
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(capturedCtx).not.toBeNull();
    expect((capturedCtx as any).diPolicyContext).toEqual(
      expect.objectContaining({ contradictions: 2 }),
    );
    expect((capturedCtx as any).diPolicyOutput).toEqual(
      expect.objectContaining({ statedTotal: 7 }),
    );
    expect((capturedCtx as any).diPolicySource).toEqual(
      expect.objectContaining({ statedTotal: 8 }),
    );
    expect((capturedCtx as any).diPolicyAttachments).toEqual(
      expect.objectContaining({ sourceButtonsCount: 3 }),
    );
    expect((capturedCtx as any).diPolicyConfig).toEqual(
      expect.objectContaining({ limits: { maxSourcesButtonsHard: 8 } }),
    );
  });

  test("only bypasses evidence clarification when attached docs also have evidence", async () => {
    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const clarifyWithoutEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "clarify",
        clarifyQuestion: "Which exact period should I use?",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 0,
      },
    );

    const clarifyWithEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "clarify",
        clarifyQuestion: "Which exact period should I use?",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 2,
      },
    );
    const docGroundedClarifyWithEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "clarify",
        clarifyQuestion: "Which exact period should I use?",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 2,
        answerMode: "doc_grounded_single",
      },
    );

    const apologizeWithoutEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "apologize",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 0,
      },
    );
    const docGroundedApologizeWithEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "apologize",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 2,
        answerMode: "doc_grounded_single",
      },
    );

    expect(clarifyWithoutEvidence?.failureCode).toBe(
      "EVIDENCE_NEEDS_CLARIFICATION",
    );
    expect(clarifyWithoutEvidence?.text).toContain(
      "Which exact period should I use?",
    );
    expect(clarifyWithEvidence).toBeNull();
    expect(docGroundedClarifyWithEvidence?.failureCode).toBe(
      "EVIDENCE_NEEDS_CLARIFICATION",
    );
    expect(apologizeWithoutEvidence?.failureCode).toBe("EVIDENCE_INSUFFICIENT");
    expect(docGroundedApologizeWithEvidence?.failureCode).toBe(
      "EVIDENCE_INSUFFICIENT",
    );
  });

  test("fails closed on enforcer runtime errors even with fail-soft enabled", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    restoreEnforcer?.mockRestore();
    restoreEnforcer = jest
      .spyOn(enforcerModule, "getResponseContractEnforcer")
      .mockReturnValue({
        enforce() {
          throw new Error("forced-enforcer-error");
        },
      } as any);

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-enforcer-error",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("enforcer_runtime_error");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
    expect(finalized.warnings || []).not.toContainEqual(
      expect.objectContaining({ code: "ENFORCER_RUNTIME_ERROR_FAIL_OPEN" }),
    );
  });

  test("fails closed on nav contract block even when fail-soft is enabled", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    restoreEnforcer?.mockRestore();
    restoreEnforcer = jest
      .spyOn(enforcerModule, "getResponseContractEnforcer")
      .mockReturnValue({
        enforce(payload: { content: string; attachments: unknown[] }) {
          return {
            content: payload.content,
            attachments: payload.attachments,
            enforcement: {
              repairs: [],
              warnings: [],
              blocked: true,
              reasonCode: "nav_pills_missing_buttons",
            },
          };
        },
      } as any);

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-nav-contract",
        message: "open section 2",
        preferredLanguage: "en",
      },
      answerMode: "nav_pills",
      answerClass: "NAVIGATION",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("nav_pills_missing_buttons");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
  });

  test("v2 fails closed when quality gates are disabled by flag in production", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    process.env.QUALITY_GATES_ENFORCING = "false";
    process.env.NODE_ENV = "production";
    restoreQualityRunner?.mockResolvedValue({
      allPassed: false,
      finalScore: 0,
      results: [
        {
          passed: false,
          gateName: "privacy_minimal",
          issues: ["blocked for test"],
        },
      ],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegateV2(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-quality-production-v2",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("quality_gate_blocked");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
  });

  test("v2 fails closed when bank loader health is degraded in strict governance mode", async () => {
    process.env.NODE_ENV = "production";
    restoreBankHealth?.mockReturnValue({
      ok: false,
      env: "production",
      loadedCount: 0,
      loadedIdsSample: [],
      missingCritical: ["clarification_policy"],
      lastError: {
        name: "DataBankError",
        message: "Dependency graph missing nodes for registered banks",
      },
    } as any);
    restoreQualityRunner?.mockResolvedValue({
      allPassed: true,
      finalScore: 1,
      results: [],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegateV2(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-bank-health-v2",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("bank_loader_unhealthy");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
    expect(finalized.qualityGateIssues).toContain("bank_loader_unhealthy");
    expect(finalized.qualityGates.failed).toContainEqual(
      expect.objectContaining({
        gateName: "bank_loader_health",
        severity: "block",
      }),
    );
  });

  test("v2 forwards DI policy context payloads into quality gate runner context", async () => {
    let capturedCtx: Record<string, unknown> | null = null;
    restoreQualityRunner?.mockImplementation(async (_response: string, ctx: any) => {
      capturedCtx = ctx;
      return {
        allPassed: true,
        finalScore: 1,
        results: [],
      };
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegateV2(engine, {
      conversationMemory: {} as any,
    });

    await (delegate as any).finalizeChatTurn({
      assistantText: "Grounded answer text.",
      req: {
        userId: "user-di-policy-context-v2",
        message: "summarize this",
        preferredLanguage: "en",
        context: {
          signals: {
            diPolicyContext: { contradictions: 2, confidence: 0.4 },
            diPolicyAttachments: { sourceButtonsCount: 3 },
          },
        },
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: {
        evidence: [],
        telemetry: {
          summary: {
            diPolicyOutput: { statedTotal: 7, statedParts: [2, 2] },
            diPolicySource: { statedTotal: 8 },
            diPolicyConfig: { limits: { maxSourcesButtonsHard: 8 } },
          },
        },
      },
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(capturedCtx).not.toBeNull();
    expect((capturedCtx as any).diPolicyContext).toEqual(
      expect.objectContaining({ contradictions: 2 }),
    );
    expect((capturedCtx as any).diPolicyOutput).toEqual(
      expect.objectContaining({ statedTotal: 7 }),
    );
    expect((capturedCtx as any).diPolicySource).toEqual(
      expect.objectContaining({ statedTotal: 8 }),
    );
    expect((capturedCtx as any).diPolicyAttachments).toEqual(
      expect.objectContaining({ sourceButtonsCount: 3 }),
    );
    expect((capturedCtx as any).diPolicyConfig).toEqual(
      expect.objectContaining({ limits: { maxSourcesButtonsHard: 8 } }),
    );
  });

  test("v2 treats domain_safety_rule_violation gates as blocking", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    restoreQualityRunner?.mockResolvedValue({
      allPassed: false,
      finalScore: 0,
      results: [
        {
          passed: false,
          gateName: "domain_safety_rule_violation:legal_safe_005_harmful_guidance",
          issues: ["blocked for test"],
        },
      ],
    });

    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegateV2(engine, {
      conversationMemory: {} as any,
    });

    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: "This text should be replaced by fallback.",
      req: {
        userId: "user-domain-safety-v2",
        message: "summarize this",
        preferredLanguage: "en",
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBe("quality_gate_blocked");
    expect(finalized.assistantText).not.toBe(
      "This text should be replaced by fallback.",
    );
  });

  test("v2 only bypasses evidence clarification when attached docs also have evidence", async () => {
    const engine: ChatEngine = {
      async generate() {
        return { text: "unused" };
      },
      async stream() {
        return { text: "unused", chunks: [] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegateV2(engine, {
      conversationMemory: {} as any,
    });

    const clarifyWithoutEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "clarify",
        clarifyQuestion: "Which exact period should I use?",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 0,
      },
    );

    const clarifyWithEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "clarify",
        clarifyQuestion: "Which exact period should I use?",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 2,
      },
    );
    const docGroundedClarifyWithEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "clarify",
        clarifyQuestion: "Which exact period should I use?",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 2,
        answerMode: "doc_grounded_single",
      },
    );
    const docGroundedApologizeWithEvidence = (delegate as any).resolveEvidenceGateBypass(
      {
        suggestedAction: "apologize",
      },
      "en",
      {
        attachedDocumentIds: ["doc-1"],
        evidenceCount: 2,
        answerMode: "doc_grounded_single",
      },
    );

    expect(clarifyWithoutEvidence?.failureCode).toBe(
      "EVIDENCE_NEEDS_CLARIFICATION",
    );
    expect(clarifyWithoutEvidence?.text).toContain(
      "Which exact period should I use?",
    );
    expect(clarifyWithEvidence).toBeNull();
    expect(docGroundedClarifyWithEvidence?.failureCode).toBe(
      "EVIDENCE_NEEDS_CLARIFICATION",
    );
    expect(docGroundedApologizeWithEvidence?.failureCode).toBe(
      "EVIDENCE_INSUFFICIENT",
    );
  });
});
