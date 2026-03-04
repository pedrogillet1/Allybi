export type DocScopeLockMode = "none" | "single_doc" | "docset";
export type DocScopeLockSource = "attachments" | "user_explicit" | "system";

export interface DocScopeLock {
  mode: DocScopeLockMode;
  allowedDocumentIds: string[];
  activeDocumentId?: string;
  source: DocScopeLockSource;
}

type LegacyScopeSignals = {
  docScopeLock?: Partial<DocScopeLock> | null;
  allowedDocumentIds?: string[] | null;
  explicitDocLock?: boolean | null;
  activeDocId?: string | null;
  explicitDocRef?: boolean | null;
  resolvedDocId?: string | null;
  singleDocIntent?: boolean | null;
};

function normalizeDocIds(docIds: unknown): string[] {
  if (!Array.isArray(docIds)) return [];
  const normalized = docIds
    .map((docId) => String(docId || "").trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeSource(input: unknown): DocScopeLockSource {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (value === "attachments") return "attachments";
  if (value === "user_explicit") return "user_explicit";
  return "system";
}

export function createDocScopeLock(input: {
  mode?: unknown;
  allowedDocumentIds?: unknown;
  activeDocumentId?: unknown;
  source?: unknown;
}): DocScopeLock {
  const modeRaw = String(input.mode || "")
    .trim()
    .toLowerCase();
  const source = normalizeSource(input.source);
  const allowedDocumentIds = normalizeDocIds(input.allowedDocumentIds);
  const activeDocumentId =
    String(input.activeDocumentId || "").trim() || undefined;

  if (modeRaw === "docset") {
    return {
      mode: "docset",
      allowedDocumentIds,
      ...(activeDocumentId ? { activeDocumentId } : {}),
      source,
    };
  }

  if (modeRaw === "single_doc") {
    const singleDocId = activeDocumentId || allowedDocumentIds[0] || "";
    if (!singleDocId) {
      return {
        mode: "none",
        allowedDocumentIds: [],
        source,
      };
    }
    return {
      mode: "single_doc",
      allowedDocumentIds: [singleDocId],
      activeDocumentId: singleDocId,
      source,
    };
  }

  return {
    mode: "none",
    allowedDocumentIds: [],
    source,
  };
}

export function buildAttachmentDocScopeLock(
  attachedDocumentIds: string[],
): DocScopeLock {
  const allowedDocumentIds = normalizeDocIds(attachedDocumentIds);
  if (allowedDocumentIds.length === 0) {
    return {
      mode: "none",
      allowedDocumentIds: [],
      source: "attachments",
    };
  }
  if (allowedDocumentIds.length === 1) {
    return {
      mode: "single_doc",
      allowedDocumentIds,
      activeDocumentId: allowedDocumentIds[0],
      source: "attachments",
    };
  }
  return {
    mode: "docset",
    allowedDocumentIds,
    source: "attachments",
  };
}

export function resolveDocScopeLockFromSignals(
  signals: LegacyScopeSignals,
): DocScopeLock {
  const lockFromSignals = signals?.docScopeLock || null;
  if (lockFromSignals) {
    return createDocScopeLock({
      mode: lockFromSignals.mode,
      allowedDocumentIds: lockFromSignals.allowedDocumentIds,
      activeDocumentId: lockFromSignals.activeDocumentId,
      source: lockFromSignals.source,
    });
  }

  if (signals?.explicitDocRef && signals?.resolvedDocId) {
    const singleDocId = String(signals.resolvedDocId || "").trim();
    if (singleDocId) {
      return {
        mode: "single_doc",
        allowedDocumentIds: [singleDocId],
        activeDocumentId: singleDocId,
        source: "user_explicit",
      };
    }
  }

  const allowedFromSignals = normalizeDocIds(signals?.allowedDocumentIds);
  if (allowedFromSignals.length > 1) {
    return {
      mode: "docset",
      allowedDocumentIds: allowedFromSignals,
      source: "system",
    };
  }
  if (allowedFromSignals.length === 1) {
    return {
      mode: "single_doc",
      allowedDocumentIds: allowedFromSignals,
      activeDocumentId: allowedFromSignals[0],
      source: "system",
    };
  }

  if (signals?.explicitDocLock && signals?.activeDocId) {
    const singleDocId = String(signals.activeDocId || "").trim();
    if (singleDocId) {
      return {
        mode: "single_doc",
        allowedDocumentIds: [singleDocId],
        activeDocumentId: singleDocId,
        source: "system",
      };
    }
  }

  if (signals?.singleDocIntent && signals?.activeDocId) {
    const singleDocId = String(signals.activeDocId || "").trim();
    if (singleDocId) {
      return {
        mode: "single_doc",
        allowedDocumentIds: [singleDocId],
        activeDocumentId: singleDocId,
        source: "system",
      };
    }
  }

  return {
    mode: "none",
    allowedDocumentIds: [],
    source: "system",
  };
}
