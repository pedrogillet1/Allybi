/**
 * Telemetry Logger Service
 *
 * Logs telemetry data to database tables:
 * - IntentClassificationLog: Intent detection and classification metrics
 * - ErrorLog: Error tracking and debugging
 * - SystemHealthMetric: System health and performance metrics
 */

import prisma from '../config/database';

// ============================================================================
// Types
// ============================================================================

export interface IntentClassificationLogData {
  userId?: string;
  conversationId?: string;
  messageId?: string;
  userQuery: string;
  detectedIntent: string;
  confidence: number;
  fallbackTriggered?: boolean;
  multiIntent?: boolean;
  language?: string;
  responseTime?: number;
  wasCorrect?: boolean;
  userFeedback?: string;
}

export interface ErrorLogData {
  userId?: string;
  service: string;
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  severity?: 'error' | 'warning' | 'critical';
  conversationId?: string;
  requestPath?: string;
  httpMethod?: string;
  statusCode?: number;
  metadata?: any;
}

export interface SystemHealthMetricData {
  metricType: string;
  metricName: string;
  value: number;
  unit?: string;
  status?: 'healthy' | 'warning' | 'critical';
  threshold?: number;
  metadata?: any;
}

// ============================================================================
// Telemetry Logger Service
// ============================================================================

class TelemetryLoggerService {
  /**
   * Log intent classification event
   */
  async logIntentClassification(data: IntentClassificationLogData): Promise<void> {
    try {
      await prisma.intentClassificationLog.create({
        data: {
          userId: data.userId,
          conversationId: data.conversationId,
          messageId: data.messageId,
          userQuery: data.userQuery,
          detectedIntent: data.detectedIntent,
          confidence: data.confidence,
          fallbackTriggered: data.fallbackTriggered ?? false,
          multiIntent: data.multiIntent ?? false,
          language: data.language || 'en',
          responseTime: data.responseTime,
          wasCorrect: data.wasCorrect,
          userFeedback: data.userFeedback,
        },
      });
    } catch (error) {
      // Don't fail the main operation if telemetry logging fails
      console.error('[TelemetryLogger] Failed to log intent classification:', error);
    }
  }

  /**
   * Log error event
   */
  async logError(data: ErrorLogData): Promise<void> {
    try {
      await prisma.errorLog.create({
        data: {
          userId: data.userId,
          service: data.service,
          errorType: data.errorType,
          errorMessage: data.errorMessage,
          errorStack: data.errorStack,
          severity: data.severity || 'error',
          conversationId: data.conversationId,
          requestPath: data.requestPath,
          httpMethod: data.httpMethod,
          statusCode: data.statusCode,
          metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
        },
      });
    } catch (error) {
      // Don't fail the main operation if telemetry logging fails
      console.error('[TelemetryLogger] Failed to log error:', error);
    }
  }

  /**
   * Log system health metric
   */
  async logSystemHealth(data: SystemHealthMetricData): Promise<void> {
    try {
      await prisma.systemHealthMetric.create({
        data: {
          metricType: data.metricType,
          metricName: data.metricName,
          value: data.value,
          unit: data.unit,
          status: data.status || 'healthy',
          threshold: data.threshold,
          metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
        },
      });
    } catch (error) {
      // Don't fail the main operation if telemetry logging fails
      console.error('[TelemetryLogger] Failed to log system health metric:', error);
    }
  }

  /**
   * Batch log intent classifications (for bulk operations)
   */
  async logIntentClassificationBatch(data: IntentClassificationLogData[]): Promise<void> {
    try {
      await prisma.intentClassificationLog.createMany({
        data: data.map(item => ({
          userId: item.userId,
          conversationId: item.conversationId,
          messageId: item.messageId,
          userQuery: item.userQuery,
          detectedIntent: item.detectedIntent,
          confidence: item.confidence,
          fallbackTriggered: item.fallbackTriggered ?? false,
          multiIntent: item.multiIntent ?? false,
          language: item.language || 'en',
          responseTime: item.responseTime,
          wasCorrect: item.wasCorrect,
          userFeedback: item.userFeedback,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      console.error('[TelemetryLogger] Failed to batch log intent classifications:', error);
    }
  }

  /**
   * Batch log errors (for bulk operations)
   */
  async logErrorBatch(data: ErrorLogData[]): Promise<void> {
    try {
      await prisma.errorLog.createMany({
        data: data.map(item => ({
          userId: item.userId,
          service: item.service,
          errorType: item.errorType,
          errorMessage: item.errorMessage,
          errorStack: item.errorStack,
          severity: item.severity || 'error',
          conversationId: item.conversationId,
          requestPath: item.requestPath,
          httpMethod: item.httpMethod,
          statusCode: item.statusCode,
          metadata: item.metadata ? JSON.parse(JSON.stringify(item.metadata)) : undefined,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      console.error('[TelemetryLogger] Failed to batch log errors:', error);
    }
  }
}

// Export singleton instance
const telemetryLogger = new TelemetryLoggerService();
export default telemetryLogger;
export { telemetryLogger };
