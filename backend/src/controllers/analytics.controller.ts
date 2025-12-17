/**
 * Analytics Controller
 *
 * PURPOSE: Handle API requests for analytics dashboard
 * ENDPOINTS: Overview, Users, Conversations, Documents, System Health, Costs
 */

import { Request, Response } from 'express';
import analyticsService, {
  analyticsCache,
  aggregationService,
  analyticsTrackingService
} from '../services/analyticsEngine.service';

// ═══════════════════════════════════════════════════════════════════════════
// GET OVERVIEW (ALL METRICS)
// ═══════════════════════════════════════════════════════════════════════════

export const getOverview = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/overview');

    // Check cache
    const cached = analyticsCache.get('overview');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true,
        cacheAge: analyticsCache.getTTLRemaining('overview')
      });
    }

    // Fetch fresh data
    const overview = await analyticsService.getAnalyticsOverview();

    // Cache for 5 minutes
    analyticsCache.set('overview', overview);

    res.json({
      success: true,
      data: overview,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting overview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET QUICK STATS (LIGHTWEIGHT)
// ═══════════════════════════════════════════════════════════════════════════

export const getQuickStats = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/quick-stats');

    // Check cache
    const cached = analyticsCache.get('quick-stats');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Fetch fresh data
    const quickStats = await analyticsService.getQuickStats();

    // Cache for 1 minute
    analyticsCache.set('quick-stats', quickStats);

    res.json({
      success: true,
      data: quickStats,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting quick stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET USER ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export const getUserAnalytics = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/users');

    // Check cache
    const cached = analyticsCache.get('users');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Fetch fresh data
    const users = await analyticsService.getUserAnalytics();

    // Cache for 5 minutes
    analyticsCache.set('users', users);

    res.json({
      success: true,
      data: users,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting user analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET CONVERSATION ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export const getConversationAnalytics = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/conversations');

    // Check cache
    const cached = analyticsCache.get('conversations');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Fetch fresh data
    const conversations = await analyticsService.getConversationAnalytics();

    // Cache for 5 minutes
    analyticsCache.set('conversations', conversations);

    res.json({
      success: true,
      data: conversations,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting conversation analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET DOCUMENT ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export const getDocumentAnalytics = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/documents');

    // Check cache
    const cached = analyticsCache.get('documents');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Fetch fresh data
    const documents = await analyticsService.getDocumentAnalytics();

    // Cache for 5 minutes
    analyticsCache.set('documents', documents);

    res.json({
      success: true,
      data: documents,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting document analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET SYSTEM HEALTH METRICS
// ═══════════════════════════════════════════════════════════════════════════

export const getSystemHealth = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/system-health');

    // Check cache (shorter TTL for health metrics)
    const cached = analyticsCache.get('system-health');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Fetch fresh data
    const systemHealth = await analyticsService.getSystemHealthMetrics();

    // Cache for 1 minute
    analyticsCache.set('system-health', systemHealth);

    res.json({
      success: true,
      data: systemHealth,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting system health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET COST ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export const getCostAnalytics = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/costs');

    // Check cache
    const cached = analyticsCache.get('costs');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Fetch fresh data
    const costs = await analyticsService.getCostAnalytics();

    // Cache for 10 minutes
    analyticsCache.set('costs', costs);

    res.json({
      success: true,
      data: costs,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting cost analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET FEATURE USAGE ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export const getFeatureUsage = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/feature-usage');

    // Check cache
    const cached = analyticsCache.get('feature-usage');
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Fetch fresh data
    const featureUsage = await analyticsService.getFeatureUsageAnalytics();

    // Cache for 5 minutes
    analyticsCache.set('feature-usage', featureUsage);

    res.json({
      success: true,
      data: featureUsage,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting feature usage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET DAILY STATS FOR DATE RANGE
// ═══════════════════════════════════════════════════════════════════════════

export const getDailyStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const { startDate, endDate } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/daily?startDate=${startDate}&endDate=${endDate}`);

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate query parameters are required'
      });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Limit range to 90 days
    const daysDiff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (daysDiff > 90) {
      return res.status(400).json({
        success: false,
        error: 'Date range cannot exceed 90 days'
      });
    }

    const cacheKey = `daily-${startDate}-${endDate}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const dailyStats = await aggregationService.aggregateDailyStatsRange(start, end);

    analyticsCache.set(cacheKey, dailyStats);

    res.json({
      success: true,
      data: dailyStats,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting daily stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET PERIOD COMPARISON
// ═══════════════════════════════════════════════════════════════════════════

export const getPeriodComparison = async (req: Request, res: Response): Promise<any> => {
  try {
    const { period } = req.query; // 'week' | 'month'

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/comparison?period=${period}`);

    const now = new Date();
    let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;

    if (period === 'month') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEnd = now;
      previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    } else {
      // Default to week
      currentEnd = now;
      currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(currentStart.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const cacheKey = `comparison-${period}-${currentStart.toISOString().split('T')[0]}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const comparison = await aggregationService.getPeriodComparison(
      currentStart, currentEnd,
      previousStart, previousEnd
    );

    analyticsCache.set(cacheKey, comparison);

    res.json({
      success: true,
      data: comparison,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting period comparison:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH CACHE (FORCE UPDATE)
// ═══════════════════════════════════════════════════════════════════════════

export const refreshCache = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] POST /api/admin/analytics/refresh');

    const { key } = req.body;

    if (key) {
      // Refresh specific key
      analyticsCache.invalidate(key);
      console.log(`📊 [ANALYTICS API] Invalidated cache key: ${key}`);
    } else {
      // Refresh all
      analyticsCache.invalidateAll();
      console.log('📊 [ANALYTICS API] Invalidated all cache');
    }

    // Pre-fetch overview to warm cache
    const overview = await analyticsService.getAnalyticsOverview();
    analyticsCache.set('overview', overview);

    res.json({
      success: true,
      message: key ? `Cache key '${key}' refreshed` : 'All cache refreshed',
      data: overview
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error refreshing cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET CACHE STATS
// ═══════════════════════════════════════════════════════════════════════════

export const getCacheStats = async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 [ANALYTICS API] GET /api/admin/analytics/cache-stats');

    const stats = analyticsCache.getStats();
    const keys = analyticsCache.getKeys();

    res.json({
      success: true,
      data: {
        stats,
        keys
      }
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DATA (CSV)
// ═══════════════════════════════════════════════════════════════════════════

export const exportData = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type, format, startDate, endDate } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/export?type=${type}&format=${format}`);

    if (!type || !['users', 'conversations', 'documents', 'daily'].includes(type as string)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid export type. Use: users, conversations, documents, or daily'
      });
    }

    let data: any[];
    let filename: string;

    switch (type) {
      case 'users':
        const userAnalytics = await analyticsService.getUserAnalytics();
        data = userAnalytics.mostActiveUsers;
        filename = 'users-analytics';
        break;

      case 'conversations':
        const convAnalytics = await analyticsService.getConversationAnalytics();
        data = convAnalytics.longestConversations;
        filename = 'conversations-analytics';
        break;

      case 'documents':
        const docAnalytics = await analyticsService.getDocumentAnalytics();
        data = docAnalytics.recentUploads;
        filename = 'documents-analytics';
        break;

      case 'daily':
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            error: 'startDate and endDate are required for daily export'
          });
        }
        data = await aggregationService.aggregateDailyStatsRange(
          new Date(startDate as string),
          new Date(endDate as string)
        );
        filename = `daily-stats-${startDate}-${endDate}`;
        break;

      default:
        data = [];
        filename = 'export';
    }

    if (format === 'csv') {
      // Convert to CSV
      if (data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No data to export'
        });
      }

      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => {
            const value = row[h];
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // Default: JSON
    res.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error exporting data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RUN AGGREGATION JOB (MANUAL TRIGGER)
// ═══════════════════════════════════════════════════════════════════════════

export const runAggregation = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type } = req.body; // 'daily' | 'weekly' | 'monthly'

    console.log(`📊 [ANALYTICS API] POST /api/admin/analytics/aggregate?type=${type}`);

    switch (type) {
      case 'daily':
        await aggregationService.runDailyAggregationJob();
        break;
      case 'weekly':
        await aggregationService.runWeeklyAggregationJob();
        break;
      case 'monthly':
        await aggregationService.runMonthlyAggregationJob();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid aggregation type. Use: daily, weekly, or monthly'
        });
    }

    res.json({
      success: true,
      message: `${type} aggregation completed`
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error running aggregation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RECORD FEEDBACK (PUBLIC API)
// ═══════════════════════════════════════════════════════════════════════════

export const recordFeedback = async (req: Request, res: Response): Promise<any> => {
  try {
    const { conversationId, messageId, feedbackType, rating, comment, categories } = req.body;
    const userId = (req as any).user?.userId;

    console.log(`📊 [ANALYTICS API] POST /api/analytics/feedback - ${feedbackType}`);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!conversationId || !feedbackType) {
      return res.status(400).json({
        success: false,
        error: 'conversationId and feedbackType are required'
      });
    }

    if (!['thumbs_up', 'thumbs_down', 'rating', 'comment'].includes(feedbackType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feedbackType. Use: thumbs_up, thumbs_down, rating, or comment'
      });
    }

    const feedback = await analyticsTrackingService.recordFeedback({
      userId,
      conversationId,
      messageId,
      feedbackType,
      rating,
      comment,
      categories,
    });

    res.json({
      success: true,
      data: feedback,
      message: 'Feedback recorded successfully'
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error recording feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET RAG PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════════════════════

export const getRAGPerformance = async (req: Request, res: Response): Promise<any> => {
  try {
    const { days } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/rag-performance?days=${days}`);

    const cacheKey = `rag-performance-${days || 7}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const stats = await analyticsTrackingService.getRAGPerformanceStats(
      undefined,
      parseInt(days as string) || 7
    );

    analyticsCache.set(cacheKey, stats);

    res.json({
      success: true,
      data: stats,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting RAG performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET API PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════════════════════

export const getAPIPerformance = async (req: Request, res: Response): Promise<any> => {
  try {
    const { service, hours } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/api-performance?service=${service}&hours=${hours}`);

    const cacheKey = `api-performance-${service || 'all'}-${hours || 24}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const stats = await analyticsTrackingService.getAPIPerformanceStats(
      service as string | undefined,
      parseInt(hours as string) || 24
    );

    analyticsCache.set(cacheKey, stats);

    res.json({
      success: true,
      data: stats,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting API performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET CONVERSATION FEEDBACK STATS
// ═══════════════════════════════════════════════════════════════════════════

export const getConversationFeedbackStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const { conversationId } = req.params;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/conversations/${conversationId}/feedback`);

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'conversationId is required'
      });
    }

    const stats = await analyticsTrackingService.getConversationFeedbackStats(conversationId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting conversation feedback stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET FEATURE USAGE STATS (FROM TRACKING)
// ═══════════════════════════════════════════════════════════════════════════

export const getFeatureUsageStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const { days } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/feature-usage-stats?days=${days}`);

    const cacheKey = `feature-usage-stats-${days || 30}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const stats = await analyticsTrackingService.getFeatureUsageStats(
      parseInt(days as string) || 30
    );

    analyticsCache.set(cacheKey, stats);

    res.json({
      success: true,
      data: stats,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting feature usage stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TRACK EVENT (PUBLIC API)
// ═══════════════════════════════════════════════════════════════════════════

export const trackEvent = async (req: Request, res: Response): Promise<any> => {
  try {
    const { eventType, eventName, category, properties, duration } = req.body;
    const userId = (req as any).user?.userId;

    console.log(`📊 [ANALYTICS API] POST /api/analytics/track - ${eventType}/${eventName}`);

    if (!eventType || !eventName) {
      return res.status(400).json({
        success: false,
        error: 'eventType and eventName are required'
      });
    }

    const event = await analyticsTrackingService.trackEvent({
      userId,
      eventType,
      eventName,
      category,
      properties,
      duration,
    });

    res.json({
      success: true,
      data: { id: event.id },
      message: 'Event tracked successfully'
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error tracking event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN USAGE ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export const getTokenUsage = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, startDate, endDate, groupBy } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/token-usage`);

    const cacheKey = `token-usage-${userId || 'all'}-${groupBy || 'model'}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const stats = await analyticsTrackingService.getTokenUsageStats({
      userId: userId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      groupBy: groupBy as 'model' | 'provider' | 'requestType' | undefined,
    });

    analyticsCache.set(cacheKey, stats);

    res.json({
      success: true,
      data: stats,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting token usage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getDailyTokenUsage = async (req: Request, res: Response): Promise<any> => {
  try {
    const { days } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/token-usage/daily?days=${days}`);

    const dailyUsage = await analyticsTrackingService.getDailyTokenUsage(
      parseInt(days as string) || 30
    );

    res.json({
      success: true,
      data: dailyUsage
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting daily token usage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ERROR ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export const getErrorStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const { days } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/errors?days=${days}`);

    const cacheKey = `error-stats-${days || 7}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const stats = await analyticsTrackingService.getErrorStats(
      parseInt(days as string) || 7
    );

    analyticsCache.set(cacheKey, stats);

    res.json({
      success: true,
      data: stats,
      cached: false
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting error stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DAILY ANALYTICS AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

export const getDailyAnalyticsAggregates = async (req: Request, res: Response): Promise<any> => {
  try {
    const { days } = req.query;

    console.log(`📊 [ANALYTICS API] GET /api/admin/analytics/daily-aggregates?days=${days}`);

    const dailyAnalytics = await analyticsTrackingService.getDailyAnalytics(
      parseInt(days as string) || 30
    );

    res.json({
      success: true,
      data: dailyAnalytics
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error getting daily aggregates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const runDailyAggregation = async (req: Request, res: Response): Promise<any> => {
  try {
    const { date } = req.body;

    console.log(`📊 [ANALYTICS API] POST /api/admin/analytics/aggregate-daily`);

    const targetDate = date ? new Date(date) : new Date();
    const result = await analyticsTrackingService.aggregateDailyAnalytics(targetDate);

    res.json({
      success: true,
      data: result,
      message: `Daily analytics aggregated for ${targetDate.toISOString().split('T')[0]}`
    });
  } catch (error: any) {
    console.error('❌ [ANALYTICS API] Error running daily aggregation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export default {
  getOverview,
  getQuickStats,
  getUserAnalytics,
  getConversationAnalytics,
  getDocumentAnalytics,
  getSystemHealth,
  getCostAnalytics,
  getFeatureUsage,
  getDailyStats,
  getPeriodComparison,
  refreshCache,
  getCacheStats,
  exportData,
  runAggregation,
  // New tracking endpoints
  recordFeedback,
  getRAGPerformance,
  getAPIPerformance,
  getConversationFeedbackStats,
  getFeatureUsageStats,
  trackEvent,
  // Token usage & cost analytics
  getTokenUsage,
  getDailyTokenUsage,
  // Error analytics
  getErrorStats,
  // Daily aggregation
  getDailyAnalyticsAggregates,
  runDailyAggregation
};
