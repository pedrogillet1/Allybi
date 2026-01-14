import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Correlation ID Middleware
 *
 * Adds a unique correlation ID to each request for distributed tracing
 * - Accepts x-request-id if provided by client
 * - Generates UUID if not present
 * - Attaches to req.correlationId
 * - Returns in response header X-Request-ID
 */

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Accept x-request-id from client or generate new UUID
  const correlationId = req.headers['x-request-id'] as string || randomUUID();

  // Attach to request object
  req.correlationId = correlationId;

  // Return in response header
  res.setHeader('X-Request-ID', correlationId);

  next();
};
