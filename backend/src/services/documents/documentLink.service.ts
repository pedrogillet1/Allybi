import type { Prisma } from "@prisma/client";
import prisma from "../../config/database";
import { logger } from "../../utils/logger";

const VALID_RELATIONSHIP_TYPES = [
  "amends",
  "supersedes",
  "restates",
  "extends",
  "terminates",
] as const;

export type RelationshipType = (typeof VALID_RELATIONSHIP_TYPES)[number];

export interface CreateDocumentLinkInput {
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: RelationshipType;
  metadata?: Record<string, unknown>;
}

export interface DocumentLinkRecord {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: string;
  status: string;
  createdAt: Date;
}

export interface MissingRevisionAmendsLinkRecord {
  revisionDocumentId: string;
  expectedTargetDocumentId: string;
}

export interface ReconcileRevisionAmendsLinksResult {
  scanned: number;
  missing: number;
  repaired: number;
  failed: number;
  sampleFailures: Array<{ revisionDocumentId: string; error: string }>;
}

async function computeMissingRevisionAmendsLinks(params?: {
  userId?: string;
  limit?: number;
}): Promise<{
  scanned: number;
  missing: MissingRevisionAmendsLinkRecord[];
}> {
  const limit = Math.max(1, Math.min(5000, Math.trunc(params?.limit ?? 1000)));
  const revisions = await prisma.document.findMany({
    where: {
      ...(params?.userId ? { userId: params.userId } : {}),
      parentVersionId: { not: null },
    } as any,
    select: { id: true, parentVersionId: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (!revisions.length) {
    return { scanned: 0, missing: [] };
  }

  const revisionIds = revisions.map((doc) => String(doc.id || "").trim()).filter(Boolean);
  const links = await prisma.documentLink.findMany({
    where: {
      sourceDocumentId: { in: revisionIds },
      relationshipType: "amends",
      status: "active",
    },
    select: {
      sourceDocumentId: true,
      targetDocumentId: true,
    },
  });

  const linkedTargetsBySource = new Map<string, Set<string>>();
  for (const link of links) {
    const sourceId = String(link.sourceDocumentId || "").trim();
    const targetId = String(link.targetDocumentId || "").trim();
    if (!sourceId || !targetId) continue;
    if (!linkedTargetsBySource.has(sourceId)) {
      linkedTargetsBySource.set(sourceId, new Set<string>());
    }
    linkedTargetsBySource.get(sourceId)!.add(targetId);
  }

  const missing: MissingRevisionAmendsLinkRecord[] = [];
  for (const revision of revisions) {
    const revisionId = String(revision.id || "").trim();
    const expectedTargetId = String(revision.parentVersionId || "").trim();
    if (!revisionId || !expectedTargetId) continue;
    const linkedTargets = linkedTargetsBySource.get(revisionId);
    if (!linkedTargets || !linkedTargets.has(expectedTargetId)) {
      missing.push({
        revisionDocumentId: revisionId,
        expectedTargetDocumentId: expectedTargetId,
      });
    }
  }

  return { scanned: revisions.length, missing };
}

/**
 * Validates a document link input.
 * Throws on invalid relationship type or self-link.
 */
export function validateDocumentLink(input: CreateDocumentLinkInput): void {
  if (!(VALID_RELATIONSHIP_TYPES as readonly string[]).includes(input.relationshipType)) {
    throw new Error(
      `Invalid relationship type: ${input.relationshipType}. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}`,
    );
  }

  if (input.sourceDocumentId === input.targetDocumentId) {
    throw new Error("Cannot link a document to itself");
  }

  if (!input.sourceDocumentId || !input.targetDocumentId) {
    throw new Error("Both sourceDocumentId and targetDocumentId are required");
  }
}

/**
 * Detects potential version conflict rules from the amendment_chain_schema.
 * VCR_001: Two documents amend same clause of same parent -> flag
 * VCR_002: Document both effective AND superseded -> flag
 * VCR_003: Amendment references missing parent -> flag
 */
export function detectAmendmentConflict(
  existingLinks: Array<{ relationshipType: string; targetDocumentId: string; status: string }>,
  newLink: CreateDocumentLinkInput,
): { conflict: boolean; rule?: string; message?: string } {
  // VCR_002: target already superseded
  if (newLink.relationshipType === "supersedes") {
    const alreadySuperseded = existingLinks.find(
      (l) =>
        l.targetDocumentId === newLink.targetDocumentId &&
        l.relationshipType === "supersedes" &&
        l.status === "active",
    );
    if (alreadySuperseded) {
      return {
        conflict: true,
        rule: "VCR_002",
        message: `Target document ${newLink.targetDocumentId} is already superseded by another document`,
      };
    }
  }

  // VCR_001: same parent amended by multiple children on same clause
  if (newLink.relationshipType === "amends") {
    const otherAmendments = existingLinks.filter(
      (l) =>
        l.targetDocumentId === newLink.targetDocumentId &&
        l.relationshipType === "amends" &&
        l.status === "active",
    );
    if (otherAmendments.length > 0) {
      logger.warn("[DocumentLink] VCR_001: Multiple amendments to same target", {
        targetDocumentId: newLink.targetDocumentId,
        existingCount: otherAmendments.length,
      });
      // Not a hard conflict — just a warning
    }
  }

  return { conflict: false };
}

/**
 * Persists a document link to the database.
 * Validates input and checks for amendment conflicts before creating.
 */
export async function createDocumentLink(
  input: CreateDocumentLinkInput,
): Promise<DocumentLinkRecord> {
  validateDocumentLink(input);

  // Check for conflicts against existing links
  const existingLinks = await prisma.documentLink.findMany({
    where: {
      targetDocumentId: input.targetDocumentId,
      status: "active",
    },
    select: {
      relationshipType: true,
      targetDocumentId: true,
      status: true,
    },
  });

  const conflict = detectAmendmentConflict(existingLinks, input);
  if (conflict.conflict) {
    throw new Error(`LINK_CONFLICT [${conflict.rule}]: ${conflict.message}`);
  }

  const link = await prisma.documentLink.create({
    data: {
      sourceDocumentId: input.sourceDocumentId,
      targetDocumentId: input.targetDocumentId,
      relationshipType: input.relationshipType,
      metadata:
        input.metadata == null
          ? undefined
          : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue),
    },
  });

  logger.info("[DocumentLink] Created", {
    linkId: link.id,
    sourceDocumentId: link.sourceDocumentId,
    targetDocumentId: link.targetDocumentId,
    relationshipType: link.relationshipType,
  });

  return link;
}

/**
 * Lists all active document links for a document (both as source and target).
 */
export async function listDocumentLinks(
  documentId: string,
): Promise<DocumentLinkRecord[]> {
  return prisma.documentLink.findMany({
    where: {
      OR: [
        { sourceDocumentId: documentId },
        { targetDocumentId: documentId },
      ],
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Deactivates a document link (soft delete).
 */
export async function deactivateDocumentLink(linkId: string): Promise<void> {
  await prisma.documentLink.update({
    where: { id: linkId },
    data: { status: "inactive" },
  });

  logger.info("[DocumentLink] Deactivated", { linkId });
}

export async function listMissingRevisionAmendsLinks(params?: {
  userId?: string;
  limit?: number;
}): Promise<MissingRevisionAmendsLinkRecord[]> {
  const result = await computeMissingRevisionAmendsLinks(params);
  return result.missing;
}

export async function reconcileRevisionAmendsLinks(params?: {
  userId?: string;
  limit?: number;
}): Promise<ReconcileRevisionAmendsLinksResult> {
  const { scanned, missing } = await computeMissingRevisionAmendsLinks(params);
  let repaired = 0;
  let failed = 0;
  const sampleFailures: Array<{ revisionDocumentId: string; error: string }> = [];

  for (const item of missing) {
    try {
      await prisma.documentLink.upsert({
        where: {
          sourceDocumentId_targetDocumentId_relationshipType: {
            sourceDocumentId: item.revisionDocumentId,
            targetDocumentId: item.expectedTargetDocumentId,
            relationshipType: "amends",
          },
        },
        update: { status: "active" },
        create: {
          sourceDocumentId: item.revisionDocumentId,
          targetDocumentId: item.expectedTargetDocumentId,
          relationshipType: "amends",
          status: "active",
        },
      });
      repaired += 1;
    } catch (error: any) {
      failed += 1;
      if (sampleFailures.length < 10) {
        sampleFailures.push({
          revisionDocumentId: item.revisionDocumentId,
          error: String(error?.message || error || "unknown_error"),
        });
      }
    }
  }

  return {
    scanned,
    missing: missing.length,
    repaired,
    failed,
    sampleFailures,
  };
}

export const RELATIONSHIP_TYPES = VALID_RELATIONSHIP_TYPES;
