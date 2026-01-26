/**
 * Analytics Service
 *
 * PURPOSE: Collect and aggregate analytics data for admin dashboard
 * TRACKS: Users, conversations, documents, system health, costs, feature usage
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface UserAnalytics {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
  userGrowthRate: number;
  retentionRate: number;
  mostActiveUsers: Array<{
    userId: string;
    email: string;
    messageCount: number;
    conversationCount: number;
    documentCount: number;
  }>;
  inactiveUsers: Array<{
    userId: string;
    email: string;
    lastActive: Date | null;
    daysSinceActive: number;
  }>;
  usersBySubscriptionTier: Array<{ tier: string; count: number }>;
  userGrowthTrend: Array<{ date: string; count: number }>;
}

export interface ConversationAnalytics {
  totalConversations: number;
  newConversationsToday: number;
  newConversationsThisWeek: number;
  newConversationsThisMonth: number;
  activeConversations: number;
  totalMessages: number;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  avgMessagesPerConversation: number;
  userMessagesCount: number;
  assistantMessagesCount: number;
  longestConversations: Array<{
    conversationId: string;
    title: string;
    messageCount: number;
    userId: string;
    userEmail: string;
  }>;
  peakUsageHours: Array<{ hour: number; messageCount: number }>;
  messagesTrend: Array<{ date: string; count: number }>;
}

export interface DocumentAnalytics {
  totalDocuments: number;
  documentsUploadedToday: number;
  documentsUploadedThisWeek: number;
  documentsUploadedThisMonth: number;
  totalStorageBytes: number;
  totalStorageGB: number;
  avgDocumentSizeBytes: number;
  documentsByType: Array<{ type: string; count: number }>;
  documentsByStatus: Array<{ status: string; count: number }>;
  largestDocuments: Array<{
    documentId: string;
    filename: string;
    sizeBytes: number;
    sizeMB: number;
    userId: string;
    userEmail: string;
  }>;
  recentUploads: Array<{
    documentId: string;
    filename: string;
    uploadedAt: Date;
    userId: string;
    userEmail: string;
  }>;
  uploadTrend: Array<{ date: string; count: number }>;
  embeddingStats: {
    totalEmbeddings: number;
    avgChunksPerDocument: number;
  };
}

export interface SystemHealthMetrics {
  databaseConnections: number;
  databaseSize: string;
  tableSizes: Array<{ table: string; size: string; rowCount: number }>;
  errorCount24h: number;
  errorRate: number;
  avgResponseTime: number;
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  recentErrors: Array<{
    message: string;
    count: number;
    lastOccurred: Date;
  }>;
}

export interface CostAnalytics {
  geminiApiCalls: number;
  geminiEstimatedCost: number;
  pineconeVectorCount: number;
  pineconeEstimatedCost: number;
  s3StorageGB: number;
  s3EstimatedCost: number;
  totalEstimatedCost: number;
  costPerUser: number;
  costPerMessage: number;
  costTrend: Array<{ date: string; cost: number }>;
  costByService: Array<{ service: string; cost: number; percentage: number }>;
}

export interface FeatureUsageAnalytics {
  ragQueriesTotal: number;
  ragQueriesThisMonth: number;
  memoryUsageCount: number;
  fileActionsCount: number;
  presentationsCreated: number;
  documentsGenerated: number;
}

export interface AnalyticsOverview {
  users: UserAnalytics;
  conversations: ConversationAnalytics;
  documents: DocumentAnalytics;
  systemHealth: SystemHealthMetrics;
  costs: CostAnalytics;
  featureUsage: FeatureUsageAnalytics;
  generatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getDateRanges() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return { now, todayStart, weekStart, monthStart, lastMonthStart, thirtyDaysAgo };
}

// ═══════════════════════════════════════════════════════════════════════════
// USER ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getUserAnalytics(): Promise<UserAnalytics> {
  console.log('📊 [ANALYTICS] Collecting user analytics...');

  const { now, todayStart, weekStart, monthStart, lastMonthStart, thirtyDaysAgo } = getDateRanges();

  // Total users
  const totalUsers = await prisma.user.count();

  // New users by time period
  const [newUsersToday, newUsersThisWeek, newUsersThisMonth, newUsersLastMonth] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({
      where: {
        createdAt: { gte: lastMonthStart, lt: monthStart }
      }
    })
  ]);

  // User growth rate
  const userGrowthRate = newUsersLastMonth > 0
    ? ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100
    : newUsersThisMonth > 0 ? 100 : 0;

  // Active users (users who sent messages)
  const [activeUsersToday, activeUsersThisWeek, activeUsersThisMonth] = await Promise.all([
    prisma.message.groupBy({
      by: ['conversationId'],
      where: { createdAt: { gte: todayStart }, role: 'user' }
    }).then(async (groups) => {
      const convIds = groups.map(g => g.conversationId);
      const convs = await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { userId: true }
      });
      return new Set(convs.map(c => c.userId)).size;
    }),
    prisma.message.groupBy({
      by: ['conversationId'],
      where: { createdAt: { gte: weekStart }, role: 'user' }
    }).then(async (groups) => {
      const convIds = groups.map(g => g.conversationId);
      const convs = await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { userId: true }
      });
      return new Set(convs.map(c => c.userId)).size;
    }),
    prisma.message.groupBy({
      by: ['conversationId'],
      where: { createdAt: { gte: monthStart }, role: 'user' }
    }).then(async (groups) => {
      const convIds = groups.map(g => g.conversationId);
      const convs = await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { userId: true }
      });
      return new Set(convs.map(c => c.userId)).size;
    })
  ]);

  // Retention rate (users active this month who were also active last month)
  const usersActiveLastMonth = await prisma.message.groupBy({
    by: ['conversationId'],
    where: {
      createdAt: { gte: lastMonthStart, lt: monthStart },
      role: 'user'
    }
  }).then(async (groups) => {
    const convIds = groups.map(g => g.conversationId);
    const convs = await prisma.conversation.findMany({
      where: { id: { in: convIds } },
      select: { userId: true }
    });
    return new Set(convs.map(c => c.userId));
  });

  const usersActiveThisMonthSet = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { createdAt: { gte: monthStart }, role: 'user' }
  }).then(async (groups) => {
    const convIds = groups.map(g => g.conversationId);
    const convs = await prisma.conversation.findMany({
      where: { id: { in: convIds } },
      select: { userId: true }
    });
    return new Set(convs.map(c => c.userId));
  });

  const retainedUsers = [...usersActiveLastMonth].filter(id => usersActiveThisMonthSet.has(id)).length;
  const retentionRate = usersActiveLastMonth.size > 0
    ? (retainedUsers / usersActiveLastMonth.size) * 100
    : 0;

  // Most active users - based on conversations and documents
  const mostActiveUsersData = await prisma.user.findMany({
    take: 10,
    select: {
      id: true,
      email: true,
      _count: {
        select: {
          conversations: true,
          documents: true
        }
      }
    },
    orderBy: {
      conversations: { _count: 'desc' }
    }
  });

  const mostActiveUsers = mostActiveUsersData.map(user => ({
    userId: user.id,
    email: user.email,
    messageCount: 0, // Messages counted via conversations
    conversationCount: user._count.conversations,
    documentCount: user._count.documents
  }));

  // Inactive users (no activity in 30 days)
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
      conversations: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { updatedAt: true }
      }
    }
  });

  const inactiveUsers = allUsers
    .filter(user => {
      const lastActivity = (user as any).conversations[0]?.updatedAt;
      if (!lastActivity) return true;
      return lastActivity < thirtyDaysAgo;
    })
    .slice(0, 20)
    .map(user => {
      const lastActive = (user as any).conversations[0]?.updatedAt || null;
      const daysSinceActive = lastActive
        ? Math.floor((now.getTime() - lastActive.getTime()) / (24 * 60 * 60 * 1000))
        : Math.floor((now.getTime() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000));

      return {
        userId: user.id,
        email: user.email,
        lastActive,
        daysSinceActive
      };
    });

  // Users by subscription tier
  const usersByTier = await prisma.user.groupBy({
    by: ['subscriptionTier'],
    _count: true
  });

  const usersBySubscriptionTier = usersByTier.map(item => ({
    tier: item.subscriptionTier,
    count: item._count
  }));

  // User growth trend (last 30 days)
  const userGrowthTrend: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const count = await prisma.user.count({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd }
      }
    });

    userGrowthTrend.push({ date: dateStr, count });
  }

  console.log('📊 [ANALYTICS] User analytics collected');

  return {
    totalUsers,
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    activeUsersToday,
    activeUsersThisWeek,
    activeUsersThisMonth,
    userGrowthRate,
    retentionRate,
    mostActiveUsers,
    inactiveUsers,
    usersBySubscriptionTier,
    userGrowthTrend
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getConversationAnalytics(): Promise<ConversationAnalytics> {
  console.log('📊 [ANALYTICS] Collecting conversation analytics...');

  const { now, todayStart, weekStart, monthStart } = getDateRanges();

  // Total conversations
  const totalConversations = await prisma.conversation.count();

  // New conversations by time period
  const [newConversationsToday, newConversationsThisWeek, newConversationsThisMonth] = await Promise.all([
    prisma.conversation.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.conversation.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.conversation.count({ where: { createdAt: { gte: monthStart } } })
  ]);

  // Active conversations (with messages in last 7 days)
  const activeConversations = await prisma.conversation.count({
    where: {
      messages: {
        some: { createdAt: { gte: weekStart } }
      }
    }
  });

  // Total messages
  const totalMessages = await prisma.message.count();

  // Messages by time period
  const [messagesToday, messagesThisWeek, messagesThisMonth] = await Promise.all([
    prisma.message.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.message.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.message.count({ where: { createdAt: { gte: monthStart } } })
  ]);

  // Average messages per conversation
  const avgMessagesPerConversation = totalConversations > 0
    ? Math.round((totalMessages / totalConversations) * 10) / 10
    : 0;

  // User vs assistant messages
  const [userMessagesCount, assistantMessagesCount] = await Promise.all([
    prisma.message.count({ where: { role: 'user' } }),
    prisma.message.count({ where: { role: 'assistant' } })
  ]);

  // Longest conversations
  const longestConversationsData = await prisma.conversation.findMany({
    take: 10,
    select: {
      id: true,
      title: true,
      userId: true,
      user: { select: { email: true } },
      _count: { select: { messages: true } }
    },
    orderBy: {
      messages: { _count: 'desc' }
    }
  });

  const longestConversations = longestConversationsData.map(conv => ({
    conversationId: conv.id,
    title: conv.title,
    messageCount: conv._count.messages,
    userId: conv.userId,
    userEmail: conv.user.email
  }));

  // Peak usage hours (last 7 days)
  let peakUsageHours: Array<{ hour: number; messageCount: number }> = [];
  try {
    const messagesWithHours = await prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT
        EXTRACT(HOUR FROM "createdAt") as hour,
        COUNT(*) as count
      FROM "messages"
      WHERE "createdAt" >= ${weekStart}
      GROUP BY hour
      ORDER BY hour
    `;

    peakUsageHours = messagesWithHours.map(row => ({
      hour: Number(row.hour),
      messageCount: Number(row.count)
    }));
  } catch (error) {
    console.warn('📊 [ANALYTICS] Could not get peak usage hours:', error);
    // Fill with zeros if query fails
    peakUsageHours = Array.from({ length: 24 }, (_, i) => ({ hour: i, messageCount: 0 }));
  }

  // Messages trend (last 30 days)
  const messagesTrend: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const count = await prisma.message.count({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd }
      }
    });

    messagesTrend.push({ date: dateStr, count });
  }

  console.log('📊 [ANALYTICS] Conversation analytics collected');

  return {
    totalConversations,
    newConversationsToday,
    newConversationsThisWeek,
    newConversationsThisMonth,
    activeConversations,
    totalMessages,
    messagesToday,
    messagesThisWeek,
    messagesThisMonth,
    avgMessagesPerConversation,
    userMessagesCount,
    assistantMessagesCount,
    longestConversations,
    peakUsageHours,
    messagesTrend
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getDocumentAnalytics(): Promise<DocumentAnalytics> {
  console.log('📊 [ANALYTICS] Collecting document analytics...');

  const { now, todayStart, weekStart, monthStart } = getDateRanges();

  // Total documents
  const totalDocuments = await prisma.document.count();

  // Documents uploaded by time period
  const [documentsUploadedToday, documentsUploadedThisWeek, documentsUploadedThisMonth] = await Promise.all([
    prisma.document.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.document.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.document.count({ where: { createdAt: { gte: monthStart } } })
  ]);

  // Storage statistics
  const storageStats = await prisma.document.aggregate({
    _sum: { fileSize: true },
    _avg: { fileSize: true }
  });

  const totalStorageBytes = Number(storageStats._sum.fileSize) || 0;
  const totalStorageGB = totalStorageBytes / (1024 * 1024 * 1024);
  const avgDocumentSizeBytes = Number(storageStats._avg.fileSize) || 0;

  // Documents by type
  const documentsByTypeData = await prisma.document.groupBy({
    by: ['mimeType'],
    _count: true,
    orderBy: { _count: { mimeType: 'desc' } }
  });

  const documentsByType = documentsByTypeData.map(item => ({
    type: item.mimeType,
    count: item._count
  }));

  // Documents by status
  const documentsByStatusData = await prisma.document.groupBy({
    by: ['status'],
    _count: true
  });

  const documentsByStatus = documentsByStatusData.map(item => ({
    status: item.status,
    count: item._count
  }));

  // Largest documents
  const largestDocumentsData = await prisma.document.findMany({
    take: 10,
    orderBy: { fileSize: 'desc' },
    select: {
      id: true,
      filename: true,
      fileSize: true,
      userId: true,
      user: { select: { email: true } }
    }
  });

  const largestDocuments = largestDocumentsData.map(doc => ({
    documentId: doc.id,
    filename: doc.filename,
    sizeBytes: doc.fileSize,
    sizeMB: Math.round((doc.fileSize / (1024 * 1024)) * 100) / 100,
    userId: doc.userId,
    userEmail: doc.user.email
  }));

  // Recent uploads
  const recentUploadsData = await prisma.document.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      filename: true,
      createdAt: true,
      userId: true,
      user: { select: { email: true } }
    }
  });

  const recentUploads = recentUploadsData.map(doc => ({
    documentId: doc.id,
    filename: doc.filename,
    uploadedAt: doc.createdAt,
    userId: doc.userId,
    userEmail: doc.user.email
  }));

  // Upload trend (last 30 days)
  const uploadTrend: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const count = await prisma.document.count({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd }
      }
    });

    uploadTrend.push({ date: dateStr, count });
  }

  // Embedding stats
  const totalEmbeddings = await prisma.documentEmbedding.count();
  const avgChunksPerDocument = totalDocuments > 0
    ? Math.round((totalEmbeddings / totalDocuments) * 10) / 10
    : 0;

  console.log('📊 [ANALYTICS] Document analytics collected');

  return {
    totalDocuments,
    documentsUploadedToday,
    documentsUploadedThisWeek,
    documentsUploadedThisMonth,
    totalStorageBytes,
    totalStorageGB: Math.round(totalStorageGB * 100) / 100,
    avgDocumentSizeBytes: Math.round(avgDocumentSizeBytes),
    documentsByType,
    documentsByStatus,
    largestDocuments,
    recentUploads,
    uploadTrend,
    embeddingStats: {
      totalEmbeddings,
      avgChunksPerDocument
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH METRICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
  console.log('📊 [ANALYTICS] Collecting system health metrics...');

  // Database connections (PostgreSQL specific)
  let databaseConnections = 0;
  try {
    const connectionsResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    databaseConnections = Number(connectionsResult[0]?.count) || 0;
  } catch (error) {
    console.warn('📊 [ANALYTICS] Could not get database connections:', error);
  }

  // Database size
  let databaseSize = 'Unknown';
  try {
    const sizeResult = await prisma.$queryRaw<Array<{ size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `;
    databaseSize = sizeResult[0]?.size || 'Unknown';
  } catch (error) {
    console.warn('📊 [ANALYTICS] Could not get database size:', error);
  }

  // Table sizes
  let tableSizes: Array<{ table: string; size: string; rowCount: number }> = [];
  try {
    const tableSizesResult = await prisma.$queryRaw<Array<{ table_name: string; size: string; row_count: bigint }>>`
      SELECT
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 15
    `;
    tableSizes = tableSizesResult.map(row => ({
      table: row.table_name,
      size: row.size,
      rowCount: Number(row.row_count)
    }));
  } catch (error) {
    console.warn('📊 [ANALYTICS] Could not get table sizes:', error);
  }

  // Error tracking (from audit logs)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const errorCount24h = await prisma.auditLog.count({
    where: {
      status: 'failure',
      createdAt: { gte: twentyFourHoursAgo }
    }
  });

  const totalRequests24h = await prisma.auditLog.count({
    where: { createdAt: { gte: twentyFourHoursAgo } }
  });

  const errorRate = totalRequests24h > 0
    ? Math.round((errorCount24h / totalRequests24h) * 10000) / 100
    : 0;

  // Recent errors grouped by action
  const recentErrorsData = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      status: 'failure',
      createdAt: { gte: twentyFourHoursAgo }
    },
    _count: true,
    _max: { createdAt: true }
  });

  const recentErrors = recentErrorsData.map(err => ({
    message: err.action,
    count: err._count,
    lastOccurred: err._max.createdAt || new Date()
  }));

  // Memory usage (Node.js process)
  const memoryUsage = process.memoryUsage();
  const totalMemory = require('os').totalmem();

  // Uptime
  const uptime = process.uptime();

  console.log('📊 [ANALYTICS] System health metrics collected');

  return {
    databaseConnections,
    databaseSize,
    tableSizes,
    errorCount24h,
    errorRate,
    avgResponseTime: 0, // Would need request timing middleware
    uptime: Math.round(uptime),
    memoryUsage: {
      used: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
      total: Math.round(totalMemory / (1024 * 1024)),
      percentage: Math.round((memoryUsage.heapUsed / totalMemory) * 10000) / 100
    },
    recentErrors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COST ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getCostAnalytics(): Promise<CostAnalytics> {
  console.log('📊 [ANALYTICS] Collecting cost analytics...');

  const { now, monthStart } = getDateRanges();

  // Get API usage from APIUsage table
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const apiUsageData = await prisma.aPIUsage.findMany({
    where: { month: currentMonth }
  });

  // Aggregate API usage
  let geminiApiCalls = 0;
  let totalCostFromUsage = 0;

  for (const usage of apiUsageData) {
    geminiApiCalls += usage.chatRequests + usage.embeddingRequests;
    totalCostFromUsage += usage.costUSD;
  }

  // Estimate costs based on usage (if no APIUsage records)
  const messagesThisMonth = await prisma.message.count({
    where: { createdAt: { gte: monthStart } }
  });

  // Rough estimates (adjust based on actual pricing)
  // Gemini Pro: ~$0.00025 per 1K input tokens, ~$0.0005 per 1K output tokens
  // Assuming avg 500 tokens per message
  const geminiEstimatedCost = totalCostFromUsage > 0
    ? totalCostFromUsage
    : (messagesThisMonth * 500 * 0.0005) / 1000;

  // Pinecone vector count (from documents)
  const totalEmbeddings = await prisma.documentEmbedding.count();
  const pineconeVectorCount = totalEmbeddings;
  // Pinecone Starter: Free up to 100K vectors, then ~$0.0001 per vector/month
  const pineconeEstimatedCost = pineconeVectorCount > 100000
    ? (pineconeVectorCount - 100000) * 0.0001
    : 0;

  // S3 storage
  const storageStats = await prisma.document.aggregate({
    _sum: { fileSize: true }
  });
  const s3StorageGB = (Number(storageStats._sum.fileSize) || 0) / (1024 * 1024 * 1024);
  // S3: ~$0.023 per GB/month
  const s3EstimatedCost = s3StorageGB * 0.023;

  // Total cost
  const totalEstimatedCost = geminiEstimatedCost + pineconeEstimatedCost + s3EstimatedCost;

  // Cost per user/message
  const totalUsers = await prisma.user.count();
  const costPerUser = totalUsers > 0 ? totalEstimatedCost / totalUsers : 0;
  const costPerMessage = messagesThisMonth > 0 ? totalEstimatedCost / messagesThisMonth : 0;

  // Cost trend (last 30 days - estimated)
  const costTrend: Array<{ date: string; cost: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const dayMessages = await prisma.message.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } }
    });

    // Estimate daily cost
    const dayCost = (dayMessages * 500 * 0.0005) / 1000;
    costTrend.push({ date: dateStr, cost: Math.round(dayCost * 1000) / 1000 });
  }

  // Cost by service
  const totalCost = geminiEstimatedCost + pineconeEstimatedCost + s3EstimatedCost;
  const costByService = [
    {
      service: 'Gemini API',
      cost: Math.round(geminiEstimatedCost * 100) / 100,
      percentage: totalCost > 0 ? Math.round((geminiEstimatedCost / totalCost) * 100) : 0
    },
    {
      service: 'Pinecone',
      cost: Math.round(pineconeEstimatedCost * 100) / 100,
      percentage: totalCost > 0 ? Math.round((pineconeEstimatedCost / totalCost) * 100) : 0
    },
    {
      service: 'S3 Storage',
      cost: Math.round(s3EstimatedCost * 100) / 100,
      percentage: totalCost > 0 ? Math.round((s3EstimatedCost / totalCost) * 100) : 0
    }
  ];

  console.log('📊 [ANALYTICS] Cost analytics collected');

  return {
    geminiApiCalls,
    geminiEstimatedCost: Math.round(geminiEstimatedCost * 100) / 100,
    pineconeVectorCount,
    pineconeEstimatedCost: Math.round(pineconeEstimatedCost * 100) / 100,
    s3StorageGB: Math.round(s3StorageGB * 100) / 100,
    s3EstimatedCost: Math.round(s3EstimatedCost * 100) / 100,
    totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
    costPerUser: Math.round(costPerUser * 10000) / 10000,
    costPerMessage: Math.round(costPerMessage * 100000) / 100000,
    costTrend,
    costByService
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE USAGE ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getFeatureUsageAnalytics(): Promise<FeatureUsageAnalytics> {
  console.log('📊 [ANALYTICS] Collecting feature usage analytics...');

  const { monthStart } = getDateRanges();

  // RAG queries (from chat contexts)
  const ragQueriesTotal = await prisma.chatContext.count();
  const ragQueriesThisMonth = await prisma.chatContext.count({
    where: { createdAt: { gte: monthStart } }
  });

  // Memory usage
  const memoryUsageCount = await prisma.memory.count();

  // File actions
  const fileActionsCount = await prisma.actionHistory.count();

  // Presentations created
  const presentationsCreated = await prisma.presentation.count();

  // Documents generated
  const documentsGenerated = await prisma.generatedDocument.count();

  console.log('📊 [ANALYTICS] Feature usage analytics collected');

  return {
    ragQueriesTotal,
    ragQueriesThisMonth,
    memoryUsageCount,
    fileActionsCount,
    presentationsCreated,
    documentsGenerated
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW (ALL METRICS)
// ═══════════════════════════════════════════════════════════════════════════

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  console.log('📊 [ANALYTICS] Collecting complete analytics overview...');

  const [users, conversations, documents, systemHealth, costs, featureUsage] = await Promise.all([
    getUserAnalytics(),
    getConversationAnalytics(),
    getDocumentAnalytics(),
    getSystemHealthMetrics(),
    getCostAnalytics(),
    getFeatureUsageAnalytics()
  ]);

  console.log('📊 [ANALYTICS] Complete analytics overview collected');

  return {
    users,
    conversations,
    documents,
    systemHealth,
    costs,
    featureUsage,
    generatedAt: new Date()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK STATS (LIGHTWEIGHT VERSION FOR DASHBOARD HEADER)
// ═══════════════════════════════════════════════════════════════════════════

export interface QuickStats {
  totalUsers: number;
  activeUsersToday: number;
  totalConversations: number;
  messagesToday: number;
  totalDocuments: number;
  storageUsedGB: number;
  errorRate: number;
  estimatedCostThisMonth: number;
}

export async function getQuickStats(): Promise<QuickStats> {
  console.log('📊 [ANALYTICS] Collecting quick stats...');

  const { todayStart, monthStart } = getDateRanges();

  const [
    totalUsers,
    totalConversations,
    messagesToday,
    totalDocuments,
    storageStats,
    errorCount24h,
    totalRequests24h
  ] = await Promise.all([
    prisma.user.count(),
    prisma.conversation.count(),
    prisma.message.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.document.count(),
    prisma.document.aggregate({ _sum: { fileSize: true } }),
    prisma.auditLog.count({
      where: {
        status: 'failure',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    }),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    })
  ]);

  // Active users today
  const activeUserConversations = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { createdAt: { gte: todayStart }, role: 'user' }
  });
  const convIds = activeUserConversations.map(g => g.conversationId);
  const convs = await prisma.conversation.findMany({
    where: { id: { in: convIds } },
    select: { userId: true }
  });
  const activeUsersToday = new Set(convs.map(c => c.userId)).size;

  // Estimated cost
  const messagesThisMonth = await prisma.message.count({
    where: { createdAt: { gte: monthStart } }
  });
  const estimatedCostThisMonth = (messagesThisMonth * 500 * 0.0005) / 1000;

  console.log('📊 [ANALYTICS] Quick stats collected');

  return {
    totalUsers,
    activeUsersToday,
    totalConversations,
    messagesToday,
    totalDocuments,
    storageUsedGB: Math.round((Number(storageStats._sum.fileSize) || 0) / (1024 * 1024 * 1024) * 100) / 100,
    errorRate: totalRequests24h > 0 ? Math.round((errorCount24h / totalRequests24h) * 10000) / 100 : 0,
    estimatedCostThisMonth: Math.round(estimatedCostThisMonth * 100) / 100
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS TRACKING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Feature flag to enable/disable analytics tracking stubs.
 * When false (production), stub methods will throw errors.
 * When true (default), stubs return mock data with warnings.
 *
 * Set ANALYTICS_TRACKING_ENABLED=false in production to catch
 * unimplemented analytics tracking calls.
 */
