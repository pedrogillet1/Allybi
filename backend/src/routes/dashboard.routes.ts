/**
 * Dashboard Routes
 *
 * API endpoints for admin monitoring dashboard
 * All routes are protected by admin authentication
 */

import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { isAdmin } from '../middleware/admin.middleware';

const router = Router();

/**
 * All dashboard routes require:
 * 1. Authentication (valid JWT token)
 * 2. Admin privileges
 */

// Overview metrics
router.get(
  '/overview',
  authenticateToken,
  isAdmin,
  dashboardController.getOverview
);

// Intent analysis metrics
router.get(
  '/intent-analysis',
  authenticateToken,
  isAdmin,
  dashboardController.getIntentAnalysis
);

// Retrieval performance metrics
router.get(
  '/retrieval',
  authenticateToken,
  isAdmin,
  dashboardController.getRetrieval
);

// Error monitoring metrics
router.get(
  '/errors',
  authenticateToken,
  isAdmin,
  dashboardController.getErrors
);

// User activity metrics
router.get(
  '/users',
  authenticateToken,
  isAdmin,
  dashboardController.getUsers
);

// Database and storage metrics
router.get(
  '/database',
  authenticateToken,
  isAdmin,
  dashboardController.getDatabase
);

export default router;
