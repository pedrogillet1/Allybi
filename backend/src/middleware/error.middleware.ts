import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import multer from 'multer';
import telemetryLogger from '../services/telemetry.logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Extract user info if available
  const userId = (req as any).user?.id || (req as any).userId;

  if (err instanceof AppError) {
    // Log application errors to telemetry
    telemetryLogger.logError({
      userId,
      service: 'API',
      errorType: err.name || 'AppError',
      errorMessage: err.message,
      errorStack: err.stack,
      severity: err.statusCode >= 500 ? 'error' : 'warning',
      requestPath: req.path,
      httpMethod: req.method,
      statusCode: err.statusCode,
      metadata: {
        query: req.query,
        body: req.body,
      },
    }).catch(logErr => console.error('[ErrorMiddleware] Failed to log error:', logErr));

    return res.status(err.statusCode).json({
      error: err.message,
      status: err.statusCode,
    });
  }

  // Handle Multer errors (file upload errors)
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.message);

    telemetryLogger.logError({
      userId,
      service: 'FileUpload',
      errorType: 'MulterError',
      errorMessage: err.message,
      errorStack: err.stack,
      severity: 'warning',
      requestPath: req.path,
      httpMethod: req.method,
      statusCode: 400,
    }).catch(logErr => console.error('[ErrorMiddleware] Failed to log error:', logErr));

    return res.status(400).json({
      error: `Upload error: ${err.message}`,
      status: 400,
    });
  }

  // Handle file filter rejection errors (e.g., system files, unsupported types)
  if (err.message && (err.message.includes('System files not allowed') ||
                      err.message.includes('File type not supported') ||
                      err.message.includes('Unsupported file type'))) {
    console.error('File filter error:', err.message);

    telemetryLogger.logError({
      userId,
      service: 'FileUpload',
      errorType: 'FileFilterError',
      errorMessage: err.message,
      errorStack: err.stack,
      severity: 'warning',
      requestPath: req.path,
      httpMethod: req.method,
      statusCode: 400,
    }).catch(logErr => console.error('[ErrorMiddleware] Failed to log error:', logErr));

    return res.status(400).json({
      error: err.message,
      status: 400,
    });
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    telemetryLogger.logError({
      userId,
      service: 'Database',
      errorType: 'PrismaClientKnownRequestError',
      errorMessage: err.message,
      errorStack: err.stack,
      severity: 'error',
      requestPath: req.path,
      httpMethod: req.method,
      statusCode: 400,
    }).catch(logErr => console.error('[ErrorMiddleware] Failed to log error:', logErr));

    return res.status(400).json({
      error: 'Database operation failed',
      status: 400,
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    telemetryLogger.logError({
      userId,
      service: 'Validation',
      errorType: 'ValidationError',
      errorMessage: err.message,
      errorStack: err.stack,
      severity: 'warning',
      requestPath: req.path,
      httpMethod: req.method,
      statusCode: 400,
    }).catch(logErr => console.error('[ErrorMiddleware] Failed to log error:', logErr));

    return res.status(400).json({
      error: err.message,
      status: 400,
    });
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);

  telemetryLogger.logError({
    userId,
    service: 'API',
    errorType: err.name || 'UnexpectedError',
    errorMessage: err.message,
    errorStack: err.stack,
    severity: 'critical',
    requestPath: req.path,
    httpMethod: req.method,
    statusCode: 500,
    metadata: {
      query: req.query,
      body: req.body,
    },
  }).catch(logErr => console.error('[ErrorMiddleware] Failed to log error:', logErr));

  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  return res.status(500).json({
    error: message,
    status: 500,
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
