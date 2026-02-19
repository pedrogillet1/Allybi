// file: src/analytics/calculators/retention.calculator.ts
// Cohort-based retention calculator - pure function, no DB/IO

export type SignupRecord = {
  userId: string;
  signupTs: string;
};

export type ActivityEvent = {
  ts: string;
  userId?: string;
  sessionId?: string;
  type: string;
};

export type RetentionOptions = {
  maxCohorts?: number; // Limit to last N cohorts
};

export type CohortRetention = {
  cohortDay: string;
  cohortSize: number;
  retention: Array<{
    windowDays: number;
    retained: number;
    rate: number;
  }>;
};

/**
 * Extracts UTC date string (YYYY-MM-DD) from ISO timestamp
 */
function toUTCDay(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Adds N days to a date string, returns YYYY-MM-DD
 */
function addDays(dayStr: string, n: number): string {
  const d = new Date(dayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Calculate cohort-based retention
 *
 * For each cohort (users who signed up on same day), compute retention at each window.
 * Retention at D+N = user had activity on day D+N (not cumulative).
 *
 * @param signups - Array of signup records with userId and signupTs
 * @param activity - Array of activity events
 * @param windowsDays - Array of day offsets to measure (e.g., [1, 7, 30])
 * @param opts - Optional: maxCohorts to limit output
 * @returns Array of cohort retention data
 */
export function calculateRetention(
  signups: SignupRecord[],
  activity: ActivityEvent[],
  windowsDays: number[],
  opts?: RetentionOptions,
): CohortRetention[] {
  if (
    !signups ||
    signups.length === 0 ||
    !windowsDays ||
    windowsDays.length === 0
  ) {
    return [];
  }

  // Build cohorts: Map<cohortDay, Set<userId>>
  const cohorts = new Map<string, Set<string>>();
  const userSignupDay = new Map<string, string>();

  for (const signup of signups) {
    if (!signup.userId || !signup.signupTs) continue;
    const day = toUTCDay(signup.signupTs);
    if (!day) continue;

    if (!cohorts.has(day)) {
      cohorts.set(day, new Set());
    }
    cohorts.get(day)!.add(signup.userId);
    userSignupDay.set(signup.userId, day);
  }

  // Build activity map: Map<userId, Set<activityDay>>
  const userActivityDays = new Map<string, Set<string>>();

  for (const event of activity) {
    if (!event.userId || !event.ts) continue;
    const day = toUTCDay(event.ts);
    if (!day) continue;

    if (!userActivityDays.has(event.userId)) {
      userActivityDays.set(event.userId, new Set());
    }
    userActivityDays.get(event.userId)!.add(day);
  }

  // Sort cohort days descending (most recent first) for maxCohorts limit
  let cohortDays = Array.from(cohorts.keys()).sort().reverse();

  if (opts?.maxCohorts && opts.maxCohorts > 0) {
    cohortDays = cohortDays.slice(0, opts.maxCohorts);
  }

  // Re-sort ascending for output
  cohortDays.sort();

  // Calculate retention for each cohort
  const results: CohortRetention[] = [];

  for (const cohortDay of cohortDays) {
    const cohortUsers = cohorts.get(cohortDay)!;
    const cohortSize = cohortUsers.size;

    const retention = windowsDays.map((windowDays) => {
      const targetDay = addDays(cohortDay, windowDays);
      let retained = 0;

      for (const userId of Array.from(cohortUsers)) {
        const activityDays = userActivityDays.get(userId);
        if (activityDays && activityDays.has(targetDay)) {
          retained++;
        }
      }

      return {
        windowDays,
        retained,
        rate: cohortSize > 0 ? retained / cohortSize : 0,
      };
    });

    results.push({
      cohortDay,
      cohortSize,
      retention,
    });
  }

  return results;
}

// Test vectors
// signups: [{ userId: "u1", signupTs: "2024-01-01T10:00:00Z" }, { userId: "u2", signupTs: "2024-01-01T12:00:00Z" }]
// activity: [{ ts: "2024-01-02T10:00:00Z", userId: "u1", type: "chat" }, { ts: "2024-01-08T10:00:00Z", userId: "u1", type: "chat" }]
// windowsDays: [1, 7]
// Expected: [{ cohortDay: "2024-01-01", cohortSize: 2, retention: [{ windowDays: 1, retained: 1, rate: 0.5 }, { windowDays: 7, retained: 1, rate: 0.5 }] }]
