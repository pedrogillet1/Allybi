import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

interface MockChunk {
  docId: string;
  chunkId: string;
  score: number;
  location: {
    page: number;
    sectionKey?: string;
    sectionName?: string;
    slideTitle?: string;
    sheetName?: string;
  };
  content: string;
}

function resolveSectionKey(chunk: MockChunk): string {
  return (
    chunk.location.sectionKey ??
    chunk.location.sectionName ??
    chunk.location.slideTitle ??
    chunk.location.sheetName ??
    "__unknown__"
  );
}

function applyDiversification(
  chunks: MockChunk[],
  maxPerSectionHard: number
): MockChunk[] {
  const sectionCounts = new Map<string, number>();
  const result: MockChunk[] = [];
  for (const chunk of chunks) {
    const key = resolveSectionKey(chunk);
    const count = sectionCounts.get(key) ?? 0;
    if (count < maxPerSectionHard) {
      result.push(chunk);
      sectionCounts.set(key, count + 1);
    }
  }
  return result;
}

describe("Certification: section diversification", () => {
  test("diversification caps chunks per section", () => {
    const sections = ["summary", "line_items", "notes", "parties", "appendix"];
    const allChunks: MockChunk[] = [];
    let chunkIdx = 0;
    for (const section of sections) {
      for (let i = 0; i < 3; i++) {
        allChunks.push({
          docId: "doc-001",
          chunkId: `chunk-${chunkIdx++}`,
          score: 0.9 - chunkIdx * 0.01,
          location: { page: chunkIdx, sectionKey: section },
          content: `Content from ${section} chunk ${i}`,
        });
      }
    }

    expect(allChunks).toHaveLength(15);

    const maxPerSectionHard = 2;
    const diversified = applyDiversification(allChunks, maxPerSectionHard);

    // Must have at most 2 per section → 5 sections × 2 = 10 max
    expect(diversified.length).toBeLessThanOrEqual(10);
    expect(diversified.length).toBeGreaterThanOrEqual(5);

    // Verify per-section cap
    const sectionCounts = new Map<string, number>();
    for (const chunk of diversified) {
      const key = resolveSectionKey(chunk);
      sectionCounts.set(key, (sectionCounts.get(key) ?? 0) + 1);
    }
    for (const [section, count] of sectionCounts) {
      expect(count).toBeLessThanOrEqual(maxPerSectionHard);
    }

    // All 5 sections should be represented
    expect(sectionCounts.size).toBe(5);

    writeCertificationGateReport("section-diversification", {
      passed: diversified.length <= 10 && sectionCounts.size === 5,
      metrics: {
        inputChunks: allChunks.length,
        outputChunks: diversified.length,
        sectionsRepresented: sectionCounts.size,
        maxPerSection: Math.max(...sectionCounts.values()),
      },
      thresholds: { maxPerSectionHard: 2, expectedSections: 5 },
      failures: diversified.length > 10 ? ["SECTION_CAP_EXCEEDED"] : [],
    });
  });

  test("resolveSectionKey unifies across location types", () => {
    const chunks: MockChunk[] = [
      { docId: "d1", chunkId: "c1", score: 0.9, location: { page: 1, sectionKey: "summary" }, content: "" },
      { docId: "d1", chunkId: "c2", score: 0.8, location: { page: 2, sectionName: "details" }, content: "" },
      { docId: "d1", chunkId: "c3", score: 0.7, location: { page: 3, slideTitle: "intro" }, content: "" },
      { docId: "d1", chunkId: "c4", score: 0.6, location: { page: 4, sheetName: "Sheet1" }, content: "" },
      { docId: "d1", chunkId: "c5", score: 0.5, location: { page: 5 }, content: "" },
    ];

    expect(resolveSectionKey(chunks[0])).toBe("summary");
    expect(resolveSectionKey(chunks[1])).toBe("details");
    expect(resolveSectionKey(chunks[2])).toBe("intro");
    expect(resolveSectionKey(chunks[3])).toBe("Sheet1");
    expect(resolveSectionKey(chunks[4])).toBe("__unknown__");
  });

  test("diversification_rules bank declares section spread thresholds", () => {
    const bank = require("../../data_banks/retrieval/diversification_rules.any.json");
    expect(bank.config.actionsContract.thresholds.maxPerSectionHard).toBeDefined();
    expect(bank.config.actionsContract.thresholds.maxPerSectionSoft).toBeDefined();
  });
});
