type ScopeArgs = {
  userId: string;
  documentId?: string;
  folderId?: string;
};

export function buildScopedFilter(args: ScopeArgs): Record<string, unknown> {
  if (args.documentId) {
    return {
      $and: [
        { userId: { $eq: args.userId } },
        { documentId: { $eq: args.documentId } },
      ],
    };
  }
  if (args.folderId) {
    return {
      $and: [
        { userId: { $eq: args.userId } },
        { folderId: { $eq: args.folderId } },
      ],
    };
  }
  return { userId: { $eq: args.userId } };
}

export function buildSlideFilter(
  userId: string,
  slideNumber: number,
  documentId?: string,
): Record<string, unknown> {
  return {
    $and: [
      { userId: { $eq: userId } },
      { slide: { $eq: slideNumber } },
      ...(documentId ? [{ documentId: { $eq: documentId } }] : []),
    ],
  };
}

export function buildSheetFilter(
  userId: string,
  sheetNumber: number,
  documentId?: string,
): Record<string, unknown> {
  return {
    $and: [
      { userId: { $eq: userId } },
      { sheetNumber: { $eq: sheetNumber } },
      ...(documentId ? [{ documentId: { $eq: documentId } }] : []),
    ],
  };
}

export function buildDocumentDeleteFilter(
  documentId: string,
  userId?: string,
): Record<string, unknown> {
  if (userId) {
    return {
      $and: [
        { userId: { $eq: userId } },
        { documentId: { $eq: documentId } },
      ],
    };
  }
  return { documentId: { $eq: documentId } };
}

export function buildOperationDeleteFilter(
  documentId: string,
  operationId: string,
  userId?: string,
): Record<string, unknown> {
  if (userId) {
    return {
      $and: [
        { userId: { $eq: userId } },
        { documentId: { $eq: documentId } },
        { operationId: { $eq: operationId } },
      ],
    };
  }
  return {
    $and: [
      { documentId: { $eq: documentId } },
      { operationId: { $eq: operationId } },
    ],
  };
}
