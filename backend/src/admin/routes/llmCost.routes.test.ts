import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("../../services/admin", () => ({
  listLlmCalls: jest.fn(),
  getLlmSummary: jest.fn(),
}));

jest.mock("../../services/admin/googleMetrics.service", () => ({
  getGoogleMetrics: jest.fn(),
}));

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import router from "./llmCost.routes";
import { listLlmCalls, getLlmSummary } from "../../services/admin";
import { getGoogleMetrics } from "../../services/admin/googleMetrics.service";
import { getOptionalBank } from "../../services/core/banks/bankLoader.service";

const mockedListLlmCalls = listLlmCalls as jest.MockedFunction<
  typeof listLlmCalls
>;
const mockedGetLlmSummary = getLlmSummary as jest.MockedFunction<
  typeof getLlmSummary
>;
const mockedGetGoogleMetrics = getGoogleMetrics as jest.MockedFunction<
  typeof getGoogleMetrics
>;
const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

function buildApp() {
  const app = express();
  app.use("/", router);
  return app;
}

describe("llmCost.routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetLlmSummary.mockResolvedValue({
      range: "7d",
      summary: {
        calls: 3,
        tokensTotal: 3_000_000,
        latencyMsP50: 240,
        latencyMsP95: 480,
        errorRate: 0,
      },
    } as any);
    mockedGetGoogleMetrics.mockResolvedValue({
      gemini: { calls: 2 },
    } as any);
  });

  test("GET / returns pricing diagnostics with pinned-model family cost coverage", async () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id !== "llm_cost_table") return null;
      return {
        _meta: { version: "2026-03-04" },
        models: {
          "google:gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
          "openai:gpt-5.2": { inputPer1M: 2.5, outputPer1M: 10 },
          "local:*": { inputPer1M: 0, outputPer1M: 0 },
        },
      };
    });

    mockedListLlmCalls.mockResolvedValue({
      range: "7d",
      items: [
        {
          provider: "gemini",
          model: "gemini-2.5-flash-001",
          promptTokens: 1_000_000,
          completionTokens: 500_000,
          totalTokens: 1_500_000,
          status: "ok",
          meta: { routeLane: "draft_fast_default", fallbackRank: 0 },
        },
        {
          provider: "openai",
          model: "gpt-5.2-2026-01-15",
          promptTokens: 1_000_000,
          completionTokens: 1_000_000,
          totalTokens: 2_000_000,
          status: "ok",
          meta: { routeLane: "final_authority_default", fallbackRank: 0 },
        },
        {
          provider: "acme",
          model: "x-1",
          promptTokens: 12_000,
          completionTokens: 8_000,
          totalTokens: 20_000,
          status: "fail",
          meta: { routeLane: "final_authority_default", fallbackRank: 1 },
        },
      ],
      nextCursor: null,
    } as any);

    const res = await request(buildApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.data?.pricingSource).toBe("2026-03-04");
    expect(res.body?.data?.costCoverage).toBe(0.6667);
    expect(res.body?.data?.pinnedFamilyCoverage).toBe(0.6667);
    expect(res.body?.data?.unpricedModelKeys).toEqual(["acme:x-1"]);
    expect(res.body?.data?.kpis?.costUsd).toBe(12.95);
    expect(res.body?.data?.compositionLaneBreakdown).toEqual([
      {
        lane: "final_authority_default",
        calls: 2,
        fallbackCalls: 1,
        fallbackRate: 0.5,
      },
      {
        lane: "draft_fast_default",
        calls: 1,
        fallbackCalls: 0,
        fallbackRate: 0,
      },
    ]);
    expect(res.body?.data?.fallbackByLane).toEqual([
      {
        lane: "final_authority_default",
        fallbackCalls: 1,
        totalCalls: 2,
        fallbackRate: 0.5,
      },
      {
        lane: "draft_fast_default",
        fallbackCalls: 0,
        totalCalls: 1,
        fallbackRate: 0,
      },
    ]);

    const byModel = res.body?.data?.charts?.costByModel ?? [];
    const geminiRow = byModel.find(
      (row: Record<string, unknown>) =>
        row.label === "gemini-2.5-flash-001",
    );
    expect(geminiRow?.valueUsd).toBe(0.45);
  });

  test("GET /calls computes costs from the same bank-backed pricing table", async () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id !== "llm_cost_table") return null;
      return {
        models: {
          "google:gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
        },
      };
    });

    mockedListLlmCalls.mockResolvedValue({
      range: "7d",
      items: [
        {
          provider: "gemini",
          model: "gemini-2.5-flash-001",
          promptTokens: 1_000_000,
          completionTokens: 1_000_000,
          totalTokens: 2_000_000,
          status: "ok",
        },
      ],
      nextCursor: null,
    } as any);

    const res = await request(buildApp()).get("/calls");
    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.data?.calls?.[0]?.costUsd).toBe(0.75);
  });
});
