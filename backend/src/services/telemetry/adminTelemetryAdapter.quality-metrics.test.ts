import { describe, expect, test } from "@jest/globals";
import {
  QUALITY_SLO_THRESHOLDS,
  createAdminTelemetryAdapter,
} from "./adminTelemetryAdapter";

describe("admin telemetry quality metrics", () => {
  test("computes truncationRate from queryTelemetry flags", async () => {
    const prisma = {
      queryTelemetry: {
        findMany: async () => [
          { wasTruncated: true, wasProviderTruncated: false },
          { wasTruncated: false, wasProviderTruncated: true },
          { wasTruncated: false, wasProviderTruncated: false },
        ],
      },
    } as any;

    const adapter = createAdminTelemetryAdapter(prisma);
    const out = await adapter.truncationRate({ range: "7d" });

    expect(out.totalQueries).toBe(3);
    expect(out.truncatedCount).toBe(2);
    expect(out.truncationRate).toBeCloseTo((2 / 3) * 100, 5);
    expect(out.thresholdMaxPct).toBe(QUALITY_SLO_THRESHOLDS.truncationRateMaxPct);
  });

  test("computes regenerationRate from usage events", async () => {
    const prisma = {
      usageEvent: {
        count: async ({ where }: any) =>
          where?.eventType === "REGENERATE_USED" ? 12 : 120,
      },
    } as any;

    const adapter = createAdminTelemetryAdapter(prisma);
    const out = await adapter.regenerationRate({ range: "7d" });

    expect(out.regenerateCount).toBe(12);
    expect(out.totalMessages).toBe(120);
    expect(out.regenerationRate).toBeCloseTo(10, 5);
    expect(out.thresholdMaxPct).toBe(
      QUALITY_SLO_THRESHOLDS.regenerationRateMaxPct,
    );
  });

  test("exposes reask threshold metadata", async () => {
    const prisma = {
      conversation: {
        findMany: async () => [
          {
            messages: [
              { createdAt: new Date("2026-03-05T10:00:00.000Z") },
              { createdAt: new Date("2026-03-05T10:00:10.000Z") },
            ],
          },
          {
            messages: [
              { createdAt: new Date("2026-03-05T11:00:00.000Z") },
              { createdAt: new Date("2026-03-05T11:01:30.000Z") },
            ],
          },
        ],
      },
    } as any;

    const adapter = createAdminTelemetryAdapter(prisma);
    const out = await adapter.reaskRate({ range: "7d" });

    expect(out.reaskRate).toBeCloseTo(50, 5);
    expect(out.thresholdMaxPct).toBe(QUALITY_SLO_THRESHOLDS.reaskRateMaxPct);
  });
});