const ANALYTICS_TRACKING_ENABLED = process.env.ANALYTICS_TRACKING_ENABLED !== 'false';

/**
 * Custom error for unimplemented analytics features
 */
export class AnalyticsStubError extends Error {
  public readonly isAnalyticsStub = true;
  public readonly serviceName: string;
  public readonly methodName: string;

  constructor(serviceName: string, methodName: string) {
    super(
      `[ANALYTICS STUB] ${serviceName}.${methodName}() is not implemented. ` +
      `Set ANALYTICS_TRACKING_ENABLED=true to allow stubs or implement the real service.`
    );
    this.name = 'AnalyticsStubError';
    this.serviceName = serviceName;
    this.methodName = methodName;
  }
}

/**
 * Helper to log stub warning
 */
function logStubWarning(serviceName: string, methodName: string): void {
  console.warn(`⚠️ [ANALYTICS STUB] ${serviceName}.${methodName}() - returning mock data (not persisted)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS CACHE SERVICE (STUBS for backward compatibility)
// These were from analyticsCache.service.ts which was consolidated
// ═══════════════════════════════════════════════════════════════════════════

const cacheStore = new Map<string, { value: any; expiry: number }>();

export const analyticsCache = {
  get: (key: string): any => {
    const item = cacheStore.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      cacheStore.delete(key);
      return null;
    }
    return item.value;
  },
  set: (key: string, value: any, ttlMs: number = 60000): void => {
    cacheStore.set(key, { value, expiry: Date.now() + ttlMs });
  },
  del: (key: string): void => {
    cacheStore.delete(key);
  },
  clear: (): void => {
    cacheStore.clear();
  },
  getTTLRemaining: (key: string): number => {
    const item = cacheStore.get(key);
    if (!item) return 0;
    return Math.max(0, item.expiry - Date.now());
  },
  invalidate: (pattern: string): void => {
    for (const key of cacheStore.keys()) {
      if (key.includes(pattern)) cacheStore.delete(key);
    }
  },
  invalidateAll: (): void => {
    cacheStore.clear();
  },
  getStats: (): { size: number; keys: string[] } => ({
    size: cacheStore.size,
    keys: Array.from(cacheStore.keys())
  }),
  getKeys: (): string[] => Array.from(cacheStore.keys())
};

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS AGGREGATION SERVICE (STUBS for backward compatibility)
// These were from analyticsAggregation.service.ts which was consolidated
// ⚠️ WARNING: These are stubs - no actual aggregation is performed
// ═══════════════════════════════════════════════════════════════════════════

export const aggregationService = {
  aggregateDaily: async () => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'aggregateDaily');
    }
    logStubWarning('aggregationService', 'aggregateDaily');
    return { success: true, isStub: true };
  },
  aggregateWeekly: async () => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'aggregateWeekly');
    }
    logStubWarning('aggregationService', 'aggregateWeekly');
    return { success: true, isStub: true };
  },
  aggregateMonthly: async () => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'aggregateMonthly');
    }
    logStubWarning('aggregationService', 'aggregateMonthly');
    return { success: true, isStub: true };
  },
  getAggregatedData: async (_period: string) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'getAggregatedData');
    }
    logStubWarning('aggregationService', 'getAggregatedData');
    return { data: [], period: _period, isStub: true };
  },
  aggregateDailyStatsRange: async (_startDate: Date, _endDate: Date) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'aggregateDailyStatsRange');
    }
    logStubWarning('aggregationService', 'aggregateDailyStatsRange');
    return [] as any[];
  },
  getPeriodComparison: async (_currentStart: Date, _currentEnd: Date, _previousStart?: Date, _previousEnd?: Date) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'getPeriodComparison');
    }
    logStubWarning('aggregationService', 'getPeriodComparison');
    return { current: {}, previous: {}, change: {}, isStub: true };
  },
  runDailyAggregationJob: async () => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'runDailyAggregationJob');
    }
    logStubWarning('aggregationService', 'runDailyAggregationJob');
    return { success: true, isStub: true };
  },
  runWeeklyAggregationJob: async () => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'runWeeklyAggregationJob');
    }
    logStubWarning('aggregationService', 'runWeeklyAggregationJob');
    return { success: true, isStub: true };
  },
  runMonthlyAggregationJob: async () => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('aggregationService', 'runMonthlyAggregationJob');
    }
    logStubWarning('aggregationService', 'runMonthlyAggregationJob');
    return { success: true, isStub: true };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS TRACKING SERVICE (STUBS for backward compatibility)
// These were from analytics-tracking.service.ts which was consolidated
// ⚠️ WARNING: These are stubs - no actual tracking data is persisted
// ═══════════════════════════════════════════════════════════════════════════

export const analyticsTrackingService = {
  recordFeedback: async (_params: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'recordFeedback');
    }
    logStubWarning('analyticsTrackingService', 'recordFeedback');
    return { success: true, id: 'stub-feedback-id', isStub: true };
  },
  getRAGPerformanceStats: async (_startDate?: any, _endDate?: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getRAGPerformanceStats');
    }
    logStubWarning('analyticsTrackingService', 'getRAGPerformanceStats');
    return { avgResponseTime: 0, totalQueries: 0, successRate: 100, isStub: true };
  },
  getAPIPerformanceStats: async (_startDate?: any, _endDate?: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getAPIPerformanceStats');
    }
    logStubWarning('analyticsTrackingService', 'getAPIPerformanceStats');
    return { avgLatency: 0, totalRequests: 0, errorRate: 0, isStub: true };
  },
  getConversationFeedbackStats: async (_conversationId: string) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getConversationFeedbackStats');
    }
    logStubWarning('analyticsTrackingService', 'getConversationFeedbackStats');
    return { totalFeedback: 0, avgRating: 0, isStub: true };
  },
  getFeatureUsageStats: async (_startDate?: any, _endDate?: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getFeatureUsageStats');
    }
    logStubWarning('analyticsTrackingService', 'getFeatureUsageStats');
    return { features: [] as any[], isStub: true };
  },
  trackEvent: async (_params: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'trackEvent');
    }
    logStubWarning('analyticsTrackingService', 'trackEvent');
    return { success: true, id: 'stub-event-id', isStub: true };
  },
  getTokenUsageStats: async (_params: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getTokenUsageStats');
    }
    logStubWarning('analyticsTrackingService', 'getTokenUsageStats');
    return { totalTokens: 0, inputTokens: 0, outputTokens: 0, isStub: true };
  },
  getDailyTokenUsage: async (_startDate?: any, _endDate?: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getDailyTokenUsage');
    }
    logStubWarning('analyticsTrackingService', 'getDailyTokenUsage');
    return [] as any[];
  },
  getErrorStats: async (_startDate?: any, _endDate?: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getErrorStats');
    }
    logStubWarning('analyticsTrackingService', 'getErrorStats');
    return { totalErrors: 0, errorsByType: [] as any[], isStub: true };
  },
  getDailyAnalytics: async (_startDate?: any, _endDate?: any) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'getDailyAnalytics');
    }
    logStubWarning('analyticsTrackingService', 'getDailyAnalytics');
    return [] as any[];
  },
  aggregateDailyAnalytics: async (_date: Date) => {
    if (!ANALYTICS_TRACKING_ENABLED) {
      throw new AnalyticsStubError('analyticsTrackingService', 'aggregateDailyAnalytics');
    }
    logStubWarning('analyticsTrackingService', 'aggregateDailyAnalytics');
    return { success: true, isStub: true };
  },
  incrementConversationMessages: async (_conversationId: string, _role: string): Promise<void> => {
    logStubWarning('analyticsTrackingService', 'incrementConversationMessages');
    // This is a fire-and-forget method, so we don't throw even if disabled
    return Promise.resolve();
  },
  recordRAGQuery: async (_params: any): Promise<void> => {
    logStubWarning('analyticsTrackingService', 'recordRAGQuery');
    // This is a fire-and-forget method, so we don't throw even if disabled
    return Promise.resolve();
  }
};

export default {
  getUserAnalytics,
  getConversationAnalytics,
  getDocumentAnalytics,
  getSystemHealthMetrics,
  getCostAnalytics,
  getFeatureUsageAnalytics,
  getAnalyticsOverview,
  getQuickStats,
  analyticsTrackingService
};
