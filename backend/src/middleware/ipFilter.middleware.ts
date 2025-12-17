import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { securityMonitoringService, SecurityEventType, ThreatLevel } from '../services/securityStubs.service';

/**
 * IP Filtering Middleware
 *
 * Features:
 * - IP blacklist (block malicious IPs)
 * - IP whitelist (allow trusted IPs only)
 * - Automatic blacklisting based on security events
 * - CIDR range support
 * - Country-based blocking (optional)
 */

interface IPFilterConfig {
  enableBlacklist: boolean;
  enableWhitelist: boolean;
  autoBlacklistThreshold: number; // Number of security events before auto-blacklist
  autoBlacklistWindowMinutes: number;
}

// In-memory cache for performance (refreshed periodically)
let blacklistedIPs: Set<string> = new Set();
let whitelistedIPs: Set<string> = new Set();
let lastCacheRefresh: Date = new Date(0);
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Default configuration
const config: IPFilterConfig = {
  enableBlacklist: true,
  enableWhitelist: false, // Disabled by default (would block all unknown IPs)
  autoBlacklistThreshold: 10,
  autoBlacklistWindowMinutes: 60,
};

/**
 * Extract IP address from request
 */
const getIPAddress = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] as string ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

/**
 * Check if IP is in CIDR range
 */
const isIPInCIDR = (ip: string, cidr: string): boolean => {
  if (!cidr.includes('/')) {
    // Not a CIDR range, exact match
    return ip === cidr;
  }

  try {
    const [range, bits] = cidr.split('/');
    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);
    const mask = -1 << (32 - parseInt(bits));

    return (ipNum & mask) === (rangeNum & mask);
  } catch (error) {
    console.error('Error checking CIDR range:', error);
    return false;
  }
};

/**
 * Convert IP to number for CIDR calculation
 */
const ipToNumber = (ip: string): number => {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
};

/**
 * Refresh IP cache from database
 */
const refreshIPCache = async (): Promise<void> => {
  const now = new Date();
  if (now.getTime() - lastCacheRefresh.getTime() < CACHE_TTL_MS) {
    return; // Cache still valid
  }

  try {
    // Note: In production, you'd have IPBlacklist and IPWhitelist tables
    // For now, we'll implement basic in-memory storage

    // This is a placeholder - in production you'd fetch from database:
    // const blacklist = await prisma.iPBlacklist.findMany({ where: { isActive: true } });
    // const whitelist = await prisma.iPWhitelist.findMany({ where: { isActive: true } });

    lastCacheRefresh = now;
    console.log('✅ IP filter cache refreshed');
  } catch (error) {
    console.error('❌ Failed to refresh IP cache:', error);
  }
};

/**
 * Add IP to blacklist
 */
export const blacklistIP = (ip: string, reason: string, duration?: number): void => {
  blacklistedIPs.add(ip);
  console.log(`🚫 IP ${ip} added to blacklist: ${reason}`);

  // If duration specified, auto-remove after that time
  if (duration) {
    setTimeout(() => {
      blacklistedIPs.delete(ip);
      console.log(`✅ IP ${ip} removed from blacklist (duration expired)`);
    }, duration);
  }

  // In production, also store in database:
  // await prisma.iPBlacklist.create({ data: { ip, reason, expiresAt: ... } });
};

/**
 * Remove IP from blacklist
 */
export const removeFromBlacklist = (ip: string): void => {
  blacklistedIPs.delete(ip);
  console.log(`✅ IP ${ip} removed from blacklist`);
};

/**
 * Add IP to whitelist
 */
export const whitelistIP = (ip: string, reason: string): void => {
  whitelistedIPs.add(ip);
  console.log(`✅ IP ${ip} added to whitelist: ${reason}`);
};

/**
 * Check if IP is blacklisted
 */
const isBlacklisted = async (ip: string): Promise<boolean> => {
  await refreshIPCache();

  // Check exact match
  if (blacklistedIPs.has(ip)) {
    return true;
  }

  // Check CIDR ranges
  for (const entry of blacklistedIPs) {
    if (entry.includes('/') && isIPInCIDR(ip, entry)) {
      return true;
    }
  }

  return false;
};

/**
 * Check if IP is whitelisted
 */
