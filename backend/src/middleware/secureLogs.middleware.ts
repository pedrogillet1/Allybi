import type { Request, Response, NextFunction } from "express";
import { redactObjectDeep } from "../services/security/redact.service";

/**
 * Prevents accidental plaintext logging of request bodies containing sensitive data.
 * Place this early in the middleware chain, before controllers.
 */
export function secureLogsMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const originalJson = _res.json.bind(_res);

  // Intercept res.json to redact sensitive fields from logs (not the actual response)
  // The response itself is NOT modified — only log output is redacted.
  if (req.app.locals.logger) {
    req.app.locals.logger.info(
      { body: redactObjectDeep(req.body), path: req.path },
      "request",
    );
  }

  next();
}
