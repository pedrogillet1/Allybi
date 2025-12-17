/**
 * Service Tracer Infrastructure
 * Tracks which services and methods are called during each request
 *
 * Usage:
 * 1. Wrap services with traceService()
 * 2. Use requestContext.run() in controllers
 * 3. Query traceLog to see what was called
 *
 * @version 1.0.0
 */

import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// TYPES
// ============================================================================

export interface TraceEntry {
  requestId: string | undefined;
  service: string;
  method: string;
  timestamp: number;
  duration?: number;
  args?: any[];
  error?: string;
}

export interface RequestContext {
  requestId: string;
  answerType?: string;
  userId?: string;
  query?: string;
  startTime?: number;
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Global trace log - stores all service calls
 * In production, you might want to:
 * - Limit size (circular buffer)
 * - Send to external monitoring (Datadog, etc.)
 * - Filter by environment (only trace in dev/staging)
 */
export const traceLog: TraceEntry[] = [];

const MAX_TRACE_SIZE = 10000;

/**
 * AsyncLocalStorage for request context
 * Allows us to track which request triggered which service calls
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get current request ID from async context
 */
export function getCurrentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/**
 * Get current request context
 */
export function getCurrentContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Add a trace entry (with size limit)
 */
function addTrace(entry: TraceEntry) {
  traceLog.push(entry);
  if (traceLog.length > MAX_TRACE_SIZE) {
    traceLog.shift(); // Remove oldest
  }
}

/**
 * Wrap a service instance with tracing proxy
 *
 * @param serviceName - Name of the service (e.g., "KodaAnswerEngine")
 * @param instance - Service instance to wrap
 * @returns Proxied instance that logs all method calls
 *
 * @example
 * const answerEngine = traceService('KodaAnswerEngine', new KodaAnswerEngine());
 */
export function traceService<T extends object>(
  serviceName: string,
  instance: T
): T {
  // In production, you might want to disable tracing
  if (process.env.DISABLE_TRACING === 'true') {
    return instance;
  }

  return new Proxy(instance, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Don't wrap non-functions
      if (typeof value !== 'function') return value;

      // Don't wrap private methods (start with _)
      if (String(prop).startsWith('_')) return value;

      // Don't wrap common internal methods
      const skipMethods = [
        'constructor',
        'toString',
        'valueOf',
        'toJSON',
        Symbol.toStringTag,
        Symbol.iterator,
      ];
      if (skipMethods.includes(prop as any)) return value;

      // Return wrapped function
      return function (this: any, ...args: any[]) {
        const requestId = getCurrentRequestId();
        const startTime = Date.now();

        // Log entry
        const entry: TraceEntry = {
          requestId,
          service: serviceName,
          method: String(prop),
          timestamp: startTime,
        };

        try {
          // Call original function
          const result = (value as any).apply(target, args);

          // Handle async functions
          if (result instanceof Promise) {
            return result.then(
              (res) => {
                entry.duration = Date.now() - startTime;
                addTrace(entry);
                return res;
              },
              (err) => {
                entry.duration = Date.now() - startTime;
                entry.error = err?.message || String(err);
                addTrace(entry);
                throw err;
              }
            );
          }

          // Sync function
          entry.duration = Date.now() - startTime;
          addTrace(entry);
          return result;
        } catch (error: any) {
          entry.duration = Date.now() - startTime;
          entry.error = error?.message || String(error);
          addTrace(entry);
          throw error;
        }
      };
    },
  }) as T;
}

/**
 * Wrap a functional module (object with functions) with tracing
 */
export function traceModule<T extends Record<string, any>>(
  moduleName: string,
  moduleExports: T
): T {
  if (process.env.DISABLE_TRACING === 'true') {
    return moduleExports;
  }

  const traced: Record<string, any> = {};

  for (const [key, value] of Object.entries(moduleExports)) {
    if (typeof value === 'function') {
      traced[key] = function (...args: any[]) {
        const requestId = getCurrentRequestId();
        const startTime = Date.now();

        const entry: TraceEntry = {
          requestId,
          service: moduleName,
          method: key,
          timestamp: startTime,
        };

        try {
          const result = value(...args);

          if (result instanceof Promise) {
            return result.then(
              (res) => {
                entry.duration = Date.now() - startTime;
                addTrace(entry);
                return res;
              },
              (err) => {
                entry.duration = Date.now() - startTime;
                entry.error = err?.message || String(err);
                addTrace(entry);
                throw err;
              }
            );
          }

          entry.duration = Date.now() - startTime;
          addTrace(entry);
          return result;
        } catch (error: any) {
          entry.duration = Date.now() - startTime;
          entry.error = error?.message || String(error);
          addTrace(entry);
          throw error;
        }
      };
    } else {
      traced[key] = value;
    }
  }

  return traced as T;
}

