/**
 * Crash Diagnostics Middleware
 *
 * Logs detailed information to help diagnose server crashes:
 * - Memory usage per request
 * - Request timing
 * - Connection pool stats
 * - Error patterns
 *
 * This helps identify the REAL cause of crashes (not just symptoms)
 */

import { Request, Response, NextFunction } from 'express';
import geminiGateway from '../services/geminiGateway.service';

interface RequestStats {
  startTime: number;
  memoryBefore: NodeJS.MemoryUsage;
  requestCount: number;
}

class CrashDiagnostics {
  private requestCount: number = 0;
  private errorCount: number = 0;
  private requestStats: Map<string, RequestStats> = new Map();
  private startTime: number = Date.now();

  /**
   * Middleware to log request diagnostics
   */
  logRequest = (req: Request, res: Response, next: NextFunction) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Capture memory before request
    const memoryBefore = process.memoryUsage();
    const startTime = Date.now();

    this.requestCount++;

    // Store stats
    this.requestStats.set(requestId, {
      startTime,
      memoryBefore,
      requestCount: this.requestCount
    });

    console.log(`📊 [DIAGNOSTICS] Request #${this.requestCount} started:`, {
      method: req.method,
      path: req.path,
      requestId,
      memoryMB: {
        heapUsed: Math.round(memoryBefore.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryBefore.heapTotal / 1024 / 1024),
        rss: Math.round(memoryBefore.rss / 1024 / 1024)
      }
    });

    // Log response
    res.on('finish', () => {
      const stats = this.requestStats.get(requestId);
      if (!stats) return;

      const duration = Date.now() - stats.startTime;
      const memoryAfter = process.memoryUsage();
      const memoryDelta = {
        heapUsed: memoryAfter.heapUsed - stats.memoryBefore.heapUsed,
        heapTotal: memoryAfter.heapTotal - stats.memoryBefore.heapTotal,
        rss: memoryAfter.rss - stats.memoryBefore.rss
      };

      console.log(`📊 [DIAGNOSTICS] Request #${stats.requestCount} completed:`, {
        requestId,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        memoryDeltaMB: {
          heapUsed: Math.round(memoryDelta.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryDelta.heapTotal / 1024 / 1024),
          rss: Math.round(memoryDelta.rss / 1024 / 1024)
        },
        currentMemoryMB: {
          heapUsed: Math.round(memoryAfter.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryAfter.heapTotal / 1024 / 1024),
          rss: Math.round(memoryAfter.rss / 1024 / 1024)
        }
      });

      // Cleanup
      this.requestStats.delete(requestId);

      // Warning if memory is high
      const heapUsedMB = memoryAfter.heapUsed / 1024 / 1024;
      if (heapUsedMB > 1000) {
        // Over 1GB heap used
        console.warn(`⚠️ [DIAGNOSTICS] HIGH MEMORY USAGE: ${Math.round(heapUsedMB)}MB heap used`);
      }

      // Warning if request took too long
      if (duration > 30000) {
        // Over 30 seconds
        console.warn(`⚠️ [DIAGNOSTICS] SLOW REQUEST: ${duration}ms for ${req.path}`);
      }
    });

    next();
  };

  /**
   * Log error diagnostics
   */
  logError = (error: any, req: Request) => {
    this.errorCount++;

    console.error(`❌ [DIAGNOSTICS] Error #${this.errorCount}:`, {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorMessage: error?.message,
      errorCode: error?.code,
      errorType: error?.constructor?.name,
      path: req.path,
      method: req.method,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    });

    // Log stack trace for non-retryable errors
    if (error?.stack && !this.isRetryableError(error)) {
      console.error(
        `📚 [DIAGNOSTICS] Stack trace:`,
        error.stack.split('\n').slice(0, 10).join('\n')
      );
    }
  };

  /**
   * Check if error is retryable (expected) or fatal (unexpected)
   */
  private isRetryableError(error: any): boolean {
    const retryablePatterns = [
      'RESOURCE_EXHAUSTED',
      'UNAVAILABLE',
      'DEADLINE_EXCEEDED',
      '503',
      '429',
      'rate limit',
      'overload'
    ];

    const errorString = JSON.stringify(error).toLowerCase();
    return retryablePatterns.some((pattern) => errorString.includes(pattern.toLowerCase()));
  }

  /**
   * Log periodic health stats
   */
  logHealthStats = () => {
    const uptime = Date.now() - this.startTime;
    const memory = process.memoryUsage();
    const geminiStats = geminiGateway.getStats();

    console.log(`💚 [DIAGNOSTICS] Health check:`, {
      uptimeSeconds: Math.round(uptime / 1000),
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      errorRate:
        this.requestCount > 0
          ? `${((this.errorCount / this.requestCount) * 100).toFixed(2)}%`
          : '0%',
      activeRequests: this.requestStats.size,
      memoryMB: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024)
      },
      geminiStats: geminiStats
    });

    // Warning if error rate is high
    if (this.requestCount > 10 && this.errorCount / this.requestCount > 0.1) {
      console.warn(
        `⚠️ [DIAGNOSTICS] HIGH ERROR RATE: ${this.errorCount}/${this.requestCount} requests failed`
      );
    }

    // Warning if too many active requests
    if (this.requestStats.size > 20) {
      console.warn(
        `⚠️ [DIAGNOSTICS] HIGH ACTIVE REQUESTS: ${this.requestStats.size} requests in progress`
      );
    }
  };

  /**
   * Get current diagnostics summary
   */
  getSummary() {
    const uptime = Date.now() - this.startTime;
    const memory = process.memoryUsage();

    return {
      uptime: Math.round(uptime / 1000),
      requests: {
        total: this.requestCount,
        active: this.requestStats.size,
        errors: this.errorCount,
        errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
      },
      memory: {
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        rssMB: Math.round(memory.rss / 1024 / 1024)
      }
    };
  }
}

// Export singleton
export default new CrashDiagnostics();
