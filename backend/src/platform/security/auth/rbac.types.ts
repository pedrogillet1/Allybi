export type Role =
  | "admin"
  | "analyst"
  | "editor"
  | "viewer"
  | "user"
  | "service";

export type Resource =
  | "chat"
  | "documents"
  | "editing"
  | "integrations"
  | "telemetry"
  | "admin";

export type Action = "read" | "write" | "delete" | "connect" | "manage";

export type RolePolicyMatrix = Record<Role, Record<Resource, Action[]>>;
