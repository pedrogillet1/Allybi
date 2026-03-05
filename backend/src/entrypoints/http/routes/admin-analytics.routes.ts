// backend/src/routes/adminAnalytics.routes.ts
//
// Admin Analytics routes for the legacy frontend dashboard.
// Serves /api/admin/analytics/* endpoints with { success: true, data } response format.
// Queries Prisma directly to build the data shapes the frontend components expect.

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticateAdmin } from "../../../middleware/admin.middleware";
import { requireAdminKey } from "../../../middleware/adminKey.middleware";
import { authLimiter } from "../../../middleware/rateLimit.middleware";
import prisma from "../../../platform/db/prismaClient";

const router = Router();

router.use(authenticateAdmin);

// Gate 2: Require X-KODA-ADMIN-KEY header in production
if (process.env.NODE_ENV === "production") {
  router.use(requireAdminKey);
}

router.use(authLimiter);
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// ── Encryption helpers ──────────────────────────────────────────────────────

/**
 * Return the encrypted filename for display. If the document has an encrypted
 * payload we show that ciphertext; otherwise we return the plaintext filename.
 */
function encryptedDisplayName(doc: {
  filename?: string | null;
  filenameEncrypted?: string | null;
}): string {
  return doc.filenameEncrypted ?? doc.filename ?? "Unnamed Document";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d: Date = new Date()): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ok(res: Response, data: unknown) {
  res.json({ success: true, data });
}

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

// ── GET /overview ───────────────────────────────────────────────────────────

