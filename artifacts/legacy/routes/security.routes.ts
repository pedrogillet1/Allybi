import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  getUserAuditLogs,
  getSecurityViolations,
  detectSuspiciousActivity,
  detectCrossUserAccessAttempts,
} from '../middleware/auditLog.middleware';
import prisma from '../config/database';
import { securityMonitoringService, ThreatLevel, sessionManagementService, bruteForceProtection, securityDashboardService } from '../services/securityStubs.service';
import { getIPFilterStats, blacklistIP, removeFromBlacklist, whitelistIP } from '../middleware/ipFilter.middleware';

const router = Router();

// All security routes require authentication
router.use(authenticateToken);

// Helper function to check admin role
const isAdmin = (req: Request): boolean => {
  // TODO: Implement proper RBAC with role field on User model
  // Currently always returns false until User model has a role field
  return false;
};

/**
 * Get current user's audit logs
 */
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await getUserAuditLogs(req.user.id, limit);

    return res.json({ logs });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * Get security violations (admin only)
 * TODO: Add admin role check
 */
router.get('/violations', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // TODO: Add admin role check here
    // For now, only allow specific admin user IDs (placeholder)
    const limit = parseInt(req.query.limit as string) || 100;
    const violations = await getSecurityViolations(limit);

    return res.json({ violations });
  } catch (error) {
    console.error('Error fetching security violations:', error);
    return res.status(500).json({ error: 'Failed to fetch security violations' });
  }
});

/**
 * Detect suspicious activity for current user
 */
router.get('/suspicious-activity', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const timeWindow = parseInt(req.query.timeWindow as string) || 60;
    const activity = await detectSuspiciousActivity(req.user.id, timeWindow);

    return res.json(activity);
  } catch (error) {
    console.error('Error detecting suspicious activity:', error);
    return res.status(500).json({ error: 'Failed to detect suspicious activity' });
  }
});

/**
 * Get cross-user access attempts (admin only)
 */
router.get('/cross-user-attempts', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // TODO: Add admin role check here
    const limit = parseInt(req.query.limit as string) || 50;
    const attempts = await detectCrossUserAccessAttempts(limit);

    return res.json({ attempts });
  } catch (error) {
    console.error('Error fetching cross-user attempts:', error);
    return res.status(500).json({ error: 'Failed to fetch cross-user attempts' });
  }
});

/**
 * Get security dashboard summary
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get last 24 hours of activity
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // User-specific stats
    const userStats = await prisma.auditLog.groupBy({
      by: ['status'],
      where: {
        userId: req.user.id,
        createdAt: { gte: yesterday },
      },
      _count: true,
    });

    const totalRequests = userStats.reduce((sum, stat) => sum + stat._count, 0);
    const failedRequests = userStats.find(s => s.status === 'failure')?._count || 0;
    const successRate = totalRequests > 0 ? ((totalRequests - failedRequests) / totalRequests) * 100 : 100;

    // Recent activity
    const recentActivity = await getUserAuditLogs(req.user.id, 10);

    // Suspicious activity check
    const suspiciousCheck = await detectSuspiciousActivity(req.user.id, 60);

    return res.json({
      summary: {
        totalRequests,
        successfulRequests: totalRequests - failedRequests,
        failedRequests,
        successRate: successRate.toFixed(2) + '%',
        timeWindow: '24 hours',
      },
      suspiciousActivity: {
        risk: suspiciousCheck.risk,
        failedAttempts: suspiciousCheck.failedAttempts,
        isSuspicious: suspiciousCheck.isSuspicious,
      },
      recentActivity: recentActivity.slice(0, 5).map(log => ({
        action: log.action,
        status: log.status,
        timestamp: log.createdAt,
        ipAddress: log.ipAddress,
      })),
    });
  } catch (error) {
    console.error('Error fetching security dashboard:', error);
    return res.status(500).json({ error: 'Failed to fetch security dashboard' });
  }
});

/**
 * Get system-wide security metrics (admin only)
 */
router.get('/system-metrics', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // TODO: Add admin role check here

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Total audit logs
    const totalLogs = await prisma.auditLog.count({
      where: { createdAt: { gte: yesterday } },
    });

    // Failed attempts
    const failedAttempts = await prisma.auditLog.count({
      where: {
        status: 'failure',
        createdAt: { gte: yesterday },
      },
    });

    // Unique users with activity
    const uniqueUsers = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: yesterday } },
    });

    // Top active users
    const topUsers = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: yesterday } },
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    });

    return res.json({
      systemMetrics: {
        totalRequests: totalLogs,
        failedRequests: failedAttempts,
        uniqueActiveUsers: uniqueUsers.length,
        successRate: totalLogs > 0 ? (((totalLogs - failedAttempts) / totalLogs) * 100).toFixed(2) + '%' : '100%',
        timeWindow: '24 hours',
      },
      topUsers: topUsers.map(u => ({
        userId: u.userId,
        requestCount: u._count,
      })),
    });
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch system metrics' });
  }
});

