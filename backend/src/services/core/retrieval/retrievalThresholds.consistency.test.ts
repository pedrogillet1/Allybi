import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

const BANK_ROOT = path.resolve(__dirname, "../../../data_banks/retrieval");
function loadBank(name: string) {
  return JSON.parse(fs.readFileSync(path.join(BANK_ROOT, name), "utf-8"));
}

describe("Retrieval threshold consistency", () => {
  test("negatives bank has minRelevanceScore field matching code expectation", () => {
    const negatives = loadBank("retrieval_negatives.any.json");
    const threshold =
      negatives.config?.actionsContract?.thresholds?.minRelevanceScore;
    expect(threshold).toBeDefined();
    expect(threshold).toBe(0.55);
  });

  test("evidence_packaging rule filter_below_min_scores chunkRelevance matches config", () => {
    const packaging = loadBank("evidence_packaging.any.json");
    const configMin =
      packaging.config?.actionsContract?.thresholds?.minChunkRelevance;
    const filterRule = packaging.rules?.find(
      (r: any) => r.id === "filter_below_min_scores",
    );
    const ruleValue = filterRule?.when?.any?.find(
      (c: any) => c.path === "metrics.chunkRelevance",
    )?.value;
    expect(ruleValue).toBe(configMin);
  });
});
