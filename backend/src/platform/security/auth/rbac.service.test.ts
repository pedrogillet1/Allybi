import { rbacService } from "./rbac.service";

describe("rbacService", () => {
  it("allows admin to manage admin resource", () => {
    expect(rbacService.canAccess(["admin"], "admin", "manage")).toBe(true);
  });

  it("denies viewer from editing write actions", () => {
    expect(rbacService.canAccess(["viewer"], "editing", "write")).toBe(false);
  });

  it("allows default user role for chat write", () => {
    expect(rbacService.canAccess(["user"], "chat", "write")).toBe(true);
  });

  it("falls back unknown roles to user semantics", () => {
    expect(rbacService.canAccess(["mystery-role"], "chat", "write")).toBe(true);
  });
});
