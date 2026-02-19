import type { EditDiffPayload } from "../editing.types";

export interface ApplyVerificationInput {
  revisionId: string | null;
  fileHashBefore: string;
  fileHashAfter: string;
  diff?: EditDiffPayload;
  changeCount: number;
}

export interface ApplyVerificationResult {
  verified: boolean;
  changed: boolean;
  reasons: string[];
}

/**
 * Central mutation verifier used by apply flows.
 * "Applied" should only be true when this verifier confirms a real change.
 */
export class ApplyVerificationService {
  verify(input: ApplyVerificationInput): ApplyVerificationResult {
    const reasons: string[] = [];
    const hasRevision = Boolean(String(input.revisionId || "").trim());
    const hashesDiffer =
      String(input.fileHashBefore || "") !== String(input.fileHashAfter || "");
    const diffChanged = Boolean(input.diff?.changed);
    const hasDiffChanges =
      Array.isArray(input.diff?.changes) && input.diff!.changes.length > 0;
    const hasChangeCount = Number(input.changeCount || 0) > 0;
    const changed =
      hashesDiffer || diffChanged || hasDiffChanges || hasChangeCount;

    if (!hasRevision) reasons.push("missing_revision_id");
    if (!changed) reasons.push("no_verified_mutation");

    return {
      verified: hasRevision && changed,
      changed,
      reasons,
    };
  }
}
