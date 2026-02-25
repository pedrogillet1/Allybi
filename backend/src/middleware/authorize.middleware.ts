import type { NextFunction, Request, Response } from "express";
import { rbacService } from "../platform/security/auth/rbac.service";
import type { Action, Resource } from "../platform/security/auth/rbac.types";

type RequestWithUser = Request & {
  user?: {
    id?: string;
    role?: string;
    roles?: string[];
  };
};

function resolveActionFromMethod(method: string): Action {
  const normalized = String(method || "")
    .trim()
    .toUpperCase();
  if (normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS")
    return "read";
  if (normalized === "DELETE") return "delete";
  return "write";
}

function resolveRoles(req: RequestWithUser): string[] {
  const fromRoles = Array.isArray(req.user?.roles) ? req.user?.roles : [];
  const fromRole = typeof req.user?.role === "string" ? [req.user.role] : [];
  const combined = [...fromRoles, ...fromRole]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return combined.length ? [...new Set(combined)] : ["user"];
}

export function authorize(resource: Resource, action: Action) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const request = req as RequestWithUser;
    const userId = String(request.user?.id || "").trim();
    if (!userId) {
      res.status(401).json({
        ok: false,
        error: { code: "AUTH_REQUIRED", message: "Authentication required." },
      });
      return;
    }

    const roles = resolveRoles(request);
    const allowed = rbacService.canAccess(roles, resource, action);
    if (!allowed) {
      res.status(403).json({
        ok: false,
        error: {
          code: "AUTHZ_FORBIDDEN",
          message: "Forbidden for current role.",
          details: {
            resource,
            action,
            roles,
          },
        },
      });
      return;
    }

    next();
  };
}

export function authorizeByMethod(resource: Resource) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const action = resolveActionFromMethod(req.method);
    return authorize(resource, action)(req, res, next);
  };
}
