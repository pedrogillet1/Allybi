// file: src/analytics/calculators/weakEvidence.calculator.ts
// Weak evidence rate calculator - pure function, no DB/IO

export type QueryQualityEvent = {
  ts: string;
  domain?: string;
  intent?: string;
  topScore?: number;
  weakEvidence?: boolean;
  citationsCount?: number;
  fallbackUsed?: boolean;
};

export type DomainWeakEvidence = {
  domain: string;
  total: number;
  weak: number;
  rate: number;
};

export type WeakEvidenceResult = {
  total: number;
  weak: number;
  rate: number;
  byDomain: DomainWeakEvidence[];
};

/**
 * Calculate weak evidence rate from query quality events
 *
 * Weak evidence rate = queries with weakEvidence=true / total queries
 * Also breaks down by domain (missing domain = "unknown")
 *
 * @param queries - Array of query quality events
 * @returns Weak evidence statistics overall and by domain
 */
export function calculateWeakEvidence(queries: QueryQualityEvent[]): WeakEvidenceResult {
  const emptyResult: WeakEvidenceResult = {
    total: 0,
    weak: 0,
    rate: 0,
    byDomain: [],
  };

  if (!queries || queries.length === 0) {
    return emptyResult;
  }

  // Aggregate by domain
  const domainStats = new Map<string, { total: number; weak: number }>();
  let totalCount = 0;
  let totalWeak = 0;

  for (const query of queries) {
    const domain = query.domain || 'unknown';

    if (!domainStats.has(domain)) {
      domainStats.set(domain, { total: 0, weak: 0 });
    }

    const stats = domainStats.get(domain)!;
    stats.total++;
    totalCount++;

    if (query.weakEvidence === true) {
      stats.weak++;
      totalWeak++;
    }
  }

  // Build byDomain array
  const byDomain: DomainWeakEvidence[] = [];

  for (const [domain, stats] of Array.from(domainStats.entries())) {
    byDomain.push({
      domain,
      total: stats.total,
      weak: stats.weak,
      rate: stats.total > 0 ? stats.weak / stats.total : 0,
    });
  }

  // Sort by weak count descending
  byDomain.sort((a, b) => b.weak - a.weak);

  return {
    total: totalCount,
    weak: totalWeak,
    rate: totalCount > 0 ? totalWeak / totalCount : 0,
    byDomain,
  };
}

/**
 * Calculate weak evidence rate over time series (by day)
 */
export function calculateWeakEvidenceSeries(
  queries: QueryQualityEvent[]
): Array<{ day: string; total: number; weak: number; rate: number }> {
  if (!queries || queries.length === 0) {
    return [];
  }

  // Group by day
  const byDay = new Map<string, { total: number; weak: number }>();

  for (const query of queries) {
    const d = new Date(query.ts);
    if (isNaN(d.getTime())) continue;

    const day = d.toISOString().slice(0, 10);

    if (!byDay.has(day)) {
      byDay.set(day, { total: 0, weak: 0 });
    }

    const stats = byDay.get(day)!;
    stats.total++;

    if (query.weakEvidence === true) {
      stats.weak++;
    }
  }

  // Build sorted series
  const days = Array.from(byDay.keys()).sort();

  return days.map(day => {
    const stats = byDay.get(day)!;
    return {
      day,
      total: stats.total,
      weak: stats.weak,
      rate: stats.total > 0 ? stats.weak / stats.total : 0,
    };
  });
}

// Test vectors
// Input: [
//   { ts: "2024-01-15T10:00:00Z", domain: "finance", weakEvidence: false },
//   { ts: "2024-01-15T10:01:00Z", domain: "finance", weakEvidence: true },
//   { ts: "2024-01-15T10:02:00Z", domain: "legal", weakEvidence: false },
//   { ts: "2024-01-15T10:03:00Z", weakEvidence: true } // no domain
// ]
// Expected: { total: 4, weak: 2, rate: 0.5, byDomain: [{ domain: "finance", total: 2, weak: 1, rate: 0.5 }, { domain: "unknown", total: 1, weak: 1, rate: 1 }, { domain: "legal", total: 1, weak: 0, rate: 0 }] }
