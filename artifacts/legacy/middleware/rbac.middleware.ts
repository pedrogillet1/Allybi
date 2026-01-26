import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { auditLogService, AuditAction, AuditStatus } from '../services/securityStubs.service';

/**
 * Role-Based Access Control (RBAC) Middleware
 * Critical for multi-user law firms and banks
 */

export enum UserRole {
  USER = 'user',           // Regular user
  ADMIN = 'admin',         // System administrator
  LAWYER = 'lawyer',       // Legal professional
  PARALEGAL = 'paralegal', // Legal assistant
  ACCOUNTANT = 'accountant', // Financial professional
}

export enum DocumentPermission {
  VIEWER = 'viewer',   // Can view document
  EDITOR = 'editor',   // Can edit document
  OWNER = 'owner',     // Full control
}

/**
 * Middleware to check if user has required role
 */
export const requireRole = (allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;

      if (!user) {
        await auditLogService.logFromRequest(
          req,
          AuditAction.PERMISSION_REVOKE,
          AuditStatus.FAILURE,
          undefined,
          { reason: 'No user found' }
        );
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!allowedRoles.includes(user.role as UserRole)) {
        await auditLogService.logFromRequest(
          req,
          AuditAction.PERMISSION_REVOKE,
          AuditStatus.FAILURE,
          undefined,
          { requiredRoles: allowedRoles, userRole: user.role }
        );
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }

      return next();
    } catch (error) {
      console.error('Error in requireRole middleware:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Middleware to check if user can access a document
 */
export const canAccessDocument = (requiredPermission: DocumentPermission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const documentId = req.params.id || req.params.documentId || req.body.documentId;

      if (!user || !documentId) {
        await auditLogService.logFromRequest(
          req,
          AuditAction.DOCUMENT_VIEW,
          AuditStatus.FAILURE,
          documentId,
          { reason: 'Missing user or document ID' }
        );
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if user owns the document
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { userId: true },
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Owner has full access
      if (document.userId === user.id) {
        return next();
      }

      // Check if document is shared with user
      const share = await prisma.documentShare.findUnique({
        where: {
          documentId_sharedWithId: {
            documentId,
            sharedWithId: user.id,
          },
        },
      });

      if (!share) {
        await auditLogService.logFromRequest(
          req,
          AuditAction.DOCUMENT_VIEW,
          AuditStatus.FAILURE,
          documentId,
          { reason: 'Document not shared with user' }
        );
        return res.status(403).json({ error: 'Forbidden: No access to this document' });
      }

      // Check if share has expired
      if (share.expiresAt && share.expiresAt < new Date()) {
        await auditLogService.logFromRequest(
          req,
          AuditAction.DOCUMENT_VIEW,
          AuditStatus.FAILURE,
          documentId,
          { reason: 'Share link expired' }
        );
        return res.status(403).json({ error: 'Forbidden: Share link expired' });
      }

      // Check permission level
      const hasPermission = checkPermissionLevel(share.permissionLevel, requiredPermission);
      if (!hasPermission) {
        await auditLogService.logFromRequest(
          req,
          AuditAction.DOCUMENT_VIEW,
          AuditStatus.FAILURE,
          documentId,
          { requiredPermission, userPermission: share.permissionLevel }
        );
        return res.status(403).json({
          error: `Forbidden: Need ${requiredPermission} permission, but have ${share.permissionLevel}`
        });
      }

      // Attach share info to request for downstream use
      (req as any).documentShare = share;
      next();
    } catch (error) {
      console.error('Error in canAccessDocument middleware:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Helper to check if permission level meets requirement
 */
function checkPermissionLevel(userLevel: string, requiredLevel: DocumentPermission): boolean {
  const levels = {
    [DocumentPermission.VIEWER]: 1,
    [DocumentPermission.EDITOR]: 2,
    [DocumentPermission.OWNER]: 3,
  };

  return (levels[userLevel as DocumentPermission] || 0) >= (levels[requiredLevel] || 0);
}

/**
 * Middleware to check if user can perform admin actions
 */
export const requireAdmin = requireRole([UserRole.ADMIN]);

/**
 * Middleware to check download permissions
 */
export const canDownloadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const documentId = req.params.id || req.params.documentId;

    if (!user || !documentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user owns the document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { userId: true },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Owner can always download
    if (document.userId === user.id) {
      return next();
    }

    // Check share permissions
    const share = await prisma.documentShare.findUnique({
      where: {
        documentId_sharedWithId: {
          documentId,
          sharedWithId: user.id,
        },
      },
    });

    if (!share || !share.canDownload) {
      await auditLogService.logFromRequest(
        req,
        AuditAction.DOCUMENT_DOWNLOAD,
        AuditStatus.FAILURE,
        documentId,
        { reason: 'Download not permitted' }
      );
      return res.status(403).json({ error: 'Forbidden: Download not permitted' });
    }

    next();
  } catch (error) {
    console.error('Error in canDownloadDocument middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to check delete permissions
 */
export const canDeleteDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const documentId = req.params.id || req.params.documentId;

    if (!user || !documentId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user owns the document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { userId: true },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only owner can delete (unless explicitly granted permission)
    if (document.userId === user.id) {
      return next();
    }

    const share = await prisma.documentShare.findUnique({
      where: {
        documentId_sharedWithId: {
          documentId,
          sharedWithId: user.id,
        },
      },
    });

    if (!share || !share.canDelete) {
      await auditLogService.logFromRequest(
        req,
        AuditAction.DOCUMENT_DELETE,
        AuditStatus.FAILURE,
        documentId,
        { reason: 'Delete not permitted' }
      );
      return res.status(403).json({ error: 'Forbidden: Only document owner can delete' });
    }

    next();
  } catch (error) {
    console.error('Error in canDeleteDocument middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
