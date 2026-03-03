import { AccessControlPolicyService } from "./accessControlPolicy.service";
import { DataRetentionDeletionPolicyService } from "./dataRetentionDeletionPolicy.service";
import { IncidentResponsePolicyService } from "./incidentResponsePolicy.service";
import { ModelReleasePolicyService } from "./modelReleasePolicy.service";
import { PolicyExceptionsPolicyService } from "./policyExceptionsPolicy.service";
import { SecretsRotationPolicyService } from "./secretsRotationPolicy.service";

export type GovernanceRuntimePolicyInput = {
  role?: string;
  action?: string;
  legalHold?: boolean;
  userErasureRequested?: boolean;
  overrideRequested?: boolean;
  exceptionApproved?: boolean;
  exceptionExpired?: boolean;
  keyTier?: string;
  keyAgeDays?: number;
  incidentCategory?: string;
  incidentSeverity?: string;
  severity1Failures?: number;
  regressionPassRate?: number;
};

export type GovernanceRuntimePolicyDecision = {
  allowed: boolean;
  blocks: string[];
  accessAction: string;
  retentionAction: string;
  exceptionAction: string;
  secretsAction: string;
  incidentAction: string;
  modelReleaseAction: string;
};

const SENSITIVE_ACTIONS = new Set([
  "rotate_secret",
  "export_sensitive_data",
  "override_policy",
]);

export class GovernanceRuntimePolicyService {
  private readonly accessControl = new AccessControlPolicyService();
  private readonly incidentResponse = new IncidentResponsePolicyService();
  private readonly dataRetention = new DataRetentionDeletionPolicyService();
  private readonly secretsRotation = new SecretsRotationPolicyService();
  private readonly modelRelease = new ModelReleasePolicyService();
  private readonly policyExceptions = new PolicyExceptionsPolicyService();

  evaluate(
    input: GovernanceRuntimePolicyInput,
  ): GovernanceRuntimePolicyDecision {
    const action = String(input.action || "").trim().toLowerCase() || "viewer_chat_query";
    const role = String(input.role || "").trim().toLowerCase();
    const blocks: string[] = [];

    const access = this.accessControl.decide({ role, action });
    if (!access.allowed) {
      blocks.push(access.reasonCode || "access_denied");
    }

    const retention = this.dataRetention.decide({
      legalHold: input.legalHold === true,
      userErasureRequested: input.userErasureRequested === true,
    });
    if (
      input.userErasureRequested === true &&
      retention.action !== "delete_now"
    ) {
      blocks.push(retention.reasonCode || "retention_blocks_erasure");
    }

    const exceptions = this.policyExceptions.decide({
      approved: input.exceptionApproved === true,
      exceptionExpired: input.exceptionExpired === true,
    });
    if (
      input.overrideRequested === true &&
      exceptions.action !== "approve_exception"
    ) {
      blocks.push(exceptions.reasonCode || "policy_exception_denied");
    }

    const secrets = this.secretsRotation.decide({
      keyTier: input.keyTier,
      keyAgeDays: input.keyAgeDays,
    });
    if (secrets.blockSensitiveOperations && SENSITIVE_ACTIONS.has(action)) {
      blocks.push(secrets.reasonCode || "secrets_rotation_required");
    }

    const incident = this.incidentResponse.decide({
      category: input.incidentCategory,
      severity: input.incidentSeverity,
    });

    const model = this.modelRelease.decide({
      severity1Failures: input.severity1Failures,
      regressionPassRate: input.regressionPassRate,
    });
    if (action === "model_release" && !model.approved) {
      blocks.push(model.reasonCode || "model_release_blocked");
    }

    return {
      allowed: blocks.length < 1,
      blocks,
      accessAction: access.action,
      retentionAction: retention.action,
      exceptionAction: exceptions.action,
      secretsAction: secrets.action,
      incidentAction: incident.action,
      modelReleaseAction: model.action,
    };
  }
}
