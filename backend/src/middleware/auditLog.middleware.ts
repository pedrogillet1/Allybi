import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import prisma from "../config/database";
import { logger } from "../utils/logger";
import { auditStore } from "../services/security/auditStore.service";
import { securityAlerting } from "../services/security/alerting.service";

function hashIp(ip: string | null | undefined): string {
  if (!ip) return "unknown";
  const salt = process.env.KODA_AUDIT_SALT || "audit-ip-salt";
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 16);
}

/**
 * Security Audit Logging Middleware
 *
 * Logs ALL document and folder access for security monitoring
 * Detects potential security violations and unauthorized access attempts
 *
 * SECURITY: Response bodies are NEVER logged — they may contain user data,
 * tokens, or other sensitive material. Only metadata is stored.
 */

interface AuditLogEntry {
  userId: string | null;
  action: string;
  resource: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: "success" | "failure";
  details: string | null;
}

/**
 * Audit log middleware - logs all sensitive operations
 */
export const auditLog = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Skip audit logging for OPTIONS requests (CORS preflight)
  if (req.method === "OPTIONS") {
    return next();
  }

  const startTime = Date.now();
  const originalJson = res.json.bind(res);

  // Capture response
  res.json = function (body: any) {
    const duration = Date.now() - startTime;
    const userId = req.user?.id || null;
    const action = `${req.method} ${req.path}`;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.get("user-agent") || null;

    // Determine if this is a sensitive operation
    const isSensitiveOperation =
      req.path.includes("/documents") ||
      req.path.includes("/folders") ||
      req.path.includes("/chat") ||
      req.path.includes("/users") ||
      req.path.includes("/presigned-urls") ||
      req.path.includes("/multipart-upload");

    if (isSensitiveOperation) {
      // Extract resource ID from path or body
      let resourceId = null;
      const pathSegments = req.path.split("/");
      const lastSegment = pathSegments[pathSegments.length - 1];

      // Check if last segment looks like a UUID
      if (lastSegment && lastSegment.includes("-") && lastSegment.length > 20) {
        resourceId = lastSegment;
      }

      // Build audit details — always include responseStatus and duration
      const isUploadPath =
        req.path.includes("/presigned-urls/") ||
        req.path.includes("/multipart-upload/");

      const detailsObj: Record<string, unknown> = {
        responseStatus: res.statusCode,
        duration,
      };

      if (res.statusCode >= 400) {
        detailsObj.statusCode = res.statusCode;
      }

      // For upload-related endpoints, capture key metadata (never full body)
      if (isUploadPath && body) {
        if (Array.isArray(body?.documentIds)) {
          detailsObj.documentIdsCount = body.documentIds.length;
        } else if (Array.isArray(body?.data?.documentIds)) {
          detailsObj.documentIdsCount = body.data.documentIds.length;
        }
        if (body?.error) {
          detailsObj.responseError = String(body.error).slice(0, 200);
        }
        if (body?.data?.error) {
          detailsObj.responseError = String(body.data.error).slice(0, 200);
        }
      }

      // Log to audit_log table — NEVER include response body
      prisma.auditLog
        .create({
          data: {
            userId,
            action,
            resource: resourceId,
            ipAddress: hashIp(ipAddress),
            userAgent,
            status: res.statusCode < 400 ? "success" : "failure",
            // Store only safe metadata, never response bodies
            details: JSON.stringify(detailsObj),
          },
        })
        .catch((err) => {
          logger.error("[AuditLog] write failed", {
            err: err.message,
            action,
            userId,
          });
        });

      // Append-only audit store (non-blocking)
      auditStore.writeAuditEntry({
        timestamp: new Date().toISOString(),
        userId: userId || "anonymous",
        action,
        resource: resourceId || "",
        ipHash: hashIp(ipAddress),
        status: res.statusCode < 400 ? "success" : "failure",
        details: detailsObj,
      }).catch(() => {}); // Non-blocking

      // Security violation detection — log only metadata, no body
      if (res.statusCode === 401 || res.statusCode === 403) {
        const hashedIp = hashIp(ipAddress);
        logger.warn("[AuditLog] security violation detected", {
          status: res.statusCode,
          action,
          userId: userId || "anonymous",
          ipAddress: hashedIp,
        });
        securityAlerting.trackAuthFailure(hashedIp, {
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
        });
      }
    }

    // Log slow operations
    if (duration > 5000) {
      logger.warn("[AuditLog] slow operation", {
        duration,
        action,
        userId,
      });
    }

    return originalJson(body);
  };

  next();
};

/**
 * Get recent audit logs for a user
 */
export const getUserAuditLogs = async (userId: string, limit: number = 50) => {
  return await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
};

/**
 * Get security violations (failed access attempts)
 */
export const getSecurityViolations = async (limit: number = 100) => {
  return await prisma.auditLog.findMany({
    where: { status: "failure" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
};

/**
 * Detect suspicious activity patterns
 */
export const detectSuspiciousActivity = async (
  userId: string,
  timeWindowMinutes: number = 60,
) => {
  const timeThreshold = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

  // Get recent failed attempts
  const failedAttempts = await prisma.auditLog.count({
    where: {
      userId,
      status: "failure",
      createdAt: { gte: timeThreshold },
    },
  });

  // Get recent successful accesses
  const successfulAccesses = await prisma.auditLog.count({
    where: {
      userId,
      status: "success",
      createdAt: { gte: timeThreshold },
    },
  });

  // Alert thresholds
  const isSuspicious = failedAttempts > 10 || successfulAccesses > 500;

  return {
    userId,
    timeWindowMinutes,
    failedAttempts,
    successfulAccesses,
    isSuspicious,
    risk: isSuspicious ? "HIGH" : failedAttempts > 5 ? "MEDIUM" : "LOW",
  };
};

/**
 * Get cross-user access attempts (CRITICAL SECURITY MONITORING)
 */
export const detectCrossUserAccessAttempts = async (limit: number = 50) => {
  return await prisma.auditLog.findMany({
    where: {
      status: "failure",
      details: {
        contains: "Unauthorized",
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
};
