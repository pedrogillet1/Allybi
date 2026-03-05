import {
  isMimeTypeSupportedForExtraction,
} from "../extractionDispatch.service";

describe("isMimeTypeSupportedForExtraction", () => {
  it("accepts core document, text, and image mime types", () => {
    expect(isMimeTypeSupportedForExtraction("application/pdf")).toBe(true);
    expect(
      isMimeTypeSupportedForExtraction(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isMimeTypeSupportedForExtraction("text/csv")).toBe(true);
    expect(isMimeTypeSupportedForExtraction("image/png")).toBe(true);
    expect(isMimeTypeSupportedForExtraction("message/rfc822")).toBe(true);
    expect(
      isMimeTypeSupportedForExtraction("application/x-slack-message"),
    ).toBe(true);
  });

  it("rejects unsupported non-extractable mime types", () => {
    expect(isMimeTypeSupportedForExtraction("video/mp4")).toBe(false);
    expect(isMimeTypeSupportedForExtraction("application/psd")).toBe(false);
    expect(isMimeTypeSupportedForExtraction("application/octet-stream")).toBe(
      false,
    );
  });
});
