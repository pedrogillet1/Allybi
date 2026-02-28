import "reflect-metadata";
import path from "path";
import { beforeAll, describe, expect, test } from "@jest/globals";

import { CentralizedChatRuntimeDelegate } from "./CentralizedChatRuntimeDelegate";
import type { ChatEngine } from "../domain/chat.contracts";
import { initializeBanks } from "../../../services/core/banks/bankLoader.service";

describe("CentralizedChatRuntimeDelegate provenance enforcement", () => {
  beforeAll(async () => {
    await initializeBanks({
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
    });
  });

  test("fails closed when doc-grounded provenance is out of allowed scope", async () => {
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

    expect(finalized.failureCode).toBeTruthy();
    expect(finalized.assistantText).not.toBe(originalText);
    expect(finalized.provenance?.validated).toBe(false);
    expect(finalized.provenance?.failureCode).toBe("out_of_scope_provenance");
  });
});
