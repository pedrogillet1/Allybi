import { describe, expect, it } from "@jest/globals";
import {
  deriveExtractionWarningCodes,
  deriveWarningCode,
} from "../warningCodes.service";

describe("warningCodes.service", () => {
  it("uses explicit code prefix when warning starts with 'code:'", () => {
    expect(
      deriveWarningCode(
        "pptx_slide_parse_failed: slides 2,3",
      ),
    ).toBe("pptx_slide_parse_failed");
  });

  it("slugifies free-form warnings when no explicit code prefix exists", () => {
    expect(
      deriveWarningCode("OCR provider returned no confidence score"),
    ).toBe("ocr_provider_returned_no_confidence_score");
  });

  it("returns stable deduped codes preserving first-seen order", () => {
    expect(
      deriveExtractionWarningCodes([
        "pptx_slide_parse_failed: slides 2,3",
        "OCR provider returned no confidence score",
        "pptx_slide_parse_failed: slides 5",
      ]),
    ).toEqual([
      "pptx_slide_parse_failed",
      "ocr_provider_returned_no_confidence_score",
    ]);
  });

  it("falls back to unknown_warning for blank values", () => {
    expect(deriveWarningCode("")).toBe("unknown_warning");
    expect(deriveExtractionWarningCodes(["", "  "])).toEqual([
      "unknown_warning",
    ]);
  });
});