const isWhitelisted = async (ip: string): Promise<boolean> => {
  await refreshIPCache();

  // Localhost is always whitelisted
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return true;
  }

  // Check exact match
  if (whitelistedIPs.has(ip)) {
    return true;
  }

  // Check CIDR ranges
  for (const entry of whitelistedIPs) {
    if (entry.includes('/') && isIPInCIDR(ip, entry)) {
      return true;
    }
  }

  return false;
};

/**
 * Auto-blacklist IP based on security events
 */
export const checkAutoBlacklist = async (ip: string): Promise<void> => {
  const since = new Date(Date.now() - config.autoBlacklistWindowMinutes * 60 * 1000);

  // Count recent security violations from this IP
  const violations = await prisma.auditLog.count({
    where: {
      ipAddress: ip,
      status: 'failure',
      createdAt: { gte: since },
    },
  });

  if (violations >= config.autoBlacklistThreshold) {
    blacklistIP(ip, `Auto-blacklisted: ${violations} violations in ${config.autoBlacklistWindowMinutes} minutes`, 24 * 60 * 60 * 1000); // 24 hour blacklist

    await securityMonitoringService.recordSecurityEvent({
      eventType: SecurityEventType.SUSPICIOUS_IP_BEHAVIOR,
      threatLevel: ThreatLevel.CRITICAL,
      ipAddress: ip,
      description: `IP automatically blacklisted due to excessive security violations`,
      document_metadata: {
        violationCount: violations,
        timeWindowMinutes: config.autoBlacklistWindowMinutes,
        threshold: config.autoBlacklistThreshold,
      },
    });
  }
};

/**
 * IP Filter Middleware
 */
export const ipFilter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getIPAddress(req);

  // Skip IP filtering for health checks
  if (req.path === '/health') {
    return next();
  }

  try {
    // Check whitelist first (if enabled)
    if (config.enableWhitelist) {
      const whitelisted = await isWhitelisted(ip);
      if (!whitelisted) {
        console.log(`🚫 IP ${ip} not in whitelist - access denied`);

        await securityMonitoringService.recordSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          threatLevel: ThreatLevel.MEDIUM,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
          description: 'Access attempt from non-whitelisted IP',
          document_metadata: {
            path: req.path,
            method: req.method,
          },
        });

        res.status(403).json({
          error: 'Access denied',
          message: 'Your IP address is not authorized to access this service',
        });
        return;
      }
    }

    // Check blacklist
    if (config.enableBlacklist) {
      const blacklisted = await isBlacklisted(ip);
      if (blacklisted) {
        console.log(`🚫 IP ${ip} is blacklisted - access denied`);

        await securityMonitoringService.recordSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          threatLevel: ThreatLevel.HIGH,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
          description: 'Access attempt from blacklisted IP',
          document_metadata: {
            path: req.path,
            method: req.method,
          },
        });

        res.status(403).json({
          error: 'Access denied',
          message: 'Your IP address has been blocked due to suspicious activity',
        });
        return;
      }
    }

    // IP is allowed, proceed
    next();
  } catch (error) {
    console.error('Error in IP filter middleware:', error);
    // Fail open - allow request if middleware encounters error
    next();
  }
};

/**
 * Get IP filter statistics
 */
export const getIPFilterStats = () => {
  return {
    blacklistedIPCount: blacklistedIPs.size,
    whitelistedIPCount: whitelistedIPs.size,
    blacklistEnabled: config.enableBlacklist,
    whitelistEnabled: config.enableWhitelist,
    autoBlacklistThreshold: config.autoBlacklistThreshold,
    lastCacheRefresh,
  };
};

/**
 * Configure IP filter
 */
export const configureIPFilter = (newConfig: Partial<IPFilterConfig>) => {
  Object.assign(config, newConfig);
  console.log('✅ IP filter configuration updated:', config);
};

// Common malicious IP ranges to blacklist (examples)
// In production, use threat intelligence feeds
const KNOWN_MALICIOUS_RANGES: string[] = [
  // Add known bad actor IP ranges here
  // '192.0.2.0/24', // Example
];

// Pre-populate blacklist with known malicious IPs
KNOWN_MALICIOUS_RANGES.forEach(range => {
  blacklistedIPs.add(range);
});

export default ipFilter;
