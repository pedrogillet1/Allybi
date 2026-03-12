// ── Grading types ──────────────────────────────────────────────

export type LetterGrade = "A" | "B" | "C" | "D" | "F";

export interface CheckResult {
  checkName: string;
  passed: boolean;
  weight: number;        // 0–1, all weights sum to 1.0
  score: number;         // 0 or weight (binary per check)
  detail?: string;       // human-readable failure reason
}

export interface BankGrade {
  filePath: string;       // relative to data_banks/
  bankId: string | null;  // _meta.id or null if missing
  category: string;       // subdirectory name
  checks: CheckResult[];
  rawScore: number;       // 0–100
  grade: LetterGrade;
  failures: string[];     // human-readable list
}

export interface CategoryRollup {
  category: string;
  totalBanks: number;
  avgScore: number;
  gradeDistribution: Record<LetterGrade, number>;
  worstBanks: Array<{ filePath: string; score: number; grade: LetterGrade }>;
}

export interface GradingReport {
  generatedAt: string;
  totalFiles: number;
  overallScore: number;
  overallGrade: LetterGrade;
  gradeDistribution: Record<LetterGrade, number>;
  categoryRollups: CategoryRollup[];
  allBanks: BankGrade[];
  summary: {
    totalChecksRun: number;
    totalChecksPassed: number;
    totalChecksFailed: number;
    topFailures: Array<{ checkName: string; failCount: number }>;
  };
}

export function scoreToGrade(score: number): LetterGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
