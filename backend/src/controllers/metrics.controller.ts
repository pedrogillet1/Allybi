import { Request, Response } from 'express';
import { pptxMetrics } from '../services/pptxPreviewMetrics.service';
import { signedUrlCache } from '../services/pptxSignedUrlCache.service';

/**
 * Get PPTX Preview Metrics
 * Protected endpoint - should be behind authentication or admin flag in production
 */
export const getPPTXMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const format = req.query.format as string || 'json';

    if (format === 'prometheus') {
      // Return Prometheus format
      const metrics = pptxMetrics.getMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.status(200).send(metrics);
    } else {
      // Return JSON format
      const metrics = pptxMetrics.getMetricsJSON();
      const cacheStats = signedUrlCache.getStats();

      res.status(200).json({
        ...metrics,
        cache: cacheStats,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[METRICS] Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};
