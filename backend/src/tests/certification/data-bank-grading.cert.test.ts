import { describe, test, expect, beforeAll } from "@jest/globals";
import path from "path";
import fs from "fs";
import { writeCertificationGateReport } from "./reporting";
import {
  loadReferenceData,
  discoverBankFiles,
  gradeBank,
} from "./data-bank-grading.engine";
import type { BankGrade, CategoryRollup, GradingReport } from "./data-bank-grading.types";
import { scoreToGrade } from "./data-bank-grading.types";

const REPORT_PATH = path.resolve(process.cwd(), "reports/cert/data-bank-grading-report.json");

// ── Thresholds (tune these as quality improves) ───────────────
const THRESHOLDS = {
  minOverallScore: 60,         // overall system must be ≥ D
  maxFGradeBanks: 50,          // no more than 50 F-grade banks
  minCategoryAvg: 50,          // every category avg ≥ 50
};

describe("Certification: data bank grading", () => {
  let report: GradingReport;

  beforeAll(() => {
    loadReferenceData();
    const files = discoverBankFiles();
    const grades: BankGrade[] = files.map((f) => gradeBank(f.abs, f.rel));

    // Category rollups
    const byCategory = new Map<string, BankGrade[]>();
    for (const g of grades) {
      const list = byCategory.get(g.category) || [];
      list.push(g);
      byCategory.set(g.category, list);
    }

    const categoryRollups: CategoryRollup[] = Array.from(byCategory.entries())
      .map(([category, banks]) => {
        const avgScore = Math.round(banks.reduce((s, b) => s + b.rawScore, 0) / banks.length);
        const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        banks.forEach((b) => dist[b.grade]++);
        const worst = banks
          .sort((a, b) => a.rawScore - b.rawScore)
          .slice(0, 5)
          .map((b) => ({ filePath: b.filePath, score: b.rawScore, grade: b.grade }));
        return { category, totalBanks: banks.length, avgScore, gradeDistribution: dist as any, worstBanks: worst };
      })
      .sort((a, b) => a.avgScore - b.avgScore); // worst categories first

    // Failure frequency
    const failCounts = new Map<string, number>();
    for (const g of grades) {
      for (const c of g.checks) {
        if (!c.passed) failCounts.set(c.checkName, (failCounts.get(c.checkName) || 0) + 1);
      }
    }
    const topFailures = Array.from(failCounts.entries())
      .map(([checkName, failCount]) => ({ checkName, failCount }))
      .sort((a, b) => b.failCount - a.failCount);

    const totalChecks = grades.reduce((s, g) => s + g.checks.length, 0);
    const passedChecks = grades.reduce((s, g) => s + g.checks.filter((c) => c.passed).length, 0);
    const overallScore = Math.round(grades.reduce((s, g) => s + g.rawScore, 0) / grades.length);
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    grades.forEach((g) => dist[g.grade]++);

    report = {
      generatedAt: new Date().toISOString(),
      totalFiles: grades.length,
      overallScore,
      overallGrade: scoreToGrade(overallScore),
      gradeDistribution: dist as any,
      categoryRollups,
      allBanks: grades,
      summary: {
        totalChecksRun: totalChecks,
        totalChecksPassed: passedChecks,
        totalChecksFailed: totalChecks - passedChecks,
        topFailures,
      },
    };

    // Write detailed report
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

    // Write cert gate report
    writeCertificationGateReport("data-bank-grading", {
      passed: overallScore >= THRESHOLDS.minOverallScore,
      metrics: {
        totalFiles: report.totalFiles,
        overallScore: report.overallScore,
        overallGrade: report.overallGrade,
        aGrade: dist.A || 0,
        bGrade: dist.B || 0,
        cGrade: dist.C || 0,
        dGrade: dist.D || 0,
        fGrade: dist.F || 0,
        totalChecksFailed: report.summary.totalChecksFailed,
      },
      thresholds: THRESHOLDS,
      failures: report.summary.topFailures.slice(0, 10).map(
        (f) => `${f.checkName}: ${f.failCount} banks failed`,
      ),
    });
  });

  test("overall system score meets minimum threshold", () => {
    console.log(`\n📊 OVERALL: ${report.overallGrade} (${report.overallScore}/100)`);
    console.log(`   Files graded: ${report.totalFiles}`);
    console.log(`   A: ${report.gradeDistribution.A} | B: ${report.gradeDistribution.B} | C: ${report.gradeDistribution.C} | D: ${report.gradeDistribution.D} | F: ${report.gradeDistribution.F}`);
    expect(report.overallScore).toBeGreaterThanOrEqual(THRESHOLDS.minOverallScore);
  });

  test("F-grade bank count within budget", () => {
    const fCount = report.gradeDistribution.F;
    console.log(`   F-grade banks: ${fCount} (budget: ${THRESHOLDS.maxFGradeBanks})`);
    expect(fCount).toBeLessThanOrEqual(THRESHOLDS.maxFGradeBanks);
  });

  test("no category below minimum average", () => {
    const failing = report.categoryRollups.filter((c) => c.avgScore < THRESHOLDS.minCategoryAvg);
    if (failing.length > 0) {
      console.log(`   Failing categories:`);
      failing.forEach((c) => console.log(`     ${c.category}: ${c.avgScore}/100`));
    }
    expect(failing.length).toBe(0);
  });

  test("top failure checks logged for remediation", () => {
    console.log(`\n🔍 TOP FAILURES:`);
    report.summary.topFailures.slice(0, 10).forEach((f) => {
      console.log(`   ${f.checkName}: ${f.failCount} banks`);
    });
    // informational — always passes
    expect(true).toBe(true);
  });

  test("worst banks per category logged", () => {
    console.log(`\n📉 WORST CATEGORIES:`);
    report.categoryRollups.slice(0, 5).forEach((c) => {
      console.log(`   ${c.category}: avg ${c.avgScore}/100 (${c.totalBanks} banks)`);
      c.worstBanks.slice(0, 3).forEach((b) => {
        console.log(`     ${b.grade} ${b.score}/100 — ${b.filePath}`);
      });
    });
    expect(true).toBe(true);
  });

  test("detailed report written to disk", () => {
    expect(fs.existsSync(REPORT_PATH)).toBe(true);
    console.log(`\n✅ Full report: ${REPORT_PATH}`);
  });
});
