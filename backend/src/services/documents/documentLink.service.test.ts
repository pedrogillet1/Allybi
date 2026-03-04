import { describe, expect, test, jest, beforeEach } from "@jest/globals";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */
const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    documentLink: {
      findMany: (...args: any[]) => mockFindMany(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}));

import {
  validateDocumentLink,
  detectAmendmentConflict,
  createDocumentLink,
  listDocumentLinks,
  deactivateDocumentLink,
  RELATIONSHIP_TYPES,
} from "./documentLink.service";

describe("DocumentLinkService — validation", () => {
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

  test("rejects empty document IDs", () => {
    expect(() =>
      validateDocumentLink({
        sourceDocumentId: "",
        targetDocumentId: "doc-b",
        relationshipType: "amends",
      }),
    ).toThrow("Both sourceDocumentId and targetDocumentId are required");
  });
});

describe("detectAmendmentConflict", () => {
  test("VCR_002: flags when target already superseded", () => {
    const existing = [
      { relationshipType: "supersedes", targetDocumentId: "doc-old", status: "active" },
    ];
    const result = detectAmendmentConflict(existing, {
      sourceDocumentId: "doc-new",
      targetDocumentId: "doc-old",
      relationshipType: "supersedes",
    });
    expect(result.conflict).toBe(true);
    expect(result.rule).toBe("VCR_002");
  });

  test("no conflict when superseding a non-superseded target", () => {
    const existing = [
      { relationshipType: "amends", targetDocumentId: "doc-old", status: "active" },
    ];
    const result = detectAmendmentConflict(existing, {
      sourceDocumentId: "doc-new",
      targetDocumentId: "doc-old",
      relationshipType: "supersedes",
    });
    expect(result.conflict).toBe(false);
  });

  test("no conflict for first amendment", () => {
    const result = detectAmendmentConflict([], {
      sourceDocumentId: "doc-amendment",
      targetDocumentId: "doc-parent",
      relationshipType: "amends",
    });
    expect(result.conflict).toBe(false);
  });

  test("no conflict for extends relationship", () => {
    const result = detectAmendmentConflict([], {
      sourceDocumentId: "doc-ext",
      targetDocumentId: "doc-base",
      relationshipType: "extends",
    });
    expect(result.conflict).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Persistence (CRUD)                                                 */
/* ------------------------------------------------------------------ */
describe("DocumentLinkService — persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createDocumentLink persists to database and returns record", async () => {
    mockFindMany.mockResolvedValue([]); // no existing conflicts
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

  test("createDocumentLink throws on VCR_002 conflict", async () => {
    mockFindMany.mockResolvedValue([
      { relationshipType: "supersedes", targetDocumentId: "doc-b", status: "active" },
    ]);

    await expect(
      createDocumentLink({
        sourceDocumentId: "doc-a",
        targetDocumentId: "doc-b",
        relationshipType: "supersedes",
      }),
    ).rejects.toThrow(/LINK_CONFLICT.*VCR_002/);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("listDocumentLinks queries both source and target", async () => {
    mockFindMany.mockResolvedValue([]);
    await listDocumentLinks("doc-x");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { sourceDocumentId: "doc-x" },
            { targetDocumentId: "doc-x" },
          ],
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
});
