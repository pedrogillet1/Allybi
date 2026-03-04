import { describe, expect, test, afterEach, jest } from "@jest/globals";

// Mock database/storage/queue to avoid env validation side-effects
jest.mock("../../config/database", () => ({}));
jest.mock("../../config/storage", () => ({ uploadFile: jest.fn() }));
jest.mock("../../queues/document.queue", () => ({ addDocumentJob: jest.fn() }));

import { getRevisionMaxDepth } from "./revision.service";

describe("getRevisionMaxDepth", () => {
  afterEach(() => {
    delete process.env.REVISION_MAX_DEPTH;
  });

  test("defaults to 20 when env not set", () => {
    delete process.env.REVISION_MAX_DEPTH;
    expect(getRevisionMaxDepth()).toBe(20);
  });

  test("reads REVISION_MAX_DEPTH from env", () => {
    process.env.REVISION_MAX_DEPTH = "50";
    expect(getRevisionMaxDepth()).toBe(50);
  });

  test("clamps to minimum of 2", () => {
    process.env.REVISION_MAX_DEPTH = "1";
    expect(getRevisionMaxDepth()).toBe(20);
  });

  test("clamps to maximum of 1000", () => {
    process.env.REVISION_MAX_DEPTH = "5000";
    expect(getRevisionMaxDepth()).toBe(20);
  });

  test("handles non-numeric gracefully", () => {
    process.env.REVISION_MAX_DEPTH = "abc";
    expect(getRevisionMaxDepth()).toBe(20);
  });
});
