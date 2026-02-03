// file: src/analytics/calculators/wau.calculator.ts
// Weekly Active Users calculator - pure function, no DB/IO

export type ActivityEvent = {
  ts: string;
  userId?: string;
  sessionId?: string;
  type: string;
};

export type WAUResult = {
  wau: number;
  windowDays: 7;
  startDay: string;
  endDay: string;
};

/**
 * Extracts UTC date string (YYYY-MM-DD) from ISO timestamp
 */
function toUTCDay(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Subtracts N days from a date string, returns YYYY-MM-DD
 */
function subtractDays(dayStr: string, n: number): string {
  const d = new Date(dayStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Calculate Weekly Active Users
 *
 * WAU = count of distinct userId with >=1 ActivityEvent in the last 7 UTC days (inclusive)
 * Events with missing userId are ignored.
 *
 * @param events - Array of activity events
 * @param endTs - End timestamp (the "current" day to measure from)
 * @returns WAU count and window details
 */
export function calculateWAU(events: ActivityEvent[], endTs: string): WAUResult {
  const endDay = toUTCDay(endTs);
  if (!endDay) {
    return { wau: 0, windowDays: 7, startDay: '', endDay: '' };
  }

  // 7-day window: end day inclusive, going back 6 days
  const startDay = subtractDays(endDay, 6);

  if (!events || events.length === 0) {
    return { wau: 0, windowDays: 7, startDay, endDay };
  }

  const activeUsers = new Set<string>();

  for (const event of events) {
    if (!event.userId || !event.ts) continue;

    const day = toUTCDay(event.ts);
    if (!day) continue;

    // Check if within 7-day window
    if (day >= startDay && day <= endDay) {
      activeUsers.add(event.userId);
    }
  }

  return {
    wau: activeUsers.size,
    windowDays: 7,
    startDay,
    endDay,
  };
}

// Test vectors
// endTs: "2024-01-21T23:59:59Z"
// Window: 2024-01-15 to 2024-01-21 (7 days)
// Input: [{ ts: "2024-01-15T10:00:00Z", userId: "u1", type: "chat" }, { ts: "2024-01-20T10:00:00Z", userId: "u2", type: "chat" }, { ts: "2024-01-10T10:00:00Z", userId: "u3", type: "chat" }]
// Expected: { wau: 2, windowDays: 7, startDay: "2024-01-15", endDay: "2024-01-21" }
// u3 is excluded (before window)
