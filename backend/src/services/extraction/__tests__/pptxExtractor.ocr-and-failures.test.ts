const mockExtractWithTesseract = jest.fn();
jest.mock("../tesseractFallback.service", () => ({
  extractWithTesseract: (...args: unknown[]) => mockExtractWithTesseract(...args),
}));

import { extractPptxWithAnchors } from "../pptxExtractor.service";

function buildPptxWithFiles(files: Record<string, string | Buffer>): Buffer {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="xml" ContentType="application/xml"/>',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="png" ContentType="image/png"/>',
    '  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>',
    "</Types>",
  ].join("\n");
  const relsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>',
    "</Relationships>",
  ].join("\n");

  zip.addFile("[Content_Types].xml", Buffer.from(contentTypesXml, "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(relsXml, "utf8"));
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(
      name,
      Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"),
    );
  }
  return zip.toBuffer();
}

const VALID_SLIDE_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  '  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  '  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
  "  <p:cSld>",
  "    <p:spTree>",
  "      <p:sp><p:txBody><a:p><a:r><a:t>Slide text</a:t></a:r></a:p></p:txBody></p:sp>",
  "    </p:spTree>",
  "  </p:cSld>",
  "</p:sld>",
].join("\n");

describe("pptxExtractor failure handling and image OCR wiring", () => {
  const originalEnv = process.env.PPTX_IMAGE_OCR_ENABLED;
  const originalMinConfidence = process.env.PPTX_IMAGE_OCR_MIN_CONFIDENCE;
  const originalParsePolicy = process.env.PPTX_SLIDE_PARSE_FAILURE_POLICY;
  const originalParseMaxRatio = process.env.PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PPTX_IMAGE_OCR_ENABLED = "false";
    delete process.env.PPTX_IMAGE_OCR_MIN_CONFIDENCE;
    delete process.env.PPTX_SLIDE_PARSE_FAILURE_POLICY;
    delete process.env.PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO;
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.PPTX_IMAGE_OCR_ENABLED;
    else process.env.PPTX_IMAGE_OCR_ENABLED = originalEnv;
    if (originalMinConfidence === undefined) delete process.env.PPTX_IMAGE_OCR_MIN_CONFIDENCE;
    else process.env.PPTX_IMAGE_OCR_MIN_CONFIDENCE = originalMinConfidence;
    if (originalParsePolicy === undefined) delete process.env.PPTX_SLIDE_PARSE_FAILURE_POLICY;
    else process.env.PPTX_SLIDE_PARSE_FAILURE_POLICY = originalParsePolicy;
    if (originalParseMaxRatio === undefined) delete process.env.PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO;
    else process.env.PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO = originalParseMaxRatio;
  });

  it("does not index placeholder text when slide parsing fails", async () => {
    const invalidSlideXml = "<p:sld><p:cSld><p:spTree>"; // invalid XML
    const buffer = buildPptxWithFiles({
      "ppt/slides/slide1.xml": invalidSlideXml,
    });

    const result = await extractPptxWithAnchors(buffer);

    expect(result.slides[0].text).toBe("");
    expect(result.text).toBe("");
    expect(result.extractionWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining("pptx_slide_parse_failed")]),
    );
  });

  it("fails extraction when parse failure ratio exceeds threshold in fail policy", async () => {
    process.env.PPTX_SLIDE_PARSE_FAILURE_POLICY = "fail";
    process.env.PPTX_SLIDE_PARSE_FAILURE_MAX_RATIO = "0";
    const invalidSlideXml = "<p:sld><p:cSld><p:spTree>"; // invalid XML
    const buffer = buildPptxWithFiles({
      "ppt/slides/slide1.xml": invalidSlideXml,
    });

    await expect(extractPptxWithAnchors(buffer)).rejects.toThrow(
      "PPTX slide parse failure ratio exceeded threshold",
    );
  });

  it("merges image OCR text into slide extraction when PPTX_IMAGE_OCR_ENABLED=true", async () => {
    process.env.PPTX_IMAGE_OCR_ENABLED = "true";
    mockExtractWithTesseract.mockResolvedValue({
      text: "Detected chart labels from embedded image",
      confidence: 0.77,
    });
    const slideRels = [
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>',
      "</Relationships>",
    ].join("\n");
    const buffer = buildPptxWithFiles({
      "ppt/slides/slide1.xml": VALID_SLIDE_XML,
      "ppt/slides/_rels/slide1.xml.rels": slideRels,
      "ppt/media/image1.png": Buffer.from("fake-image-bytes"),
    });

    const result = await extractPptxWithAnchors(buffer);

    expect(mockExtractWithTesseract).toHaveBeenCalledTimes(1);
    expect(result.slides[0].text).toContain("[Image text: Detected chart labels from embedded image]");
    expect(result.text).toContain("Detected chart labels from embedded image");
  });

  it("drops low-confidence image OCR text when below threshold", async () => {
    process.env.PPTX_IMAGE_OCR_ENABLED = "true";
    process.env.PPTX_IMAGE_OCR_MIN_CONFIDENCE = "0.8";
    mockExtractWithTesseract.mockResolvedValue({
      text: "Detected chart labels from embedded image",
      confidence: 0.61,
    });
    const slideRels = [
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>',
      "</Relationships>",
    ].join("\n");
    const buffer = buildPptxWithFiles({
      "ppt/slides/slide1.xml": VALID_SLIDE_XML,
      "ppt/slides/_rels/slide1.xml.rels": slideRels,
      "ppt/media/image1.png": Buffer.from("fake-image-bytes"),
    });

    const result = await extractPptxWithAnchors(buffer);

    expect(mockExtractWithTesseract).toHaveBeenCalledTimes(1);
    expect(result.slides[0].text).not.toContain("[Image text:");
    expect(result.extractionWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("pptx_image_ocr_low_confidence"),
      ]),
    );
  });
});