router.get(
  "/overview",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const today = startOfDay();
      const weekAgo = startOfWeek();

      const [
        totalUsers,
        newUsersToday,
        activeUsersToday,
        activeUsersWeek,
        totalConversations,
        newConvsToday,
        totalMessages,
        messagesToday,
        totalDocuments,
        docsToday,
        storageAgg,
        errorCount24h,
        tokenAgg,
        messageTrend,
        peakHours,
        docsByType,
        recentUploads,
        costTrend,
        mostActiveUsers,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.session
          .groupBy({
            by: ["userId"],
            where: { lastActivityAt: { gte: today }, isActive: true },
          })
          .then((r) => r.length),
        prisma.session
          .groupBy({
            by: ["userId"],
            where: { lastActivityAt: { gte: weekAgo }, isActive: true },
          })
          .then((r) => r.length),
        prisma.conversation.count(),
        prisma.conversation.count({ where: { createdAt: { gte: today } } }),
        prisma.message.count(),
        prisma.message.count({ where: { createdAt: { gte: today } } }),
        prisma.document.count(),
        prisma.document.count({ where: { createdAt: { gte: today } } }),
        prisma.user.aggregate({ _sum: { storageUsedBytes: true } }),
        prisma.errorLog.count({ where: { createdAt: { gte: daysAgo(1) } } }),
        prisma.tokenUsage.aggregate({ _sum: { totalCost: true } }),
        // Message trend (last 7 days)
        prisma.$queryRaw<{ date: Date; count: bigint }[]>`
        SELECT DATE(m."createdAt") as date, COUNT(*)::bigint as count
        FROM messages m
        WHERE m."createdAt" >= ${weekAgo}
        GROUP BY DATE(m."createdAt")
        ORDER BY date ASC
      `,
        // Peak usage hours
        prisma.$queryRaw<{ hour: number; count: bigint }[]>`
        SELECT EXTRACT(HOUR FROM m."createdAt")::int as hour, COUNT(*)::bigint as count
        FROM messages m
        WHERE m."createdAt" >= ${weekAgo}
        GROUP BY hour
        ORDER BY count DESC
        LIMIT 24
      `,
        // Documents by type
        prisma.$queryRaw<{ type: string; count: bigint }[]>`
        SELECT d."mimeType" as type, COUNT(*)::bigint as count
        FROM documents d
        GROUP BY d."mimeType"
        ORDER BY count DESC
      `,
        // Recent uploads (include encryption fields for decryption)
        prisma.document.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            userId: true,
            filename: true,
            filenameEncrypted: true,
            createdAt: true,
            user: { select: { email: true } },
          },
        }),
        // Cost trend (last 7 days)
        prisma.$queryRaw<{ date: Date; cost: number }[]>`
        SELECT DATE(t."createdAt") as date, COALESCE(SUM(t."totalCost"), 0)::float as cost
        FROM token_usage t
        WHERE t."createdAt" >= ${weekAgo}
        GROUP BY DATE(t."createdAt")
        ORDER BY date ASC
      `,
        // Most active users
        prisma.$queryRaw<
          {
            email: string;
            messageCount: bigint;
            conversationCount: bigint;
            documentCount: bigint;
          }[]
        >`
        SELECT u.email,
          (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m."conversationId" WHERE c."userId" = u.id)::bigint as "messageCount",
          (SELECT COUNT(*) FROM conversations c WHERE c."userId" = u.id)::bigint as "conversationCount",
          (SELECT COUNT(*) FROM documents d WHERE d."userId" = u.id)::bigint as "documentCount"
        FROM users u
        ORDER BY "messageCount" DESC
        LIMIT 5
      `,
      ]);

      const storageBigInt = storageAgg._sum.storageUsedBytes ?? BigInt(0);
      const totalStorageGB = Number(storageBigInt) / (1024 * 1024 * 1024);
      const totalCost = tokenAgg._sum.totalCost ?? 0;
      const costPerUser = totalUsers > 0 ? totalCost / totalUsers : 0;
      const prevWeekUsers = await prisma.user.count({
        where: { createdAt: { lt: weekAgo } },
      });
      const userGrowthRate =
        prevWeekUsers > 0
          ? ((totalUsers - prevWeekUsers) / prevWeekUsers) * 100
          : 0;

      // System health
      const memUsage = process.memoryUsage();
      const memPercent = Math.round(
        (memUsage.heapUsed / memUsage.heapTotal) * 100,
      );
      const dbSize = await prisma.$queryRaw<
        { size: string }[]
      >`SELECT pg_size_pretty(pg_database_size(current_database())) as size`;
      const dbConns = await prisma.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*)::bigint as count FROM pg_stat_activity WHERE datname = current_database()`;

      ok(res, {
        users: {
          totalUsers,
          userGrowthRate: Math.round(userGrowthRate * 100) / 100,
          newUsersToday,
          activeUsersToday,
          activeUsersThisWeek: activeUsersWeek,
          mostActiveUsers: mostActiveUsers.map((u) => ({
            email: u.email,
            messageCount: Number(u.messageCount),
            conversationCount: Number(u.conversationCount),
            documentCount: Number(u.documentCount),
          })),
          userGrowthTrend: [],
        },
        conversations: {
          totalConversations,
          newConversationsToday: newConvsToday,
          messagesToday,
          totalMessages,
          messagesTrend: messageTrend.map((r) => ({
            date: r.date,
            count: Number(r.count),
          })),
          peakUsageHours: peakHours.map((r) => ({
            hour: r.hour,
            messageCount: Number(r.count),
          })),
        },
        documents: {
          totalDocuments,
          documentsUploadedToday: docsToday,
          totalStorageGB: Math.round(totalStorageGB * 100) / 100,
          documentsByType: docsByType.map((r) => ({
            type: r.type,
            count: Number(r.count),
          })),
          recentUploads: recentUploads.map((d) => ({
            filename: encryptedDisplayName(d),
            userEmail: d.user.email,
            uploadedAt: d.createdAt,
          })),
        },
        costs: {
          totalEstimatedCost: Math.round(totalCost * 10000) / 10000,
          costPerUser: Math.round(costPerUser * 10000) / 10000,
          costTrend: costTrend.map((r) => ({ date: r.date, cost: r.cost })),
        },
        systemHealth: {
          errorRate:
            totalMessages > 0
              ? Math.round((errorCount24h / totalMessages) * 10000) / 100
              : 0,
          databaseSize: dbSize[0]?.size ?? "N/A",
          databaseConnections: Number(dbConns[0]?.count ?? 0),
          memoryUsage: { percentage: memPercent },
          uptime: process.uptime(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── GET /quick-stats ────────────────────────────────────────────────────────

router.get(
  "/quick-stats",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const today = startOfDay();

      const [
        totalUsers,
        activeToday,
        messagesToday,
        docsToday,
        errorsToday,
        totalConversations,
        totalDocuments,
        storageAgg,
        tokenCostMonth,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.session
          .groupBy({
            by: ["userId"],
            where: { lastActivityAt: { gte: today }, isActive: true },
          })
          .then((r) => r.length),
        prisma.message.count({ where: { createdAt: { gte: today } } }),
        prisma.document.count({ where: { createdAt: { gte: today } } }),
        prisma.errorLog.count({ where: { createdAt: { gte: today } } }),
        prisma.conversation.count(),
        prisma.document.count(),
        prisma.user.aggregate({ _sum: { storageUsedBytes: true } }),
        prisma.tokenUsage.aggregate({
          where: { createdAt: { gte: startOfMonth() } },
          _sum: { totalCost: true },
        }),
      ]);

      const storageGB =
        Number(storageAgg._sum.storageUsedBytes ?? BigInt(0)) /
        (1024 * 1024 * 1024);
      const totalMsgs = await prisma.message.count({
        where: { createdAt: { gte: today } },
      });
      const errorRate = totalMsgs > 0 ? (errorsToday / totalMsgs) * 100 : 0;

      ok(res, {
        activeUsers: activeToday,
        activeUsersToday: activeToday,
        messagesToday,
        documentsToday: docsToday,
        errorsToday,
        totalUsers,
        totalConversations,
        totalDocuments,
        errorRate: Math.round(errorRate * 100) / 100,
        estimatedCostThisMonth:
          Math.round((tokenCostMonth._sum.totalCost ?? 0) * 10000) / 10000,
        storageUsedGB: Math.round(storageGB * 100) / 100,
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── GET /users ──────────────────────────────────────────────────────────────

router.get(
  "/users",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const today = startOfDay();
      const weekAgo = startOfWeek();
      const monthAgo = startOfMonth();

      const [
        totalUsers,
        newToday,
        newWeek,
        newMonth,
        activeToday,
        activeWeek,
        activeMonth,
        mostActive,
        inactiveUsers,
        tiers,
        growthTrend,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.session
          .groupBy({
            by: ["userId"],
            where: { lastActivityAt: { gte: today }, isActive: true },
          })
          .then((r) => r.length),
        prisma.session
          .groupBy({
            by: ["userId"],
            where: { lastActivityAt: { gte: weekAgo }, isActive: true },
          })
          .then((r) => r.length),
        prisma.session
          .groupBy({
            by: ["userId"],
            where: { lastActivityAt: { gte: monthAgo }, isActive: true },
          })
          .then((r) => r.length),
        prisma.$queryRaw<
          {
            email: string;
            messageCount: bigint;
            conversationCount: bigint;
            documentCount: bigint;
          }[]
        >`
        SELECT u.email,
          (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m."conversationId" WHERE c."userId" = u.id)::bigint as "messageCount",
          (SELECT COUNT(*) FROM conversations c WHERE c."userId" = u.id)::bigint as "conversationCount",
          (SELECT COUNT(*) FROM documents d WHERE d."userId" = u.id)::bigint as "documentCount"
        FROM users u
        ORDER BY "messageCount" DESC
        LIMIT 10
      `,
        // Inactive users (no session activity in 30 days)
        prisma.$queryRaw<
          { email: string; lastActive: Date; daysSinceActive: number }[]
        >`
        SELECT u.email,
          COALESCE(MAX(s."lastActivityAt"), u."createdAt") as "lastActive",
          EXTRACT(DAY FROM NOW() - COALESCE(MAX(s."lastActivityAt"), u."createdAt"))::int as "daysSinceActive"
        FROM users u
        LEFT JOIN sessions s ON s."userId" = u.id
        GROUP BY u.id, u.email, u."createdAt"
        HAVING COALESCE(MAX(s."lastActivityAt"), u."createdAt") < ${monthAgo}
        ORDER BY "daysSinceActive" DESC
        LIMIT 10
      `,
        prisma.user.groupBy({ by: ["subscriptionTier"], _count: { id: true } }),
        // Growth trend (last 30 days)
        prisma.$queryRaw<{ date: Date; count: bigint }[]>`
        SELECT DATE(u."createdAt") as date, COUNT(*)::bigint as count
        FROM users u
        WHERE u."createdAt" >= ${monthAgo}
        GROUP BY DATE(u."createdAt")
        ORDER BY date ASC
      `,
      ]);

      const prevMonthUsers = await prisma.user.count({
        where: { createdAt: { lt: monthAgo } },
      });
      const growthRate =
        prevMonthUsers > 0
          ? ((totalUsers - prevMonthUsers) / prevMonthUsers) * 100
          : 0;
      const retentionRate =
        totalUsers > 0 ? (activeMonth / totalUsers) * 100 : 0;

      ok(res, {
        totalUsers,
        newUsersToday: newToday,
        newUsersThisWeek: newWeek,
        newUsersThisMonth: newMonth,
        activeUsersToday: activeToday,
        activeUsersThisWeek: activeWeek,
        activeUsersThisMonth: activeMonth,
        userGrowthRate: Math.round(growthRate * 100) / 100,
        retentionRate: Math.round(retentionRate * 100) / 100,
        inactiveUsers: inactiveUsers.map((u) => ({
          email: u.email,
          lastActive: u.lastActive,
          daysSinceActive: u.daysSinceActive,
        })),
        mostActiveUsers: mostActive.map((u) => ({
          email: u.email,
          messageCount: Number(u.messageCount),
          conversationCount: Number(u.conversationCount),
          documentCount: Number(u.documentCount),
        })),
        usersBySubscriptionTier: tiers.map((t) => ({
          tier: t.subscriptionTier,
          count: t._count.id,
        })),
        userGrowthTrend: growthTrend.map((r) => ({
          date: r.date,
          count: Number(r.count),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── GET /conversations ──────────────────────────────────────────────────────

router.get(
  "/conversations",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const today = startOfDay();
      const weekAgo = startOfWeek();
      const monthAgo = startOfMonth();

      const [
        totalConversations,
        newToday,
        newWeek,
        totalMessages,
        messagesToday,
        messagesWeek,
        messagesMonth,
        userMsgCount,
        assistantMsgCount,
        msgTrend,
        peakHours,
        longestConvos,
      ] = await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({ where: { createdAt: { gte: today } } }),
        prisma.conversation.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.message.count(),
        prisma.message.count({ where: { createdAt: { gte: today } } }),
        prisma.message.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.message.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.message.count({ where: { role: "user" } }),
        prisma.message.count({ where: { role: "assistant" } }),
        prisma.$queryRaw<{ date: Date; count: bigint }[]>`
        SELECT DATE(m."createdAt") as date, COUNT(*)::bigint as count
        FROM messages m
        WHERE m."createdAt" >= ${weekAgo}
        GROUP BY DATE(m."createdAt")
        ORDER BY date ASC
      `,
        prisma.$queryRaw<{ hour: number; count: bigint }[]>`
        SELECT EXTRACT(HOUR FROM m."createdAt")::int as hour, COUNT(*)::bigint as count
        FROM messages m
        WHERE m."createdAt" >= ${weekAgo}
        GROUP BY hour
        ORDER BY count DESC
        LIMIT 24
      `,
        prisma.$queryRaw<
          {
            title: string | null;
            titleEncrypted: string | null;
            userEmail: string;
            messageCount: bigint;
          }[]
        >`
        SELECT c.title, c."titleEncrypted", u.email as "userEmail",
          (SELECT COUNT(*) FROM messages m WHERE m."conversationId" = c.id)::bigint as "messageCount"
        FROM conversations c
        JOIN users u ON u.id = c."userId"
        ORDER BY "messageCount" DESC
        LIMIT 10
      `,
      ]);

      const activeConvos = await prisma.conversation.count({
        where: { updatedAt: { gte: daysAgo(1) } },
      });
      const avgMsgsPerConvo =
        totalConversations > 0 ? totalMessages / totalConversations : 0;

      ok(res, {
        totalConversations,
        newConversationsToday: newToday,
        newConversationsThisWeek: newWeek,
        activeConversations: activeConvos,
        totalMessages,
        messagesToday,
        messagesThisWeek: messagesWeek,
        messagesThisMonth: messagesMonth,
        avgMessagesPerConversation: Math.round(avgMsgsPerConvo * 10) / 10,
        userMessagesCount: userMsgCount,
        assistantMessagesCount: assistantMsgCount,
        messagesTrend: msgTrend.map((r) => ({
          date: r.date,
          count: Number(r.count),
        })),
        peakUsageHours: peakHours.map((r) => ({
          hour: r.hour,
          messageCount: Number(r.count),
        })),
        longestConversations: longestConvos.map((c) => ({
          title:
            c.title ??
            (c.titleEncrypted ? "Encrypted Conversation" : "Untitled"),
          userEmail: c.userEmail,
          messageCount: Number(c.messageCount),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── GET /documents ──────────────────────────────────────────────────────────

router.get(
  "/documents",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const today = startOfDay();
      const weekAgo = startOfWeek();
      const monthAgo = startOfMonth();

      const [
        totalDocs,
        docsToday,
        docsWeek,
        docsMonth,
        storageAgg,
        avgSizeAgg,
        indexedChunkCount,
        avgChunks,
        uploadTrend,
        docsByType,
        docsByStatus,
        largestDocs,
        recentUploads,
      ] = await Promise.all([
        prisma.document.count(),
        prisma.document.count({ where: { createdAt: { gte: today } } }),
        prisma.document.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.document.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.user.aggregate({ _sum: { storageUsedBytes: true } }),
        prisma.document.aggregate({ _avg: { fileSize: true } }),
        prisma.documentChunk.count({ where: { isActive: true } as any }),
        prisma.document.aggregate({ _avg: { chunksCount: true } }),
        prisma.$queryRaw<{ date: Date; count: bigint }[]>`
        SELECT DATE(d."createdAt") as date, COUNT(*)::bigint as count
        FROM documents d
        WHERE d."createdAt" >= ${monthAgo}
        GROUP BY DATE(d."createdAt")
        ORDER BY date ASC
      `,
        prisma.$queryRaw<{ type: string; count: bigint }[]>`
        SELECT d."mimeType" as type, COUNT(*)::bigint as count
        FROM documents d
        GROUP BY d."mimeType"
        ORDER BY count DESC
      `,
        prisma.$queryRaw<{ status: string; count: bigint }[]>`
        SELECT d.status, COUNT(*)::bigint as count
        FROM documents d
        GROUP BY d.status
        ORDER BY count DESC
      `,
        prisma.$queryRaw<
          {
            id: string;
            userId: string;
            filename: string | null;
            filenameEncrypted: string | null;
            userEmail: string;
            sizeMB: number;
          }[]
        >`
        SELECT d.id, d."userId", d.filename, d."filenameEncrypted", u.email as "userEmail",
          ROUND((d."fileSize" / 1048576.0)::numeric, 2)::float as "sizeMB"
        FROM documents d
        JOIN users u ON u.id = d."userId"
        ORDER BY d."fileSize" DESC
        LIMIT 10
      `,
        prisma.document.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            userId: true,
            filename: true,
            filenameEncrypted: true,
            createdAt: true,
            user: { select: { email: true } },
          },
        }),
      ]);

      const storageGB =
        Number(storageAgg._sum.storageUsedBytes ?? BigInt(0)) /
        (1024 * 1024 * 1024);

      ok(res, {
        totalDocuments: totalDocs,
        documentsUploadedToday: docsToday,
        documentsUploadedThisWeek: docsWeek,
        documentsUploadedThisMonth: docsMonth,
        totalStorageGB: Math.round(storageGB * 100) / 100,
        avgDocumentSizeBytes: Math.round(avgSizeAgg._avg.fileSize ?? 0),
        embeddingStats: {
          totalEmbeddings: indexedChunkCount,
          avgChunksPerDocument:
            Math.round((avgChunks._avg.chunksCount ?? 0) * 10) / 10,
        },
        uploadTrend: uploadTrend.map((r) => ({
          date: r.date,
          count: Number(r.count),
        })),
        documentsByType: docsByType.map((r) => ({
          type: r.type,
          count: Number(r.count),
        })),
        documentsByStatus: docsByStatus.map((r) => ({
          status: r.status,
          count: Number(r.count),
        })),
        largestDocuments: largestDocs.map((d) => ({
          filename: encryptedDisplayName(d),
          userEmail: d.userEmail,
          sizeMB: d.sizeMB,
        })),
        recentUploads: recentUploads.map((d) => ({
          filename: encryptedDisplayName(d),
          userEmail: d.user.email,
          uploadedAt: d.createdAt,
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── GET /system-health ──────────────────────────────────────────────────────

router.get(
  "/system-health",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [
        dbSizeResult,
        dbConnsResult,
        errorCount24h,
        tableSizes,
        recentErrors,
      ] = await Promise.all([
        prisma.$queryRaw<
          { size: string }[]
        >`SELECT pg_size_pretty(pg_database_size(current_database())) as size`,
        prisma.$queryRaw<
          { count: bigint }[]
        >`SELECT COUNT(*)::bigint as count FROM pg_stat_activity WHERE datname = current_database()`,
        prisma.errorLog.count({ where: { createdAt: { gte: daysAgo(1) } } }),
        prisma.$queryRaw<{ table: string; size: string; rowCount: bigint }[]>`
        SELECT
          t.tablename as "table",
          pg_size_pretty(pg_total_relation_size(quote_ident(t.tablename)::regclass)) as size,
          (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = t.tablename)::bigint as "rowCount"
        FROM pg_tables t
        WHERE t.schemaname = 'public'
        ORDER BY pg_total_relation_size(quote_ident(t.tablename)::regclass) DESC
        LIMIT 20
      `,
        prisma.$queryRaw<
          { message: string; count: bigint; lastOccurred: Date }[]
        >`
        SELECT e."errorMessage" as message, COUNT(*)::bigint as count, MAX(e."createdAt") as "lastOccurred"
        FROM error_logs e
        WHERE e."createdAt" >= ${daysAgo(7)}
        GROUP BY e."errorMessage"
        ORDER BY count DESC
        LIMIT 10
      `,
      ]);

      const memUsage = process.memoryUsage();
      const memPercent = Math.round(
        (memUsage.heapUsed / memUsage.heapTotal) * 100,
      );
      const totalMsgs24h = await prisma.message.count({
        where: { createdAt: { gte: daysAgo(1) } },
      });
      const errorRate =
        totalMsgs24h > 0 ? (errorCount24h / totalMsgs24h) * 100 : 0;

      // Avg response time from API perf logs
      const avgRespTime = await prisma.aPIPerformanceLog.aggregate({
        where: { startedAt: { gte: daysAgo(1) } },
        _avg: { latency: true },
      });

      ok(res, {
        databaseSize: dbSizeResult[0]?.size ?? "N/A",
        databaseConnections: Number(dbConnsResult[0]?.count ?? 0),
        memoryUsage: {
          percentage: memPercent,
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
        },
        uptime: process.uptime(),
        errorRate: Math.round(errorRate * 100) / 100,
        errorCount24h,
        avgResponseTime: Math.round(avgRespTime._avg.latency ?? 0),
        tableSizes: tableSizes.map((t) => ({
          table: t.table,
          size: t.size,
          rowCount: Number(t.rowCount),
        })),
        recentErrors: recentErrors.map((e) => ({
          message: e.message?.substring(0, 200),
          count: Number(e.count),
          lastOccurred: e.lastOccurred,
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── GET /costs ──────────────────────────────────────────────────────────────

router.get(
  "/costs",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const today = startOfDay();
      const monthStart = startOfMonth();

      const [
        costMTD,
        costToday,
        tokensMTD,
        inputTokensMTD,
        outputTokensMTD,
        dailyCosts,
        costsByModel,
        costsByFeature,
        topUsersByCost,
      ] = await Promise.all([
        prisma.tokenUsage.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { totalCost: true },
        }),
        prisma.tokenUsage.aggregate({
          where: { createdAt: { gte: today } },
          _sum: { totalCost: true },
        }),
        prisma.tokenUsage.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { totalTokens: true },
        }),
        prisma.tokenUsage.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { inputTokens: true },
        }),
        prisma.tokenUsage.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { outputTokens: true },
        }),
        prisma.$queryRaw<
          { date: Date; totalCost: number; totalTokens: bigint }[]
        >`
        SELECT DATE(t."createdAt") as date,
          COALESCE(SUM(t."totalCost"), 0)::float as "totalCost",
          COALESCE(SUM(t."totalTokens"), 0)::bigint as "totalTokens"
        FROM token_usage t
        WHERE t."createdAt" >= ${monthStart}
        GROUP BY DATE(t."createdAt")
        ORDER BY date ASC
      `,
        prisma.$queryRaw<{ model: string; cost: number; tokens: bigint }[]>`
        SELECT t.model,
          COALESCE(SUM(t."totalCost"), 0)::float as cost,
          COALESCE(SUM(t."totalTokens"), 0)::bigint as tokens
        FROM token_usage t
        WHERE t."createdAt" >= ${monthStart}
        GROUP BY t.model
        ORDER BY cost DESC
      `,
        prisma.$queryRaw<
          { feature: string; cost: number; percentage: number }[]
        >`
        SELECT t."requestType" as feature,
          COALESCE(SUM(t."totalCost"), 0)::float as cost,
          CASE WHEN SUM(SUM(t."totalCost")) OVER () > 0
            THEN (SUM(t."totalCost") / SUM(SUM(t."totalCost")) OVER () * 100)::float
            ELSE 0
          END as percentage
        FROM token_usage t
        WHERE t."createdAt" >= ${monthStart}
        GROUP BY t."requestType"
        ORDER BY cost DESC
      `,
        prisma.$queryRaw<{ email: string; tokens: bigint; cost: number }[]>`
        SELECT u.email,
          COALESCE(SUM(t."totalTokens"), 0)::bigint as tokens,
          COALESCE(SUM(t."totalCost"), 0)::float as cost
        FROM token_usage t
        JOIN users u ON u.id = t."userId"
        WHERE t."createdAt" >= ${monthStart}
        GROUP BY u.email
        ORDER BY cost DESC
        LIMIT 10
      `,
      ]);

      const totalCostVal = costMTD._sum.totalCost ?? 0;
      const costTodayVal = costToday._sum.totalCost ?? 0;
      const daysElapsed = Math.max(
        1,
        Math.ceil((Date.now() - monthStart.getTime()) / 86400000),
      );
      const avgDaily = totalCostVal / daysElapsed;
      const projectedMonthly = avgDaily * 30;

      // Month-over-month change
      const prevMonthStart = new Date(monthStart);
      prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
      const prevMonthCost = await prisma.tokenUsage.aggregate({
        where: { createdAt: { gte: prevMonthStart, lt: monthStart } },
        _sum: { totalCost: true },
      });
      const prevCostVal = prevMonthCost._sum.totalCost ?? 0;
      const momChange =
        prevCostVal > 0
          ? ((totalCostVal - prevCostVal) / prevCostVal) * 100
          : 0;

      const totalMsgsMonth = await prisma.message.count({
        where: { createdAt: { gte: monthStart } },
      });
      const avgCostPerMsg =
        totalMsgsMonth > 0 ? totalCostVal / totalMsgsMonth : 0;

      ok(res, {
        totalCostMTD: Math.round(totalCostVal * 10000) / 10000,
        costToday: Math.round(costTodayVal * 10000) / 10000,
        avgDailyCost: Math.round(avgDaily * 10000) / 10000,
        projectedMonthlyCost: Math.round(projectedMonthly * 10000) / 10000,
        totalTokensMTD: tokensMTD._sum.totalTokens ?? 0,
        inputTokensMTD: inputTokensMTD._sum.inputTokens ?? 0,
        outputTokensMTD: outputTokensMTD._sum.outputTokens ?? 0,
        avgCostPerMessage: Math.round(avgCostPerMsg * 10000) / 10000,
        monthOverMonthChange: Math.round(momChange * 100) / 100,
        dailyCosts: dailyCosts.map((d) => ({
          date: d.date,
          totalCost: d.totalCost,
          totalTokens: Number(d.totalTokens),
        })),
        costsByModel: costsByModel.map((m) => ({
          model: m.model,
          cost: m.cost,
          tokens: Number(m.tokens),
        })),
        costsByFeature: costsByFeature.map((f) => ({
          feature: f.feature,
          cost: f.cost,
          percentage: Math.round(f.percentage * 100) / 100,
        })),
        topUsersByCost: topUsersByCost.map((u) => ({
          email: u.email,
          tokens: Number(u.tokens),
          cost: u.cost,
        })),
        costAlerts: [],
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── GET /feature-usage ──────────────────────────────────────────────────────

router.get(
  "/feature-usage",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const monthAgo = startOfMonth();

      const [featureStats, featureTrend] = await Promise.all([
        prisma.$queryRaw<
          {
            feature: string;
            count: bigint;
            uniqueUsers: bigint;
            successRate: number;
          }[]
        >`
        SELECT f."featureName" as feature,
          COUNT(*)::bigint as count,
          COUNT(DISTINCT f."userId")::bigint as "uniqueUsers",
          (SUM(CASE WHEN f.success THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100)::float as "successRate"
        FROM feature_usage_logs f
        WHERE f."usedAt" >= ${monthAgo}
        GROUP BY f."featureName"
        ORDER BY count DESC
      `,
        prisma.$queryRaw<{ date: Date; feature: string; count: bigint }[]>`
        SELECT DATE(f."usedAt") as date, f."featureName" as feature, COUNT(*)::bigint as count
        FROM feature_usage_logs f
        WHERE f."usedAt" >= ${monthAgo}
        GROUP BY DATE(f."usedAt"), f."featureName"
        ORDER BY date ASC
      `,
      ]);

      ok(res, {
        features: featureStats.map((f) => ({
          name: f.feature,
          usageCount: Number(f.count),
          uniqueUsers: Number(f.uniqueUsers),
          successRate: Math.round(f.successRate * 100) / 100,
        })),
        trend: featureTrend.map((t) => ({
          date: t.date,
          feature: t.feature,
          count: Number(t.count),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

// ── POST /refresh ───────────────────────────────────────────────────────────

router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  // No server-side cache to clear — data is always live from DB
  ok(res, { refreshed: true });
});

// ── GET /export ─────────────────────────────────────────────────────────────

router.get(
  "/export",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { type, format: fmt } = req.query;
      const range = startOfMonth();

      let rows: unknown[] = [];

      switch (type) {
        case "users":
          rows = await prisma.user.findMany({
            select: {
              email: true,
              createdAt: true,
              subscriptionTier: true,
              storageUsedBytes: true,
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          });
          break;
        case "conversations": {
          const rawConvos = await prisma.conversation.findMany({
            select: {
              id: true,
              title: true,
              titleEncrypted: true,
              createdAt: true,
              userId: true,
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          });
          // titleEncrypted means the plaintext title was cleared; show placeholder
          rows = rawConvos.map((c) => ({
            id: c.id,
            title:
              c.title ??
              (c.titleEncrypted ? "Encrypted Conversation" : "Untitled"),
            createdAt: c.createdAt,
          }));
          break;
        }
        case "documents": {
          const rawDocs = await prisma.document.findMany({
            select: {
              id: true,
              filename: true,
              filenameEncrypted: true,
              mimeType: true,
              fileSize: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          });
          rows = rawDocs.map((d) => ({
            id: d.id,
            filename: encryptedDisplayName(d),
            mimeType: d.mimeType,
            fileSize: d.fileSize,
            status: d.status,
            createdAt: d.createdAt,
          }));
          break;
        }
        case "costs":
          rows = await prisma.tokenUsage.findMany({
            where: { createdAt: { gte: range } },
            select: {
              model: true,
              provider: true,
              totalTokens: true,
              totalCost: true,
              requestType: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          });
          break;
        default:
          fail(res, 400, `Unknown export type: ${type}`);
          return;
      }

      if (fmt === "csv" && Array.isArray(rows) && rows.length > 0) {
        const headers = Object.keys(rows[0] as Record<string, unknown>);
        const csv = [
          headers.join(","),
          ...rows.map((r) =>
            headers
              .map((h) => JSON.stringify(String((r as any)[h] ?? "")))
              .join(","),
          ),
        ].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${type}-export.csv`,
        );
        res.send(csv);
        return;
      }

      ok(res, rows);
    } catch (e) {
      next(e);
    }
  },
);

// ── Error boundary ──────────────────────────────────────────────────────────

router.use(
  (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    next(err);
  },
);

export default router;
