import { describe, expect, test } from "@jest/globals";

import { GovernanceRuntimePolicyService } from "./governanceRuntimePolicy.service";

describe("GovernanceRuntimePolicyService", () => {
  test("allows standard viewer chat for member role", () => {
    const service = new GovernanceRuntimePolicyService();
    const decision = service.evaluate({
      role: "member",
      action: "viewer_chat_query",
    });
    expect(decision.allowed).toBe(true);
  });

  test("blocks privileged secret rotation for non-admin", () => {
    const service = new GovernanceRuntimePolicyService();
    const decision = service.evaluate({
      role: "member",
      action: "rotate_secret",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blocks.length).toBeGreaterThan(0);
  });

  test("blocks user erasure when legal hold is active", () => {
    const service = new GovernanceRuntimePolicyService();
    const decision = service.evaluate({
      role: "admin",
      action: "viewer_edit_apply",
      legalHold: true,
      userErasureRequested: true,
    });
    expect(decision.allowed).toBe(false);
  });
});
