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

describe("Certification: composition routing lanes", () => {
  test("final and draft composition routes resolve to lane policy targets", () => {
    const router = makeRouter();
    const failures: string[] = [];

    const finalRoute = router.route({
      env: "production",
      stage: "final",
      answerMode: "doc_grounded_single",
      requireStreaming: true,
      allowTools: false,
    });

    if (finalRoute.provider !== "openai") {
      failures.push(`FINAL_PROVIDER:${finalRoute.provider}`);
    }
    if (!String(finalRoute.model).startsWith("gpt-5.2")) {
      failures.push(`FINAL_MODEL:${String(finalRoute.model)}`);
    }
    if (finalRoute.lane !== "final_authority_default") {
      failures.push(`FINAL_LANE:${String(finalRoute.lane)}`);
    }
    if (finalRoute.modelFamily !== "gpt-5.2") {
      failures.push(`FINAL_MODEL_FAMILY:${String(finalRoute.modelFamily)}`);
    }

    const draftRoute = router.route({
      env: "production",
      stage: "draft",
      answerMode: "nav_pills",
      requireStreaming: true,
      allowTools: false,
    });

    if (draftRoute.provider !== "gemini") {
      failures.push(`DRAFT_PROVIDER:${draftRoute.provider}`);
    }
    if (!String(draftRoute.model).startsWith("gemini-2.5-flash")) {
      failures.push(`DRAFT_MODEL:${String(draftRoute.model)}`);
    }
    if (draftRoute.lane !== "draft_fast_default") {
      failures.push(`DRAFT_LANE:${String(draftRoute.lane)}`);
    }

    writeCertificationGateReport("composition-routing", {
      passed: failures.length === 0,
      metrics: {
        finalRouteProviderOpenAI: finalRoute.provider === "openai" ? 1 : 0,
        finalRouteModelFamilyMatch: finalRoute.modelFamily === "gpt-5.2" ? 1 : 0,
        draftRouteProviderGemini: draftRoute.provider === "gemini" ? 1 : 0,
      },
      thresholds: {
        finalRouteProviderOpenAI: 1,
        finalRouteModelFamilyMatch: 1,
        draftRouteProviderGemini: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
