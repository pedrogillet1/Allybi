/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DateRange } from "../types";

/**
 * users.repo.ts (Koda)
 * --------------------
 * Read-only repository for Users + activity hints.
 *
 * Use cases:
 *  - Admin Users screen
 *  - Quick search (email/name/phone)
 *  - Storage usage overview
 *
 * Notes:
 *  - Never return sensitive fields (passwordHash, salt, keys, recoveryKeyHash)
 *  - Keep query bounded and safe
 */

export interface UsersRepoConfig {
  maxLimit: number;
  defaultLimit: number;
}

export interface UsersFilters {
  range: DateRange;
  query?: string; // search term
  role?: string;
  subscriptionTier?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserRow {
  id: string;
  email: string;

  firstName?: string | null;
  lastName?: string | null;

  role?: string | null;
  subscriptionTier?: string | null;

  createdAt: string;
  updatedAt: string;

  isEmailVerified?: boolean | null;
  isPhoneVerified?: boolean | null;

  storageUsedBytes?: number | null;
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export class UsersRepo {
  constructor(private prisma: any, private cfg: UsersRepoConfig) {}

  async list(filters: UsersFilters, opts: { limit?: number; cursor?: string | null } = {}): Promise<CursorPage<UserRow>> {
    const limit = clampInt(opts.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);
    const cursor = opts.cursor || null;

    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.role) where.role = filters.role;
    if (filters.subscriptionTier) where.subscriptionTier = filters.subscriptionTier;

    if (filters.query) {
      const q = filters.query.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await this.prisma.user.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
        updatedAt: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        storageUsedBytes: true,
      },
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

    return {
      items: page.map((r: any) => ({
        id: r.id,
        email: r.email,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        role: r.role ?? null,
        subscriptionTier: r.subscriptionTier ?? null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
        isEmailVerified: Boolean(r.isEmailVerified ?? false),
        isPhoneVerified: Boolean(r.isPhoneVerified ?? false),
        storageUsedBytes: typeof r.storageUsedBytes === "bigint" ? Number(r.storageUsedBytes) : Number(r.storageUsedBytes ?? 0),
      })),
      nextCursor,
    };
  }

  async search(query: string, limit = 20) {
    const take = clampInt(limit, 1, 50, 20);
    const q = (query || "").trim();
    if (!q) return { items: [] as UserRow[] };

    const rows = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phoneNumber: { contains: q, mode: "insensitive" } },
        ],
      },
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
        updatedAt: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        storageUsedBytes: true,
      },
    });

    return {
      items: rows.map((r: any) => ({
        id: r.id,
        email: r.email,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        role: r.role ?? null,
        subscriptionTier: r.subscriptionTier ?? null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
        isEmailVerified: Boolean(r.isEmailVerified ?? false),
        isPhoneVerified: Boolean(r.isPhoneVerified ?? false),
        storageUsedBytes: typeof r.storageUsedBytes === "bigint" ? Number(r.storageUsedBytes) : Number(r.storageUsedBytes ?? 0),
      })),
    };
  }
}

export default UsersRepo;
