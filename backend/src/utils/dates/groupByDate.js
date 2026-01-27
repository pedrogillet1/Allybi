/**
 * Group an array of objects by date bucket.
 * Returns { Today: [], Yesterday: [], '2 days ago': [], Older: [] }
 *
 * Each item must have `updatedAt` or `createdAt` (ISO string or Date).
 */
export function groupByDate(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const grouped = { Today: [], Yesterday: [], "2 days ago": [], Older: [] };

  for (const item of items || []) {
    const d = new Date(item.updatedAt || item.createdAt || Date.now());
    d.setHours(0, 0, 0, 0);
    const key =
      d.getTime() === today.getTime()
        ? "Today"
        : d.getTime() === yesterday.getTime()
          ? "Yesterday"
          : d.getTime() === twoDaysAgo.getTime()
            ? "2 days ago"
            : "Older";
    grouped[key].push(item);
  }

  return grouped;
}
