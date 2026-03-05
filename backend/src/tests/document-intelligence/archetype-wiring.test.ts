import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";

const PLANNER_PATH = path.resolve(
  __dirname,
  "../../services/core/banks/bankSelectionPlanner.service.ts",
);

describe("archetype wiring proof", () => {
  const src = fs.readFileSync(PLANNER_PATH, "utf-8");

  it("keeps doc_archetypes_ in domain core banks", () => {
    expect(src).toContain("doc_archetypes_");
  });

  it("scoreDomainCandidates references all 15 canonical domains", () => {
    const allDomains = [
      "legal",
      "finance",
      "medical",
      "accounting",
      "ops",
      "banking",
      "billing",
      "education",
      "everyday",
      "housing",
      "hr_payroll",
      "identity",
      "insurance",
      "tax",
      "travel",
    ];

    for (const domain of allDomains) {
      expect(src.includes(`"${domain}"`) || src.includes(`'${domain}'`)).toBe(
        true,
      );
    }
  });
});
