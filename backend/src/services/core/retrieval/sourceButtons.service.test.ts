import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(() => null),
}));

import {
  SourceButtonsService,
  filterSourceButtonsByUsage,
  type RawSource,
  type SourceButtonsAttachment,
} from "./sourceButtons.service";

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

describe("SourceButtonsService extended", () => {
  test("empty sources returns null", () => {
    const service = new SourceButtonsService();
    const out = service.buildSourceButtons([], { maxButtons: 5 });
    expect(out).toBeNull();
  });

  test("maxButtons limits output count", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = Array.from({ length: 10 }, (_, i) => ({
      documentId: `doc-${i}`,
      filename: `file-${i}.pdf`,
      score: 0.5 + i * 0.01,
    }));

    const out = service.buildSourceButtons(sources, { maxButtons: 3 });
    expect(out?.buttons).toHaveLength(3);
  });

  test("buttons are sorted by score descending", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      { documentId: "low", filename: "low.pdf", score: 0.1 },
      { documentId: "high", filename: "high.pdf", score: 0.9 },
      { documentId: "mid", filename: "mid.pdf", score: 0.5 },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 10 });
    expect(out?.buttons.map((b) => b.documentId)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  test("location mapping includes page number when available", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      {
        documentId: "doc-1",
        filename: "report.pdf",
        pageNumber: 7,
        score: 0.8,
      },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 5 });
    expect(out?.buttons[0]?.location).toEqual({
      type: "page",
      value: 7,
      label: "Page 7",
    });
    expect(out?.buttons[0]?.locationKey).toContain("|p:7");
  });

  test("location mapping includes slide number when available", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      {
        documentId: "doc-1",
        filename: "deck.pptx",
        slideNumber: 12,
        score: 0.8,
      },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 5 });
    expect(out?.buttons[0]?.location).toEqual({
      type: "slide",
      value: 12,
      label: "Slide 12",
    });
  });

  test("location mapping includes cell reference when available", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      {
        documentId: "doc-1",
        filename: "data.xlsx",
        cellReference: "B14",
        score: 0.8,
      },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 5 });
    expect(out?.buttons[0]?.location).toEqual({
      type: "cell",
      value: "B14",
      label: "B14",
    });
    expect(out?.buttons[0]?.locationKey).toContain("|sec:B14");
  });

  test("seeAll flag triggers when file list sources exceed threshold", () => {
    const service = new SourceButtonsService();
    const files = Array.from({ length: 5 }, (_, i) => ({
      id: `doc-${i}`,
      filename: `file-${i}.pdf`,
    }));

    const out = service.buildFileListAttachment(files, 25, "en");
    expect(out.seeAll).toBeDefined();
    expect(out.seeAll?.totalCount).toBe(25);
    expect(out.seeAll?.remainingCount).toBe(15);
    expect(out.seeAll?.label).toBe("See all");
  });

  test("filterByUsage removes unused sources", () => {
    const attachment: SourceButtonsAttachment = {
      type: "source_buttons",
      buttons: [
        { documentId: "doc-1", title: "one.pdf" },
        { documentId: "doc-2", title: "two.pdf" },
        { documentId: "doc-3", title: "three.pdf" },
      ],
    };

    const used = new Set(["doc-1", "doc-3"]);
    const filtered = filterSourceButtonsByUsage(attachment, used);
    expect(filtered?.buttons).toHaveLength(2);
    expect(filtered?.buttons.map((b) => b.documentId)).toEqual([
      "doc-1",
      "doc-3",
    ]);
  });

  test("de-duplicates sources by documentId and location fingerprint", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      {
        documentId: "doc-1",
        filename: "report.pdf",
        pageNumber: 3,
        score: 0.7,
      },
      {
        documentId: "doc-1",
        filename: "report.pdf",
        pageNumber: 3,
        score: 0.9,
      },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 10 });
    expect(out?.buttons).toHaveLength(1);
    expect(out?.buttons[0]?.location?.value).toBe(3);
  });

  test("handles sources with missing metadata gracefully", () => {
    const service = new SourceButtonsService();
    const sources: RawSource[] = [
      {
        documentId: "doc-1",
        filename: "mystery.bin",
      },
    ];

    const out = service.buildSourceButtons(sources, { maxButtons: 5 });
    expect(out?.buttons).toHaveLength(1);
    expect(out?.buttons[0]?.documentId).toBe("doc-1");
    expect(out?.buttons[0]?.title).toBe("mystery.bin");
    expect(out?.buttons[0]?.location).toBeUndefined();
    expect(out?.buttons[0]?.mimeType).toBeUndefined();
  });
});
