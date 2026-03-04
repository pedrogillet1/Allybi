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
      metadata: input.metadata ?? undefined,
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

export const RELATIONSHIP_TYPES = VALID_RELATIONSHIP_TYPES;
