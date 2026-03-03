import { describe, expect, test } from "@jest/globals";

import { AccessControlPolicyService } from "./accessControlPolicy.service";
import { DataRetentionDeletionPolicyService } from "./dataRetentionDeletionPolicy.service";
import { IncidentResponsePolicyService } from "./incidentResponsePolicy.service";
import { ModelReleasePolicyService } from "./modelReleasePolicy.service";
import { PolicyExceptionsPolicyService } from "./policyExceptionsPolicy.service";
import { SecretsRotationPolicyService } from "./secretsRotationPolicy.service";

describe("governance policy services", () => {
  test("access control denies privileged action for non-admin", () => {
    const service = new AccessControlPolicyService();
    const decision = service.decide({
      role: "member",
      action: "rotate_secret",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe("deny");
  });

  test("incident response pages immediately for p0 security", () => {
    const service = new IncidentResponsePolicyService();
    const decision = service.decide({ category: "security", severity: "critical" });
    expect(decision.action).toBe("page_immediately");
    expect(decision.slaMinutes).toBe(5);
  });

  test("retention policy respects legal hold", () => {
    const service = new DataRetentionDeletionPolicyService();
    const decision = service.decide({ legalHold: true });
    expect(decision.action).toBe("retain");
  });

  test("secrets rotation policy triggers rotate_now for stale critical key", () => {
    const service = new SecretsRotationPolicyService();
    const decision = service.decide({ keyTier: "critical", keyAgeDays: 45 });
    expect(decision.action).toBe("rotate_now");
  });

  test("model release policy blocks on severity1 failures", () => {
    const service = new ModelReleasePolicyService();
    const decision = service.decide({ severity1Failures: 1, regressionPassRate: 0.99 });
    expect(decision.approved).toBe(false);
    expect(decision.action).toBe("block_release");
  });

  test("policy exceptions policy denies unapproved exceptions", () => {
    const service = new PolicyExceptionsPolicyService();
    const decision = service.decide({ approved: false, exceptionExpired: false });
    expect(decision.action).toBe("deny_exception");
  });
});
