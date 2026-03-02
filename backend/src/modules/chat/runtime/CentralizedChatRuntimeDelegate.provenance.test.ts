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
import type { ChatEngine } from "../domain/chat.contracts";
import { initializeBanks } from "../../../services/core/banks/bankLoader.service";
import * as enforcerModule from "../../../services/core/enforcement/responseContractEnforcer.service";
import { QualityGateRunnerService } from "../../../services/core/enforcement/qualityGateRunner.service";

describe("CentralizedChatRuntimeDelegate provenance enforcement", () => {
  let restoreEnforcer:
    | jest.SpiedFunction<typeof enforcerModule.getResponseContractEnforcer>
    | null = null;
  let restoreGenerateFollowups: jest.SpiedFunction<any> | null = null;
  let restoreQualityRunner:
    | jest.SpiedFunction<QualityGateRunnerService["runGates"]>
    | null = null;
  let priorFailSoftFlag: string | undefined;
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
  });

  afterEach(() => {
    restoreEnforcer?.mockRestore();
    restoreEnforcer = null;
    restoreGenerateFollowups?.mockRestore();
    restoreGenerateFollowups = null;
    restoreQualityRunner?.mockRestore();
    restoreQualityRunner = null;
    if (priorFailSoftFlag === undefined) {
      delete process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS;
    } else {
      process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = priorFailSoftFlag;
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

  test("soft-opens quality gate blocks with warnings when fail-soft flag is enabled", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "true";
    restoreQualityRunner = jest
      .spyOn(QualityGateRunnerService.prototype, "runGates")
      .mockResolvedValue({
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

    expect(finalized.failureCode).toBeNull();
    expect(finalized.assistantText).toContain(
      "Grounded answer text that should remain visible.",
    );
    expect(finalized.userWarning?.code).toBe("quality_gate_blocked");
    expect(finalized.warnings?.map((w: any) => w.code)).toContain(
      "quality_gate_blocked",
    );
  });

  test("fails closed on quality gate blocks when fail-soft flag is disabled", async () => {
    process.env.CHAT_RUNTIME_FAIL_SOFT_WARNINGS = "false";
    restoreQualityRunner = jest
      .spyOn(QualityGateRunnerService.prototype, "runGates")
      .mockResolvedValue({
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
});
