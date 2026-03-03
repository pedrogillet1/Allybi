import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(() => null),
}));

import { SourceButtonsService, type RawSource } from "./sourceButtons.service";

describe("SourceButtonsService dedupe behavior", () => {
  test("keeps multiple snippets for same document when no location exists", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      {
        documentId: "doc-1",
        filename: "report.pdf",
        snippet: "Revenue increased by 12%.",
        score: 0.9,
      },
      {
        documentId: "doc-1",
        filename: "report.pdf",
        snippet: "Gross margin was 41%.",
        score: 0.8,
      },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 5 });
    expect(out?.buttons).toHaveLength(2);
  });

  test("dedupes same document and location, keeping higher score", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      {
        documentId: "doc-1",
        filename: "report.pdf",
        locationKey: "d:doc-1|p:3|c:10",
        snippet: "older snippet",
        score: 0.3,
      },
      {
        documentId: "doc-1",
        filename: "report.pdf",
        locationKey: "d:doc-1|p:3|c:10",
        snippet: "better snippet",
        score: 0.9,
      },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 5 });
    expect(out?.buttons).toHaveLength(1);
    expect(out?.buttons[0]?.snippet).toBe("better snippet");
  });
});
