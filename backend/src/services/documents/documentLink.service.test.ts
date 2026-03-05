import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockLinkFindMany = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockUpsert = jest.fn();
const mockDocumentFindMany = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: (...args: any[]) => mockDocumentFindMany(...args),
    },
    documentLink: {
      findMany: (...args: any[]) => mockLinkFindMany(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      upsert: (...args: any[]) => mockUpsert(...args),
    },
  },
}));

import {
  RELATIONSHIP_TYPES,
  createDocumentLink,
  deactivateDocumentLink,
  detectAmendmentConflict,
  listDocumentLinks,
  listMissingRevisionAmendsLinks,
  reconcileRevisionAmendsLinks,
  validateDocumentLink,
} from "./documentLink.service";

describe("DocumentLinkService validation", () => {
  test("accepts all valid relationship types", () => {
    for (const type of RELATIONSHIP_TYPES) {
      expect(() =>
        validateDocumentLink({
          sourceDocumentId: "doc-a",
          targetDocumentId: "doc-b",
          relationshipType: type,
        }),
      ).not.toThrow();
    }
  });

  test("rejects invalid relationship type", () => {
    expect(() =>
      validateDocumentLink({
        sourceDocumentId: "doc-a",
        targetDocumentId: "doc-b",
        relationshipType: "invalid" as any,
      }),
    ).toThrow("Invalid relationship type");
  });

  test("rejects self-link", () => {
    expect(() =>
      validateDocumentLink({
        sourceDocumentId: "doc-a",
        targetDocumentId: "doc-a",
        relationshipType: "amends",
      }),
    ).toThrow("Cannot link a document to itself");
  });
});

describe("detectAmendmentConflict", () => {
  test("VCR_002: flags when target already superseded", () => {
    const existing = [
      {
        relationshipType: "supersedes",
        targetDocumentId: "doc-old",
        status: "active",
      },
    ];
    const result = detectAmendmentConflict(existing, {
      sourceDocumentId: "doc-new",
      targetDocumentId: "doc-old",
      relationshipType: "supersedes",
    });
    expect(result.conflict).toBe(true);
    expect(result.rule).toBe("VCR_002");
  });
});

describe("DocumentLinkService persistence and reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createDocumentLink persists to database and returns record", async () => {
    mockLinkFindMany.mockResolvedValue([]);
    const fakeRecord = {
      id: "link-1",
      sourceDocumentId: "doc-a",
      targetDocumentId: "doc-b",
      relationshipType: "amends",
      status: "active",
      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(fakeRecord);

    const result = await createDocumentLink({
      sourceDocumentId: "doc-a",
      targetDocumentId: "doc-b",
      relationshipType: "amends",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceDocumentId: "doc-a",
        targetDocumentId: "doc-b",
        relationshipType: "amends",
      }),
    });
    expect(result.id).toBe("link-1");
  });

  test("listDocumentLinks queries both source and target", async () => {
    mockLinkFindMany.mockResolvedValue([]);
    await listDocumentLinks("doc-x");

    expect(mockLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ sourceDocumentId: "doc-x" }, { targetDocumentId: "doc-x" }],
          status: "active",
        }),
      }),
    );
  });

  test("deactivateDocumentLink sets status to inactive", async () => {
    mockUpdate.mockResolvedValue({});
    await deactivateDocumentLink("link-99");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "link-99" },
      data: { status: "inactive" },
    });
  });

  test("listMissingRevisionAmendsLinks returns revisions missing active amends links", async () => {
    mockDocumentFindMany.mockResolvedValue([
      { id: "rev-1", parentVersionId: "root-1" },
      { id: "rev-2", parentVersionId: "root-2" },
    ]);
    mockLinkFindMany.mockResolvedValue([
      { sourceDocumentId: "rev-1", targetDocumentId: "root-1" },
    ]);

    const result = await listMissingRevisionAmendsLinks({ limit: 100 });
    expect(result).toEqual([
      {
        revisionDocumentId: "rev-2",
        expectedTargetDocumentId: "root-2",
      },
    ]);
  });

  test("reconcileRevisionAmendsLinks upserts missing amends links", async () => {
    mockDocumentFindMany.mockResolvedValue([
      { id: "rev-1", parentVersionId: "root-1" },
      { id: "rev-2", parentVersionId: "root-2" },
    ]);
    mockLinkFindMany.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({});

    const result = await reconcileRevisionAmendsLinks({ limit: 100 });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(result.scanned).toBe(2);
    expect(result.missing).toBe(2);
    expect(result.repaired).toBe(2);
    expect(result.failed).toBe(0);
  });
});
