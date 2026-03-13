import type { DocumentStatus, PrismaClient } from "@prisma/client";

import type { DocumentReferenceDoc } from "../../../services/core/scope/documentReferenceResolver.service";
import type { ScopeRuntimeMentionConfig } from "./ScopeMentionResolver";
import { filenameFromStorageKey } from "./scopeMentionShared";

const KNOWN_DOCUMENT_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  "ready",
  "indexed",
  "enriching",
  "available",
  "completed",
]);

export type ScopeMentionMatchInput = {
  userId: string;
  restrictToDocumentIds?: string[];
};

type ScopeMentionMatcherDependencies = {
  prismaClient: Pick<PrismaClient, "document">;
  config: ScopeRuntimeMentionConfig;
};

export class ScopeMentionMatcher {
  constructor(private readonly deps: ScopeMentionMatcherDependencies) {}

  async loadReferenceDocs(
    input: ScopeMentionMatchInput,
  ): Promise<DocumentReferenceDoc[]> {
    const restrictedDocIds = Array.isArray(input.restrictToDocumentIds)
      ? input.restrictToDocumentIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      : [];
    if (input.restrictToDocumentIds && restrictedDocIds.length === 0) {
      return [];
    }

    const allowedStatuses = this.deps.config.docStatusesAllowed
      .map((status) =>
        String(status || "")
          .trim()
          .toLowerCase(),
      )
      .filter((status): status is DocumentStatus =>
        KNOWN_DOCUMENT_STATUSES.has(status as DocumentStatus),
      );
    if (allowedStatuses.length === 0) return [];

    const docs = await this.deps.prismaClient.document.findMany({
      where: {
        userId: input.userId,
        status: { in: allowedStatuses },
        ...(restrictedDocIds.length > 0 ? { id: { in: restrictedDocIds } } : {}),
      },
      select: {
        id: true,
        filename: true,
        displayTitle: true,
        encryptedFilename: true,
      },
    });

    return docs.map((doc) => ({
      docId: doc.id,
      filename:
        doc.filename ||
        doc.displayTitle ||
        filenameFromStorageKey(doc.encryptedFilename),
      title:
        doc.displayTitle ||
        doc.filename ||
        filenameFromStorageKey(doc.encryptedFilename),
    }));
  }
}
