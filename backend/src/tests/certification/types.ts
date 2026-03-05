export interface CertificationGateMetrics {
  [key: string]: string | number | boolean | null;
}

export interface CertificationGateThresholds {
  [key: string]: string | number | boolean | null;
}

export interface CertificationGateReport {
  gateId: string;
  passed: boolean;
  generatedAt: string;
  meta?: {
    commitHash?: string | null;
    source?: string;
    lifecycleEvent?: string;
  };
  metrics: CertificationGateMetrics;
  thresholds: CertificationGateThresholds;
  failures: string[];
  scoring?: {
    rubricScore100: number;
    rubric: Record<string, number>;
  };
}

export interface CertificationSummary {
  generatedAt: string;
  passed: boolean;
  totalGates: number;
  passedGates: number;
  failedGates: number;
  gates: CertificationGateReport[];
}
