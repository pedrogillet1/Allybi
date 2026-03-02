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

import { CentralizedChatRuntimeDelegate } from "./CentralizedChatRuntimeDelegate";
import type { ChatEngine } from "../domain/chat.contracts";
import { initializeBanks } from "../../../services/core/banks/bankLoader.service";
import * as enforcerModule from "../../../services/core/enforcement/responseContractEnforcer.service";

describe("CentralizedChatRuntimeDelegate provenance enforcement", () => {
  let restoreEnforcer:
    | jest.SpiedFunction<typeof enforcerModule.getResponseContractEnforcer>
    | null = null;

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
  });

  afterEach(() => {
    restoreEnforcer?.mockRestore();
    restoreEnforcer = null;
  });

  test("does not fail closed when provenance is lexically missing but evidence exists", async () => {
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

    expect(finalized.failureCode).toBeNull();
    expect(finalized.assistantText).toBe(originalText);
    expect(finalized.provenance?.validated).toBe(false);
    expect(finalized.provenance?.failureCode).toBe("missing_provenance");
  });

  test("does not fail closed for missing_provenance when evidence is in allowed scope", async () => {
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
        evidence: [
          {
            docId: "doc-1",
            snippet: "O documento define objetivos, escopo, entregas e riscos.",
            location: { page: 2 },
            score: 0.91,
            locationKey: "d:doc-1|p:2|c:1",
          },
        ],
        debug: null,
      },
      sources: [{ documentId: "doc-1", location: { page: 2 }, score: 0.91 }],
      telemetry: { model: "unit-test-model" },
    });

    expect(finalized.failureCode).toBeNull();
    expect(finalized.assistantText).toBe(originalText);
    expect(finalized.provenance?.validated).toBe(false);
    expect(finalized.provenance?.failureCode).toBe("missing_provenance");
  });
});
