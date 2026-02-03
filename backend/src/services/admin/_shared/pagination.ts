/**
 * Pagination Utilities
 * Cursor-based pagination helpers for stable, deterministic paging
 */

/**
 * Cursor format: base64-encoded JSON with id and timestamp
 */
interface CursorData {
  id: string;
  ts?: number;
}

/**
 * Encode cursor from id (and optional timestamp)
 */
export function encodeCursor(id: string, timestamp?: Date): string {
  const data: CursorData = { id };
  if (timestamp) {
    data.ts = timestamp.getTime();
  }
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

/**
 * Decode cursor to id (returns null if invalid)
 */
export function decodeCursor(cursor: unknown): string | null {
  if (typeof cursor !== 'string' || !cursor) return null;

  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const data: CursorData = JSON.parse(json);
    if (typeof data.id === 'string' && data.id) {
      return data.id;
    }
    return null;
  } catch {
    // Fallback: treat as raw ID
    return cursor;
  }
}

/**
 * Decode cursor with timestamp
 */
export function decodeCursorWithTimestamp(cursor: unknown): { id: string; timestamp?: Date } | null {
  if (typeof cursor !== 'string' || !cursor) return null;

  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const data: CursorData = JSON.parse(json);
    if (typeof data.id === 'string' && data.id) {
      return {
        id: data.id,
        timestamp: data.ts ? new Date(data.ts) : undefined,
      };
    }
    return null;
  } catch {
    // Fallback: treat as raw ID
    return { id: cursor };
  }
}

/**
 * Build Prisma cursor clause from decoded cursor
 */
export function buildCursorClause(cursor: unknown): { cursor: { id: string }; skip: 1 } | Record<string, never> {
  const id = decodeCursor(cursor);
  if (!id) return {};
  return { cursor: { id }, skip: 1 };
}

/**
 * Process page results and extract next cursor
 */
export function processPage<T extends { id: string }>(
  items: T[],
  limit: number
): { page: T[]; nextCursor: string | null } {
  const hasNext = items.length > limit;
  const page = hasNext ? items.slice(0, limit) : items;
  const lastItem = page[page.length - 1];
  const nextCursor = hasNext && lastItem ? encodeCursor(lastItem.id) : null;

  return { page, nextCursor };
}

/**
 * Process page with timestamp-based cursor
 */
export function processPageWithTimestamp<T extends { id: string }>(
  items: T[],
  limit: number,
  getTimestamp: (item: T) => Date
): { page: T[]; nextCursor: string | null } {
  const hasNext = items.length > limit;
  const page = hasNext ? items.slice(0, limit) : items;
  const lastItem = page[page.length - 1];
  const nextCursor = hasNext && lastItem
    ? encodeCursor(lastItem.id, getTimestamp(lastItem))
    : null;

  return { page, nextCursor };
}
