import { ValidationErrorCode } from "../../fileValidator.service";
import { isKnownSkipCode, toSkipCode } from "../skipCodes";

describe("skipCodes", () => {
  test("accepts known skip codes from pipeline and validator layers", () => {
    expect(isKnownSkipCode("NO_TEXT_CONTENT")).toBe(true);
    expect(isKnownSkipCode("IMAGE_VISUAL_ONLY")).toBe(true);
    expect(isKnownSkipCode("OCR_REQUIRED_UNAVAILABLE")).toBe(true);
    expect(isKnownSkipCode(ValidationErrorCode.FILE_CORRUPTED)).toBe(true);
  });

  test("normalizes unknown values to fallback", () => {
    expect(toSkipCode("NOT_A_REAL_CODE", "FILE_INVALID")).toBe("FILE_INVALID");
    expect(toSkipCode(undefined, "NO_TEXT_CONTENT")).toBe("NO_TEXT_CONTENT");
  });
});

