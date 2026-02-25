import { ROLE_POLICY_MATRIX } from "./rbac.policy";
import type { Action, Resource, Role } from "./rbac.types";

function normalizeRole(value: string): Role {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  if (
    role === "admin" ||
    role === "analyst" ||
    role === "editor" ||
    role === "viewer" ||
    role === "service" ||
    role === "user"
  ) {
    return role;
  }
  return "user";
}

export class RbacService {
  private normalizeRoles(input: unknown): Role[] {
    if (Array.isArray(input)) {
      const mapped = input.map((role) => normalizeRole(String(role)));
      return [...new Set(mapped)];
    }
    const single = normalizeRole(String(input || ""));
    return [single];
  }

  canAccess(rolesInput: unknown, resource: Resource, action: Action): boolean {
    const roles = this.normalizeRoles(rolesInput);
    return roles.some((role) =>
      ROLE_POLICY_MATRIX[role][resource].includes(action),
    );
  }
}

export const rbacService = new RbacService();
