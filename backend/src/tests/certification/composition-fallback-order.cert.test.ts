import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";
import { LlmRouterService } from "../../services/llm/core/llmRouter.service";
import { writeCertificationGateReport } from "./reporting";

function loadBank(relPath: string): Record<string, unknown> {
  const abs = path.resolve(process.cwd(), "src/data_banks", relPath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function makeRouter(): LlmRouterService {
  const banks: Record<string, Record<string, unknown>> = {
    provider_capabilities: loadBank("llm/provider_capabilities.any.json"),
    provider_fallbacks: loadBank("llm/provider_fallbacks.any.json"),
    composition_lane_policy: loadBank("llm/composition_lane_policy.any.json"),
  };
  return new LlmRouterService({
    getBank<T = unknown>(bankId: string): T {
      if (bankId in banks) return banks[bankId] as T;
      throw new Error(`missing_bank:${bankId}`);
    },
  });
}

describe("Certification: composition fallback order", () => {
  test("openai gpt-5-mini fallback escalates to gpt-5.2 before cross-provider", () => {
    const router = makeRouter();
    const failures: string[] = [];

    const order = router.listFallbackTargets({
      primary: {
        provider: "openai",
        model: "gpt-5-mini",
        stage: "final",
      },
      requireStreaming: true,
      allowTools: false,
    });

    const first = order[0];
    if (!first || first.provider !== "openai" || first.model !== "gpt-5.2") {
      failures.push(`FIRST_FALLBACK:${JSON.stringify(first || null)}`);
    }
    const geminiIdx = order.findIndex(
      (row) => row.provider === "gemini" && row.model === "gemini-2.5-flash",
    );
    const gpt52Idx = order.findIndex(
      (row) => row.provider === "openai" && row.model === "gpt-5.2",
    );
    if (geminiIdx < 0) {
      failures.push("MISSING_GEMINI_FALLBACK");
    }
    if (gpt52Idx < 0) {
      failures.push("MISSING_GPT52_ESCALATION");
    }
    if (geminiIdx >= 0 && gpt52Idx >= 0 && gpt52Idx > geminiIdx) {
      failures.push(`GPT52_AFTER_GEMINI:${gpt52Idx}>${geminiIdx}`);
    }

    writeCertificationGateReport("composition-fallback-order", {
      passed: failures.length === 0,
      metrics: {
        fallbackCount: order.length,
        gpt52First: first?.provider === "openai" && first?.model === "gpt-5.2" ? 1 : 0,
      },
      thresholds: {
        gpt52First: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