/**
 * PHASE 1 ENTERPRISE SECURITY ENDPOINTS
 */

/**
 * GET /api/security/sessions
 * Get active sessions for current user
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const summary = await sessionManagementService.getUserSessionSummary(req.user.id);
    return res.json(summary);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * DELETE /api/security/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId } = req.params;
    const revoked = await sessionManagementService.revokeSession(sessionId, req.user.id);

    if (!revoked) {
      return res.status(404).json({ error: 'Session not found or already revoked' });
    }

    return res.json({ message: 'Session revoked successfully', sessionId });
  } catch (error) {
    console.error('Error revoking session:', error);
    return res.status(500).json({ error: 'Failed to revoke session' });
  }
});

/**
 * POST /api/security/sessions/revoke-all
 * Revoke all sessions except current one
 */
router.post('/sessions/revoke-all', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentSessionId = req.headers['x-session-id'] as string;
    const count = await sessionManagementService.invalidateAllUserSessions(req.user.id, currentSessionId);

    return res.json({
      message: 'All other sessions revoked successfully',
      revokedCount: count,
    });
  } catch (error) {
    console.error('Error revoking all sessions:', error);
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

/**
 * GET /api/security/threats
 * Analyze threats for current user
 */
router.get('/threats', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                   || req.headers['x-real-ip'] as string
                   || req.socket.remoteAddress
                   || 'unknown';

    const [bruteForce, massDownload, suspiciousIP, unauthorizedAccess] = await Promise.all([
      securityMonitoringService.detectBruteForce(req.user.id, ipAddress),
      securityMonitoringService.detectMassDownload(req.user.id, ipAddress),
      securityMonitoringService.detectSuspiciousIP(ipAddress),
      securityMonitoringService.detectUnauthorizedAccess(req.user.id),
    ]);

    const threatLevels = [bruteForce, massDownload, suspiciousIP, unauthorizedAccess].map(t => t.threatLevel);
    const maxThreatLevel = threatLevels.includes(ThreatLevel.CRITICAL) ? ThreatLevel.CRITICAL
                         : threatLevels.includes(ThreatLevel.HIGH) ? ThreatLevel.HIGH
                         : threatLevels.includes(ThreatLevel.MEDIUM) ? ThreatLevel.MEDIUM
                         : ThreatLevel.LOW;

    return res.json({
      overallThreatLevel: maxThreatLevel,
      threats: { bruteForce, massDownload, suspiciousIP, unauthorizedAccess },
    });
  } catch (error) {
    console.error('Error analyzing threats:', error);
    return res.status(500).json({ error: 'Failed to analyze threats' });
  }
});

/**
 * GET /api/security/events
 * Get recent security events (admin only)
 */
router.get('/events', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const events = await securityMonitoringService.getRecentSecurityEvents(limit);

    return res.json({ events, count: events.length });
  } catch (error) {
    console.error('Error fetching security events:', error);
    return res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

/**
 * POST /api/security/ip/blacklist
 * Add IP to blacklist (admin only)
 */
router.post('/ip/blacklist', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { ip, reason, durationHours } = req.body;
    if (!ip || !reason) {
      return res.status(400).json({ error: 'IP and reason are required' });
    }

    const duration = durationHours ? durationHours * 60 * 60 * 1000 : undefined;
    blacklistIP(ip, reason, duration);

    return res.json({
      message: 'IP blacklisted successfully',
      ip,
      reason,
      duration: durationHours ? `${durationHours} hours` : 'permanent',
    });
  } catch (error) {
    console.error('Error blacklisting IP:', error);
    return res.status(500).json({ error: 'Failed to blacklist IP' });
  }
});

/**
 * DELETE /api/security/ip/blacklist/:ip
 * Remove IP from blacklist (admin only)
 */
router.delete('/ip/blacklist/:ip', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { ip } = req.params;
    removeFromBlacklist(ip);

    return res.json({ message: 'IP removed from blacklist successfully', ip });
  } catch (error) {
    console.error('Error removing IP from blacklist:', error);
    return res.status(500).json({ error: 'Failed to remove IP from blacklist' });
  }
});

/**
 * POST /api/security/brute-force/unlock
 * Manually unlock a user or IP (admin only)
 */
