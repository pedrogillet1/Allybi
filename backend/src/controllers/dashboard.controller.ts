/**
 * Dashboard Controller
 *
 * Handles admin dashboard API endpoints for telemetry and monitoring
 * All endpoints require admin authentication
 */

import { Request, Response } from 'express';
import * as telemetryService from '../services/telemetry.service';

/**
 * Get system overview data
 * GET /api/dashboard/overview
 */
export const getOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 [DASHBOARD] Fetching overview data...');
    const data = await telemetryService.getOverviewData();

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('❌ [DASHBOARD] Error fetching overview:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch overview data',
    });
  }
};

/**
 * Get intent analysis data
 * GET /api/dashboard/intent-analysis
 */
export const getIntentAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 [DASHBOARD] Fetching intent analysis data...');
    const data = await telemetryService.getIntentAnalysisData();

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('❌ [DASHBOARD] Error fetching intent analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch intent analysis data',
    });
  }
};

/**
 * Get retrieval performance data
 * GET /api/dashboard/retrieval
 */
export const getRetrieval = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 [DASHBOARD] Fetching retrieval data...');
    const data = await telemetryService.getRetrievalData();

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('❌ [DASHBOARD] Error fetching retrieval data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch retrieval data',
    });
  }
};

/**
 * Get errors and monitoring data
 * GET /api/dashboard/errors
 */
export const getErrors = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 [DASHBOARD] Fetching errors data...');
    const data = await telemetryService.getErrorsData();

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('❌ [DASHBOARD] Error fetching errors data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch errors data',
    });
  }
};

/**
 * Get user activity and engagement data
 * GET /api/dashboard/users
 */
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 [DASHBOARD] Fetching users data...');
    const data = await telemetryService.getUsersData();

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('❌ [DASHBOARD] Error fetching users data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch users data',
    });
  }
};

/**
 * Get database and storage data
 * GET /api/dashboard/database
 */
export const getDatabase = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 [DASHBOARD] Fetching database data...');
    const data = await telemetryService.getDatabaseData();

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('❌ [DASHBOARD] Error fetching database data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch database data',
    });
  }
};

export default {
  getOverview,
  getIntentAnalysis,
  getRetrieval,
  getErrors,
  getUsers,
  getDatabase,
};
