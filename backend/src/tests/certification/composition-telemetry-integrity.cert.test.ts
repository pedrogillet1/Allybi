import { describe, expect, jest, test } from "@jest/globals";
import fs from "fs";
import path from "path";
import type { LLMClient } from "../../services/llm/core/llmClient.interface";
import {
  LlmGatewayService,
  clearGatewayCaches,
} from "../../services/llm/core/llmGateway.service";
import { QUALITY_SLO_THRESHOLDS } from "../../services/telemetry/adminTelemetryAdapter";
import { writeCertificationGateReport } from "./reporting";

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn((bankId: string) => {
    if (bankId !== "memory_policy") return null;
    return {
      config: {
        runtimeTuning: {
          gateway: {
            userTextCharCap: 8000,
            systemBlockCharCap: 4000,
            dialogueTurnLimit: 10,
            dialogueMessageCharCap: 1200,
            dialogueCharBudget: 6000,
            memoryPackCharCap: 8000,
          },
        },
      },
    };
  }),
}));

describe("Certification: composition telemetry integrity", () => {
  test("gateway telemetry includes lane/fallback/model family metadata", async () => {
    clearGatewayCaches();
    const llmClient: LLMClient = {
      provider: "openai",
      complete: async (req) => ({
        traceId: req.traceId,
        turnId: req.turnId || "turn_x",
        model: req.model,
        content: "ok",
        finishReason: "stop",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      }),
      stream: async (params) => ({
        traceId: params.req.traceId,
        turnId: params.req.turnId || "turn_x",
        model: params.req.model,
        finalText: "ok",
        finishReason: "stop",
      }),
    };

    const router: any = {
      route: () => ({
        provider: "openai",
        model: "gpt-5.2-2026-01-15",
        modelFamily: "gpt-5.2",
        reason: "quality_finish",
        lane: "final_authority_default",
        policyRuleId: "final_authority_default",
        qualityReason: "quality_finish",
        stage: "final",
        constraints: {},
      }),
      listFallbackTargets: () => [],
    };

    const builder: any = {
      build: () => ({
        messages: [{ role: "system", content: "compose" }],
        options: { stream: false, maxOutputTokens: 256 },
        kodaMeta: {
          promptType: "compose_answer",
          promptTrace: {
            orderedPrompts: [
              {
                bankId: "task_answer_with_sources",
                version: "1.0.0",
                templateId: "compose_default",
                hash: "abc",
              },
            ],
          },
        },
      }),
    };

    const gateway = new LlmGatewayService(
      llmClient,
      router,
      builder,
      {
        env: "local",
        provider: "openai",
        modelId: "gpt-5.2",
      },
      {
        resolve: () => null,
      },
    );

    const out = await gateway.generate({
      traceId: "trace_comp_1",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "hello" }],
    });

    const failures: string[] = [];
    if (out.telemetry?.routeLane !== "final_authority_default") {
      failures.push(`MISSING_ROUTE_LANE:${String(out.telemetry?.routeLane)}`);
    }
    if (out.telemetry?.modelFamily !== "gpt-5.2") {
      failures.push(`MISSING_MODEL_FAMILY:${String(out.telemetry?.modelFamily)}`);
    }
    if (out.telemetry?.fallbackRank !== 0) {
      failures.push(`MISSING_FALLBACK_RANK:${String(out.telemetry?.fallbackRank)}`);
    }
    if (out.telemetry?.qualityReason !== "quality_finish") {
      failures.push(`MISSING_QUALITY_REASON:${String(out.telemetry?.qualityReason)}`);
    }
    const routesPath = path.resolve(
      __dirname,
      "../../entrypoints/http/routes/admin-telemetry.routes.ts",
    );
    const controllerPath = path.resolve(
      __dirname,
      "../../controllers/adminTelemetry.controller.ts",
    );
    const runbookPath = path.resolve(
      __dirname,
      "../../../docs/runtime/composition-quality-runbook.md",
    );
    const routesSource = fs.readFileSync(routesPath, "utf8");
    const controllerSource = fs.readFileSync(controllerPath, "utf8");
    const hasTruncationEndpoint =
      routesSource.includes('/quality/truncation-rate') &&
      controllerSource.includes("adminTelemetryTruncationRate");
    const hasRegenerationEndpoint =
      routesSource.includes('/quality/regeneration-rate') &&
      controllerSource.includes("adminTelemetryRegenerationRate");
    if (!hasTruncationEndpoint) failures.push("MISSING_TRUNCATION_RATE_ENDPOINT");
    if (!hasRegenerationEndpoint)
      failures.push("MISSING_REGENERATION_RATE_ENDPOINT");
    const hasQualityThresholds =
      Number.isFinite(QUALITY_SLO_THRESHOLDS.reaskRateMaxPct) &&
      Number.isFinite(QUALITY_SLO_THRESHOLDS.truncationRateMaxPct) &&
      Number.isFinite(QUALITY_SLO_THRESHOLDS.regenerationRateMaxPct) &&
      QUALITY_SLO_THRESHOLDS.reaskRateMaxPct > 0 &&
      QUALITY_SLO_THRESHOLDS.reaskRateMaxPct <= 100 &&
      QUALITY_SLO_THRESHOLDS.truncationRateMaxPct > 0 &&
      QUALITY_SLO_THRESHOLDS.truncationRateMaxPct <= 100 &&
      QUALITY_SLO_THRESHOLDS.regenerationRateMaxPct > 0 &&
      QUALITY_SLO_THRESHOLDS.regenerationRateMaxPct <= 100;
    if (!hasQualityThresholds) failures.push("MISSING_QUALITY_SLO_THRESHOLDS");
    const runbookSource = fs.existsSync(runbookPath)
      ? fs.readFileSync(runbookPath, "utf8")
      : "";
    const runbookHasThresholds =
      runbookSource.includes("reaskRateMaxPct") &&
      runbookSource.includes(
        String(QUALITY_SLO_THRESHOLDS.reaskRateMaxPct),
      ) &&
      runbookSource.includes("truncationRateMaxPct") &&
      runbookSource.includes(
        String(QUALITY_SLO_THRESHOLDS.truncationRateMaxPct),
      ) &&
      runbookSource.includes("regenerationRateMaxPct") &&
      runbookSource.includes(
        String(QUALITY_SLO_THRESHOLDS.regenerationRateMaxPct),
      );
    if (!runbookHasThresholds) {
      failures.push("MISSING_COMPOSITION_QUALITY_RUNBOOK_THRESHOLDS");
    }

    writeCertificationGateReport("composition-telemetry-integrity", {
      passed: failures.length === 0,
      metrics: {
        hasRouteLane: out.telemetry?.routeLane ? 1 : 0,
        hasModelFamily: out.telemetry?.modelFamily ? 1 : 0,
        hasFallbackRank: out.telemetry?.fallbackRank != null ? 1 : 0,
        hasTruncationRateEndpoint: hasTruncationEndpoint ? 1 : 0,
        hasRegenerationRateEndpoint: hasRegenerationEndpoint ? 1 : 0,
        hasQualitySloThresholds: hasQualityThresholds ? 1 : 0,
        hasRunbookThresholds: runbookHasThresholds ? 1 : 0,
      },
      thresholds: {
        hasRouteLane: 1,
        hasModelFamily: 1,
        hasFallbackRank: 1,
        hasTruncationRateEndpoint: 1,
        hasRegenerationRateEndpoint: 1,
        hasQualitySloThresholds: 1,
        hasRunbookThresholds: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
