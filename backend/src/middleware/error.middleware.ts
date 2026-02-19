import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import multer from "multer";
import { logger } from "../infra/logger";
import { captureError } from "../config/sentry.config";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const userId = (req as any).user?.id || (req as any).userId;
  const meta = { userId, path: req.path, method: req.method };

  // ── AppError (known application errors) ──────────────────────────
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[API] ${err.name}: ${err.message}`, {
        ...meta,
        statusCode: err.statusCode,
      });
      captureError(err, meta);
    } else {
      logger.warn(`[API] ${err.name}: ${err.message}`, {
        ...meta,
        statusCode: err.statusCode,
      });
    }

    return res.status(err.statusCode).json({
      error: err.message,
      status: err.statusCode,
    });
  }

  // ── Multer errors (file upload) ──────────────────────────────────
  if (err instanceof multer.MulterError) {
    logger.warn(`[FileUpload] MulterError: ${err.message}`, meta);

    return res.status(400).json({
      error: `Upload error: ${err.message}`,
      status: 400,
    });
  }

  // ── File filter rejection ────────────────────────────────────────
  if (
    err.message &&
    (err.message.includes("System files not allowed") ||
      err.message.includes("File type not supported") ||
      err.message.includes("Unsupported file type"))
  ) {
    logger.warn(`[FileUpload] FileFilterError: ${err.message}`, meta);

    return res.status(400).json({
      error: err.message,
      status: 400,
    });
  }

  // ── Prisma errors ────────────────────────────────────────────────
  if (err.name === "PrismaClientKnownRequestError") {
    logger.error(`[Database] ${err.name}: ${err.message}`, meta);
    captureError(err, { ...meta, service: "Database" });

    return res.status(400).json({
      error: "Database operation failed",
      status: 400,
    });
  }

  // ── Validation errors ────────────────────────────────────────────
  if (err.name === "ValidationError") {
    logger.warn(`[Validation] ${err.message}`, meta);

    return res.status(400).json({
      error: err.message,
      status: 400,
    });
  }

  // ── Unexpected errors ────────────────────────────────────────────
  logger.error(`[API] Unexpected: ${err.message}`, {
    ...meta,
    errorType: err.name,
    stack: err.stack,
  });
  captureError(err, { ...meta, severity: "critical" });

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
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