router.post('/brute-force/unlock', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { identifier, type } = req.body;
    if (!identifier || !type || !['ip', 'user'].includes(type)) {
      return res.status(400).json({ error: 'Valid identifier and type (ip or user) are required' });
    }

    const unlocked = bruteForceProtection.unlock(identifier, type);
    if (!unlocked) {
      return res.status(404).json({ error: 'Identifier not found or not locked' });
    }

    return res.json({ message: `${type} unlocked successfully`, identifier, type });
  } catch (error) {
    console.error('Error unlocking:', error);
    return res.status(500).json({ error: 'Failed to unlock' });
  }
});

/**
 * GET /api/security/metrics
 * Get comprehensive security metrics (admin only)
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const hours = parseInt(req.query.hours as string) || 24;
    const [securityMetrics, bruteForceStats, ipFilterStats] = await Promise.all([
      securityMonitoringService.getSecurityMetrics(hours),
      Promise.resolve(bruteForceProtection.getStatistics()),
      Promise.resolve(getIPFilterStats()),
    ]);

    return res.json({
      securityMetrics,
      bruteForceProtection: bruteForceStats,
      ipFilter: ipFilterStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching security metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch security metrics' });
  }
});

/**
 * PHASE 3 ENTERPRISE SECURITY ENDPOINTS
 * Advanced security dashboard and analytics
 */

/**
 * GET /api/security/dashboard/overview
 * Get comprehensive security overview (admin only)
 */
router.get('/dashboard/overview', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const hours = parseInt(req.query.hours as string) || 24;
    const overview = await securityDashboardService.getSecurityOverview(hours);

    return res.json(overview);
  } catch (error) {
    console.error('Error fetching security overview:', error);
    return res.status(500).json({ error: 'Failed to fetch security overview' });
  }
});

/**
 * GET /api/security/dashboard/trends
 * Get security trends over time (admin only)
 */
router.get('/dashboard/trends', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const days = parseInt(req.query.days as string) || 7;
    const trends = await securityDashboardService.getSecurityTrends(days);

    return res.json(trends);
  } catch (error) {
    console.error('Error fetching security trends:', error);
    return res.status(500).json({ error: 'Failed to fetch security trends' });
  }
});

/**
 * GET /api/security/dashboard/insights
 * Get actionable security insights (admin only)
 */
router.get('/dashboard/insights', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const insights = await securityDashboardService.getSecurityInsights();

    return res.json({ insights, count: insights.length });
  } catch (error) {
    console.error('Error fetching security insights:', error);
    return res.status(500).json({ error: 'Failed to fetch security insights' });
  }
});

/**
 * GET /api/security/dashboard/compliance
 * Get compliance report (admin only)
 */
router.get('/dashboard/compliance', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const report = await securityDashboardService.getComplianceReport();

    return res.json(report);
  } catch (error) {
    console.error('Error fetching compliance report:', error);
    return res.status(500).json({ error: 'Failed to fetch compliance report' });
  }
});

/**
 * GET /api/security/dashboard/realtime
 * Get real-time security status (admin only)
 */
router.get('/dashboard/realtime', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = await securityDashboardService.getRealtimeStatus();

    return res.json(status);
  } catch (error) {
    console.error('Error fetching realtime status:', error);
    return res.status(500).json({ error: 'Failed to fetch realtime status' });
  }
});

/**
 * GET /api/security/data-retention/stats
 * Get data retention statistics (admin only)
 */
router.get('/data-retention/stats', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const stats = {
      message: 'Data retention service currently disabled',
      policies: []
    };

    return res.json(stats);
  } catch (error) {
    console.error('Error fetching retention stats:', error);
    return res.status(500).json({ error: 'Failed to fetch retention stats' });
  }
});

/**
 * POST /api/security/data-retention/cleanup
 * Manually trigger data retention cleanup (admin only)
 */
router.post('/data-retention/cleanup', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { dataType } = req.body;

    const results = [{
      message: 'Data retention service currently disabled',
      cleaned: 0
    }];

    return res.json({
      message: 'Data retention cleanup currently disabled',
      results,
    });
  } catch (error) {
    console.error('Error running cleanup:', error);
    return res.status(500).json({ error: 'Failed to run cleanup' });
  }
});

/**
 * GET /api/security/data-retention/policies
 * Get all retention policies (admin only)
 */
router.get('/data-retention/policies', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const policies: any[] = [];

    return res.json({ policies });
  } catch (error) {
    console.error('Error fetching retention policies:', error);
    return res.status(500).json({ error: 'Failed to fetch retention policies' });
  }
});

export default router;
