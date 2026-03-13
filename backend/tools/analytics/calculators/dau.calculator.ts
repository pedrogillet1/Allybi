// file: src/analytics/calculators/dau.calculator.ts
// Daily Active Users calculator - pure function, no DB/IO

export type ActivityEvent = {
  ts: string;
  userId?: string;
  sessionId?: string;
  type: string;
};

export type DAUOptions = {
  startTs?: string;
  endTs?: string;
};

export type DAUResult = {
  series: Array<{ day: string; dau: number }>;
  totalDistinctUsers: number;
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
 * Calculate Daily Active Users from activity events
 *
 * DAU = count of distinct userId with >=1 ActivityEvent in a UTC day
 * Events with missing userId are ignored.
 *
 * @param events - Array of activity events
 * @param opts - Optional start/end timestamps to restrict series
 * @returns DAU series by day and total distinct users
 */
export function calculateDAU(
  events: ActivityEvent[],
  opts?: DAUOptions,
): DAUResult {
  if (!events || events.length === 0) {
    return { series: [], totalDistinctUsers: 0 };
  }

  const startDay = opts?.startTs ? toUTCDay(opts.startTs) : null;
  const endDay = opts?.endTs ? toUTCDay(opts.endTs) : null;

  // Map: day -> Set<userId>
  const dayUsers = new Map<string, Set<string>>();
  const allUsers = new Set<string>();

  for (const event of events) {
    if (!event.userId || !event.ts) continue;

    const day = toUTCDay(event.ts);
    if (!day) continue;

    // Filter by date range if provided
    if (startDay && day < startDay) continue;
    if (endDay && day > endDay) continue;

    if (!dayUsers.has(day)) {
      dayUsers.set(day, new Set());
    }
    dayUsers.get(day)!.add(event.userId);
    allUsers.add(event.userId);
  }

  // Build sorted series
  const days = Array.from(dayUsers.keys()).sort();
  const series = days.map((day) => ({
    day,
    dau: dayUsers.get(day)!.size,
  }));

  return {
    series,
    totalDistinctUsers: allUsers.size,
  };
}

// Test vectors (for validation)
// Input: [{ ts: "2024-01-15T10:00:00Z", userId: "u1", type: "chat" }, { ts: "2024-01-15T14:00:00Z", userId: "u1", type: "chat" }, { ts: "2024-01-15T09:00:00Z", userId: "u2", type: "upload" }]
// Expected: { series: [{ day: "2024-01-15", dau: 2 }], totalDistinctUsers: 2 }
