import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requirePermission, requireRole } from '../middleware/permission.middleware';
import { rbacService } from '../services/securityStubs.service';

const router = Router();

// All RBAC routes require authentication
router.use(authenticateToken);

/**
 * GET /api/rbac/roles
 * Get all available roles
 */
router.get('/roles', requirePermission('settings', 'read'), async (req: Request, res: Response) => {
  try {
    const roles = await rbacService.getAllRoles();
    return res.json({ roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/**
 * GET /api/rbac/permissions
 * Get all available permissions
 */
router.get('/permissions', requirePermission('settings', 'read'), async (req: Request, res: Response) => {
  try {
    const permissions = await rbacService.getAllPermissions();
    return res.json({ permissions });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

/**
 * GET /api/rbac/my-roles
 * Get current user's roles
 */
router.get('/my-roles', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const roles = await rbacService.getUserRoles(req.user.id);
    return res.json({ roles });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return res.status(500).json({ error: 'Failed to fetch user roles' });
  }
});

/**
 * GET /api/rbac/my-permissions
 * Get current user's permissions
 */
router.get('/my-permissions', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const permissions = await rbacService.getUserPermissions(req.user.id);
    return res.json({ permissions: Array.from(permissions) });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return res.status(500).json({ error: 'Failed to fetch user permissions' });
  }
});

/**
 * GET /api/rbac/users/:userId/roles
 * Get roles for a specific user (admin only)
 */
router.get(
  '/users/:userId/roles',
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const roles = await rbacService.getUserRoles(userId);
      return res.json({ userId, roles });
    } catch (error) {
      console.error('Error fetching user roles:', error);
      return res.status(500).json({ error: 'Failed to fetch user roles' });
    }
  }
);

/**
 * POST /api/rbac/users/:userId/roles
 * Assign a role to a user (admin only)
 */
router.post(
  '/users/:userId/roles',
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { userId } = req.params;
      const { roleName, expiresAt } = req.body;

      if (!roleName) {
        return res.status(400).json({ error: 'roleName is required' });
      }

      const expiration = expiresAt ? new Date(expiresAt) : undefined;
      const success = await rbacService.assignRole(userId, roleName, req.user.id, expiration);

      if (!success) {
        return res.status(400).json({ error: 'Failed to assign role' });
      }

      return res.json({
        message: 'Role assigned successfully',
        userId,
        roleName,
        expiresAt: expiration,
      });
    } catch (error) {
      console.error('Error assigning role:', error);
      return res.status(500).json({ error: 'Failed to assign role' });
    }
  }
);

/**
 * DELETE /api/rbac/users/:userId/roles/:roleName
 * Revoke a role from a user (admin only)
 */
router.delete(
  '/users/:userId/roles/:roleName',
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { userId, roleName } = req.params;
      const success = await rbacService.revokeRole(userId, roleName, req.user.id);

      if (!success) {
        return res.status(400).json({ error: 'Failed to revoke role' });
      }

      return res.json({
        message: 'Role revoked successfully',
        userId,
        roleName,
      });
    } catch (error) {
      console.error('Error revoking role:', error);
      return res.status(500).json({ error: 'Failed to revoke role' });
    }
  }
);

/**
 * POST /api/rbac/roles
 * Create a custom role (admin only)
 */
router.post('/roles', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, description, permissions } = req.body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        error: 'name and permissions array are required',
      });
    }

    const role = await rbacService.createRole(name, description || '', permissions, req.user.id);

    return res.status(201).json({
      message: 'Role created successfully',
      role,
    });
  } catch (error: any) {
    console.error('Error creating role:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Role name already exists' });
    }
    return res.status(500).json({ error: 'Failed to create role' });
  }
});

/**
 * DELETE /api/rbac/roles/:roleId
 * Delete a custom role (admin only)
 */
router.delete('/roles/:roleId', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { roleId } = req.params;
    const success = await rbacService.deleteRole(roleId, req.user.id);

    if (!success) {
      return res.status(400).json({ error: 'Failed to delete role (may be a system role)' });
    }

    return res.json({
      message: 'Role deleted successfully',
      roleId,
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    return res.status(500).json({ error: 'Failed to delete role' });
  }
});

/**
 * POST /api/rbac/check-permission
 * Check if user has a specific permission
 */
router.post('/check-permission', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { resource, action } = req.body;

    if (!resource || !action) {
      return res.status(400).json({ error: 'resource and action are required' });
    }

    const hasPermission = await rbacService.hasPermission(req.user.id, { resource, action });

    return res.json({
      hasPermission,
      permission: { resource, action },
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    return res.status(500).json({ error: 'Failed to check permission' });
  }
});

/**
 * POST /api/rbac/initialize
 * Initialize system roles (admin only, run once)
 */
router.post('/initialize', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await rbacService.initializeSystemRoles();
    return res.json({ message: 'System roles initialized successfully' });
  } catch (error) {
    console.error('Error initializing roles:', error);
    return res.status(500).json({ error: 'Failed to initialize system roles' });
  }
});

/**
 * POST /api/rbac/cache/clear
 * Clear permission cache (admin only)
 */
router.post('/cache/clear', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    rbacService.clearAllCaches();
    return res.json({ message: 'Permission cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;