/**
 * Reset trace log (useful for tests)
 */
export function resetTraceLog() {
  traceLog.length = 0;
}

/**
 * Get all services called for a specific request
 */
export function getServicesForRequest(requestId: string): Set<string> {
  const services = new Set<string>();
  for (const entry of traceLog) {
    if (entry.requestId === requestId) {
      services.add(entry.service);
    }
  }
  return services;
}

/**
 * Get all methods called for a specific service in a request
 */
export function getMethodsForService(
  requestId: string,
  serviceName: string
): string[] {
  return traceLog
    .filter(
      (entry) => entry.requestId === requestId && entry.service === serviceName
    )
    .map((entry) => entry.method);
}

/**
 * Get full trace for a request
 */
export function getTraceForRequest(requestId: string): TraceEntry[] {
  return traceLog.filter((entry) => entry.requestId === requestId);
}

/**
 * Get services never called across all requests
 */
export function getUnusedServices(allServiceNames: string[]): string[] {
  const usedServices = new Set(traceLog.map((entry) => entry.service));
  return allServiceNames.filter((name) => !usedServices.has(name));
}

/**
 * Print trace for a specific request (for debugging)
 */
export function printTrace(requestId: string) {
  const trace = getTraceForRequest(requestId);

  console.log(`\n======== TRACE FOR REQUEST: ${requestId} ========`);
  console.log(`Total calls: ${trace.length}`);
  console.log('');

  for (const entry of trace) {
    const duration = entry.duration !== undefined ? `${entry.duration}ms` : '?';
    const error = entry.error ? ` [ERROR: ${entry.error}]` : '';
    console.log(`  [${duration}] ${entry.service}.${entry.method}()${error}`);
  }

  console.log('================================================\n');
}

/**
 * Generate trace report for all requests
 */
export function generateTraceReport(): {
  totalRequests: number;
  totalCalls: number;
  serviceUsage: Map<string, number>;
  averageDuration: Map<string, number>;
} {
  const requestIds = new Set(
    traceLog.map((e) => e.requestId).filter(Boolean)
  );
  const serviceUsage = new Map<string, number>();
  const serviceDurations = new Map<string, number[]>();

  for (const entry of traceLog) {
    // Count service usage
    serviceUsage.set(
      entry.service,
      (serviceUsage.get(entry.service) || 0) + 1
    );

    // Track durations
    if (entry.duration !== undefined) {
      if (!serviceDurations.has(entry.service)) {
        serviceDurations.set(entry.service, []);
      }
      serviceDurations.get(entry.service)!.push(entry.duration);
    }
  }

  // Calculate average durations
  const averageDuration = new Map<string, number>();
  for (const [service, durations] of serviceDurations) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    averageDuration.set(service, Math.round(avg));
  }

  return {
    totalRequests: requestIds.size,
    totalCalls: traceLog.length,
    serviceUsage,
    averageDuration,
  };
}

/**
 * Print full trace report
 */
export function printTraceReport() {
  const report = generateTraceReport();

  console.log('\n======== SERVICE TRACE REPORT ========');
  console.log(`Total Requests: ${report.totalRequests}`);
  console.log(`Total Calls: ${report.totalCalls}`);
  console.log('');
  console.log('Service Usage:');

  const sortedServices = [...report.serviceUsage.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  for (const [service, count] of sortedServices) {
    const avgDuration = report.averageDuration.get(service);
    const durationStr = avgDuration ? ` (avg ${avgDuration}ms)` : '';
    console.log(`  ${service}: ${count} calls${durationStr}`);
  }

  console.log('==========================================\n');
}

/**
 * Get trace summary for a request
 */
export function getTraceSummary(requestId: string): {
  services: string[];
  totalDuration: number;
  callCount: number;
} {
  const trace = getTraceForRequest(requestId);
  const services = [...new Set(trace.map((t) => t.service))];
  const totalDuration = trace.reduce((sum, t) => sum + (t.duration || 0), 0);

  return {
    services,
    totalDuration,
    callCount: trace.length,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  traceLog,
  requestContext,
  getCurrentRequestId,
  getCurrentContext,
  traceService,
  traceModule,
  resetTraceLog,
  getServicesForRequest,
  getMethodsForService,
  getTraceForRequest,
  getUnusedServices,
  printTrace,
  generateTraceReport,
  printTraceReport,
  getTraceSummary,
};
