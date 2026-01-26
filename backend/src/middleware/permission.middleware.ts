import { Request, Response, NextFunction } from 'express';
import { rbacService } from '../services/securityStubs.service';
import { securityMonitoringService, SecurityEventType, ThreatLevel } from '../services/securityStubs.service';

/**
 * Permission-based middleware for route protection
 *
 * Usage:
 * router.get('/documents', authenticate, requirePermission('documents', 'read'), handler);
 * router.post('/documents', authenticate, requirePermission('documents', 'create'), handler);
 */

/**
 * Check if user has a specific permission
 */
export const requirePermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasPermission = await rbacService.hasPermission(req.user.id, {
        resource,
        action,
      });

      if (!hasPermission) {
        // Log unauthorized access attempt
        await securityMonitoringService.recordSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          threatLevel: ThreatLevel.MEDIUM,
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          description: `Attempted to access ${resource}:${action} without permission`,
          document_metadata: {
            resource,
            action,
            path: req.path,
            method: req.method,
          },
        });

        return res.status(403).json({
          error: 'Permission denied',
          message: `You don't have permission to ${action} ${resource}`,
          required: {
            resource,
            action,
          },
        });
      }

      return next();
    } catch (error) {
      console.error('Error checking permission:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check if user has ALL of the specified permissions (AND logic)
 */
export const requireAllPermissions = (permissions: Array<{ resource: string; action: string }>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasAll = await rbacService.hasAllPermissions(req.user.id, permissions);

      if (!hasAll) {
        await securityMonitoringService.recordSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          threatLevel: ThreatLevel.MEDIUM,
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          description: `Attempted to access endpoint requiring multiple permissions`,
          document_metadata: {
            requiredPermissions: permissions,
            path: req.path,
            method: req.method,
          },
        });

        return res.status(403).json({
          error: 'Permission denied',
          message: 'You don\'t have all required permissions',
          required: permissions,
        });
      }

      return next();
    } catch (error) {
      console.error('Error checking permissions:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check if user has ANY of the specified permissions (OR logic)
 */
export const requireAnyPermission = (permissions: Array<{ resource: string; action: string }>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasAny = await rbacService.hasAnyPermission(req.user.id, permissions);

      if (!hasAny) {
        await securityMonitoringService.recordSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          threatLevel: ThreatLevel.MEDIUM,
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          description: `Attempted to access endpoint without any required permissions`,
          document_metadata: {
            requiredPermissions: permissions,
            path: req.path,
            method: req.method,
          },
        });

        return res.status(403).json({
          error: 'Permission denied',
          message: 'You don\'t have any of the required permissions',
          required: permissions,
        });
      }

      return next();
    } catch (error) {
      console.error('Error checking permissions:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check if user has a specific role
 */
export const requireRole = (roleName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userRoles = await rbacService.getUserRoles(req.user.id);
      const hasRole = userRoles.some(ur => ur.role.name === roleName);

      if (!hasRole) {
        await securityMonitoringService.recordSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          threatLevel: ThreatLevel.MEDIUM,
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          description: `Attempted to access endpoint requiring role: ${roleName}`,
          document_metadata: {
            requiredRole: roleName,
            userRoles: userRoles.map(ur => ur.role.name),
            path: req.path,
            method: req.method,
          },
        });

        return res.status(403).json({
          error: 'Permission denied',
          message: `This endpoint requires the ${roleName} role`,
          required: {
            role: roleName,
          },
        });
      }

      return next();
    } catch (error) {
      console.error('Error checking role:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check if user has ANY of the specified roles (OR logic)
 */
export const requireAnyRole = (roleNames: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userRoles = await rbacService.getUserRoles(req.user.id);
      const hasAnyRole = userRoles.some(ur => roleNames.includes(ur.role.name));

      if (!hasAnyRole) {
        await securityMonitoringService.recordSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
          threatLevel: ThreatLevel.MEDIUM,
          userId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          description: `Attempted to access endpoint without required roles`,
          document_metadata: {
            requiredRoles: roleNames,
            userRoles: userRoles.map(ur => ur.role.name),
            path: req.path,
            method: req.method,
          },
        });

        return res.status(403).json({
          error: 'Permission denied',
          message: `This endpoint requires one of the following roles: ${roleNames.join(', ')}`,
          required: {
            roles: roleNames,
          },
        });
      }

      return next();
    } catch (error) {
      console.error('Error checking roles:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Attach user permissions to request object for later use
 */
export const attachUserPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      const permissions = await rbacService.getUserPermissions(req.user.id);
      (req.user as any).permissions = Array.from(permissions);
    }
    next();
  } catch (error) {
    console.error('Error attaching permissions:', error);
    next();
  }
};

export default {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireRole,
  requireAnyRole,
  attachUserPermissions,
};
