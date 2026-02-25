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
  metrics: CertificationGateMetrics;
  thresholds: CertificationGateThresholds;
  failures: string[];
}

export interface CertificationSummary {
  generatedAt: string;
  passed: boolean;
  totalGates: number;
  passedGates: number;
  failedGates: number;
  gates: CertificationGateReport[];
}
