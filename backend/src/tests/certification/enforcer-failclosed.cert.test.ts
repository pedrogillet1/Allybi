import "reflect-metadata";
import path from "path";
import { beforeAll, describe, expect, jest, test } from "@jest/globals";

import { CentralizedChatRuntimeDelegate } from "../../modules/chat/runtime/CentralizedChatRuntimeDelegate";
import type { ChatEngine } from "../../modules/chat/domain/chat.contracts";
import * as responseContractEnforcer from "../../services/core/enforcement/responseContractEnforcer.service";
import { initializeBanks } from "../../services/core/banks/bankLoader.service";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: enforcer fail-closed behavior", () => {
  beforeAll(async () => {
    await initializeBanks({
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
    });
  });

  test("runtime returns safe fallback when response contract enforcer throws", async () => {
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

    const enforcerSpy = jest
      .spyOn(responseContractEnforcer, "getResponseContractEnforcer")
      .mockImplementation(() => {
        throw new Error("simulated enforcer crash");
      });

    const originalText =
      "ORIGINAL_UNVALIDATED_TEXT_SHOULD_NEVER_SHIP_WHEN_ENFORCER_FAILS";
    const finalized = await (delegate as any).finalizeChatTurn({
      assistantText: originalText,
      req: {
        userId: "user-1",
        message: "what is in the attached docs?",
        attachedDocumentIds: ["doc-1", "doc-2"],
        preferredLanguage: "en",
        meta: { requestId: "req-enforcer-failclosed-cert" },
      },
      answerMode: "general_answer",
      answerClass: "GENERAL",
      retrievalPack: null,
      sources: [],
      telemetry: {
        model: "unit-test-model",
      },
    });

    enforcerSpy.mockRestore();

    const failures: string[] = [];
    if (finalized.assistantText === originalText) {
      failures.push("UNVALIDATED_OUTPUT_SHIPPED");
    }
    if (finalized.failureCode !== "enforcer_runtime_error") {
      failures.push("FAILURE_CODE_NOT_SET");
    }
    if (
      !finalized.enforcement?.warnings?.includes(
        "ENFORCER_RUNTIME_ERROR_FAIL_CLOSED",
      )
    ) {
      failures.push("FAIL_CLOSED_WARNING_MISSING");
    }
    if (!String(finalized.assistantText || "").trim()) {
      failures.push("SAFE_FALLBACK_EMPTY");
    }

    writeCertificationGateReport("enforcer-failclosed", {
      passed: failures.length === 0,
      metrics: {
        failureCode: finalized.failureCode || null,
        outputChanged: finalized.assistantText !== originalText,
        hasWarning: Boolean(
          finalized.enforcement?.warnings?.includes(
            "ENFORCER_RUNTIME_ERROR_FAIL_CLOSED",
          ),
        ),
      },
      thresholds: {
        mustSetFailureCode: "enforcer_runtime_error",
        mustNotShipOriginalText: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
