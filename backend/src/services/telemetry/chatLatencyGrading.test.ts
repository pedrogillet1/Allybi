import { describe, expect, test } from "@jest/globals";

import {
  buildLatencyBuckets,
  classifyLatencyBucket,
  gradeLatency,
} from "./chatLatencyGrading";

describe("chatLatencyGrading", () => {
  test("classifies navigation turns from nav answer modes", () => {
    expect(
      classifyLatencyBucket({
        answerMode: "nav_listing",
        operatorFamily: "answer",
        distinctDocs: 0,
      }),
    ).toBe("navigation");
  });

  test("classifies multi-doc compare turns", () => {
    expect(
      classifyLatencyBucket({
        answerMode: "doc_grounded_compare",
        distinctDocs: 2,
      }),
    ).toBe("multi_doc");
  });

  test("grades a fast streamed dataset as A+", () => {
    const samples = Array.from({ length: 20 }, () => ({
      ackMs: 80,
      ttft: 600,
      firstUsefulContentMs: 1200,
      totalMs: 5400,
      streamStarted: true,
      firstTokenReceived: true,
      streamEnded: true,
      wasAborted: false,
      clientDisconnected: false,
      chunksSent: 12,
      answerMode: "doc_grounded_answer",
      distinctDocs: 1,
      retrievalAdequate: true,
    }));
    const result = gradeLatency(samples, "global");

    expect(result.grade).toBe("A+");
    expect(result.score).toBeGreaterThan(90);
  });

  test("grades a slow buffered dataset as F", () => {
    const samples = Array.from({ length: 20 }, () => ({
      ackMs: 1800,
      ttft: 5200,
      firstUsefulContentMs: 9000,
      totalMs: 19000,
      streamStarted: true,
      firstTokenReceived: true,
      streamEnded: true,
      wasAborted: false,
      clientDisconnected: false,
      chunksSent: 2,
      answerMode: "general_answer",
      distinctDocs: 0,
      retrievalAdequate: false,
    }));
    const result = gradeLatency(samples, "global");

    expect(result.grade).toBe("F");
    expect(result.score).toBeLessThan(40);
  });

  test("builds bucket grades for mixed samples", () => {
    const result = buildLatencyBuckets([
      {
        ackMs: 70,
        ttft: 250,
        firstUsefulContentMs: 400,
        totalMs: 800,
        streamStarted: true,
        firstTokenReceived: true,
        chunksSent: 4,
        answerMode: "nav_listing",
        navDiscoverRequested: true,
      },
      {
        ackMs: 100,
        ttft: 900,
        firstUsefulContentMs: 1500,
        totalMs: 6500,
        streamStarted: true,
        firstTokenReceived: true,
        chunksSent: 10,
        answerMode: "doc_grounded_answer",
        distinctDocs: 1,
        retrievalAdequate: true,
      },
    ]);

    expect(result.global.count).toBe(2);
    expect(result.navigation.count).toBe(1);
    expect(result.single_doc.count).toBe(1);
  });
});
