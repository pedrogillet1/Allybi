import type { Action, Resource, Role, RolePolicyMatrix } from "./rbac.types";

const allActions: Action[] = ["read", "write", "delete", "connect", "manage"];
const allResources: Resource[] = [
  "chat",
  "documents",
  "editing",
  "integrations",
  "telemetry",
  "admin",
];

function actions(...values: Action[]): Action[] {
  return [...new Set(values)];
}

export const ROLE_POLICY_MATRIX: RolePolicyMatrix = {
  admin: {
    chat: allActions,
    documents: allActions,
    editing: allActions,
    integrations: allActions,
    telemetry: allActions,
    admin: allActions,
  },
  user: {
    chat: actions("read", "write", "delete"),
    documents: actions("read", "write", "delete"),
    editing: actions("read", "write"),
    integrations: actions("read", "write", "connect"),
    telemetry: actions("read", "write"),
    admin: [],
  },
  analyst: {
    chat: actions("read", "write"),
    documents: actions("read", "write"),
    editing: actions("read"),
    integrations: actions("read", "connect"),
    telemetry: actions("read", "write"),
    admin: [],
  },
  editor: {
    chat: actions("read", "write"),
    documents: actions("read", "write"),
    editing: actions("read", "write"),
    integrations: actions("read"),
    telemetry: actions("read"),
    admin: [],
  },
  viewer: {
    chat: actions("read"),
    documents: actions("read"),
    editing: [],
    integrations: actions("read"),
    telemetry: [],
    admin: [],
  },
  service: {
    chat: actions("read", "write"),
    documents: actions("read", "write"),
    editing: actions("read", "write"),
    integrations: actions("read", "write", "connect"),
    telemetry: actions("read", "write"),
    admin: [],
  },
};

function assertPolicyCompleteness(): void {
  for (const role of Object.keys(ROLE_POLICY_MATRIX) as Role[]) {
    for (const resource of allResources) {
      if (!Array.isArray(ROLE_POLICY_MATRIX[role][resource])) {
        throw new Error(
          `RBAC policy missing resource '${resource}' for role '${role}'.`,
        );
      }
    }
  }
}

assertPolicyCompleteness();
