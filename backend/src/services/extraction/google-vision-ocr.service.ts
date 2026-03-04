// src/services/extraction/googleVisionOcr.service.ts
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { logger } from "../../utils/logger";

export type OcrMode = "document" | "text";

export interface OcrOptions {
  mode?: OcrMode; // 'document' is best for invoices/IDs/scans
  languageHints?: string[]; // e.g. ['pt', 'en']
  maxChars?: number; // safety cap for huge outputs
  stripHyphenLineBreaks?: boolean; // join "line-\nbreak" => "linebreak"
}

export interface OcrResult {
  text: string;
  confidence?: number; // avg confidence if available
  blocks?: Array<{
    text: string;
    confidence?: number;
    boundingBox?: { x: number; y: number }[];
  }>;
  warnings: string[];
}

export interface OcrPdfPageResult {
  page: number;
  text: string;
  confidence: number;
}

export interface OcrPdfResult {
  pages: OcrPdfPageResult[];
  pageCount: number;
  confidence: number;
  mode: "direct" | "split";
  warnings: string[];
}

const OCR_PDF_BATCH_SIZE = 5;
const OCR_PDF_MAX_PAGES = 50;
const OCR_PDF_MAX_CONCURRENCY = 3;
const OCR_PDF_PAYLOAD_LIMIT_BYTES = 40 * 1024 * 1024;

function safeJsonParse(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * GOOGLE VISION OCR SERVICE
 *
 * Env options (choose ONE approach):
 * 1) Standard: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 * 2) Inline JSON: set GOOGLE_VISION_CREDENTIALS_JSON='{"type":"service_account",...}'
 *    (or base64) set GOOGLE_VISION_CREDENTIALS_B64='eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwuLi59'
 *
 * Optional:
 * - GOOGLE_CLOUD_PROJECT
 */
export class GoogleVisionOcrService {
  private client: ImageAnnotatorClient | null = null;
  private initError: string | null = null;

  constructor() {
    this.initClient();
  }

  private initClient() {
    try {
      // If GOOGLE_APPLICATION_CREDENTIALS is set, Google SDK will pick it up automatically.
      const b64 = process.env.GOOGLE_VISION_CREDENTIALS_B64;
      const json = process.env.GOOGLE_VISION_CREDENTIALS_JSON;

      if (b64) {
        const decoded = Buffer.from(b64, "base64").toString("utf8");
        const creds = safeJsonParse(decoded);
        if (!creds)
          throw new Error(
            "Invalid GOOGLE_VISION_CREDENTIALS_B64 (not valid JSON).",
          );

        this.client = new ImageAnnotatorClient({
          credentials: creds,
          projectId: process.env.GOOGLE_CLOUD_PROJECT || creds.project_id,
        });
        return;
      }

      if (json) {
        const creds = safeJsonParse(json);
        if (!creds)
          throw new Error(
            "Invalid GOOGLE_VISION_CREDENTIALS_JSON (not valid JSON).",
          );

        this.client = new ImageAnnotatorClient({
          credentials: creds,
          projectId: process.env.GOOGLE_CLOUD_PROJECT || creds.project_id,
        });
        return;
      }

      // Fallback to default credentials chain (GOOGLE_APPLICATION_CREDENTIALS or metadata)
      this.client = new ImageAnnotatorClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
      });
    } catch (e: any) {
      this.client = null;
      this.initError = e?.message || String(e);
    }
  }

  isAvailable(): boolean {
    return !!this.client && !this.initError;
  }

  getInitError(): string | null {
    return this.initError;
  }

  getInitializationError(): string | null {
    return this.initError;
  }

  /**
   * Process a scanned PDF using Google Vision's document text detection.
   */
  async processScannedPDF(
    buffer: Buffer,
  ): Promise<{ text: string; pageCount: number; confidence: number }> {
    const result = await this.processPdfPages(buffer);
    const pagesOrdered = [...result.pages].sort((a, b) => a.page - b.page);
    const fullText = pagesOrdered
      .map((p) => p.text)
      .filter((t) => t && t.trim().length > 0)
      .join("\f");

    return {
      text: fullText.trim(),
      pageCount: result.pageCount,
      confidence: result.confidence,
    };
  }

  /**
   * OCR PDF pages with adaptive fallback:
   * 1) direct batchAnnotateFiles on the original PDF
   * 2) if payload/resource limits are hit, split into smaller PDFs and retry
   */
  async processPdfPages(
    buffer: Buffer,
    opts?: { pages?: number[]; maxPages?: number },
  ): Promise<OcrPdfResult> {
    if (!this.client) {
      throw new Error(this.initError || "Google Vision not initialized");
    }

    const totalPages = await this.detectPdfPageCount(buffer);
    const maxPages = Math.min(
      totalPages,
      Math.max(1, opts?.maxPages ?? OCR_PDF_MAX_PAGES),
    );
    const targetPages = this.normalizeTargetPages(opts?.pages, maxPages);
    const warnings: string[] = [];

    if (targetPages.length === 0) {
      return {
        pages: [],
        pageCount: maxPages,
        confidence: 0,
        mode: "direct",
        warnings: ["NO_TARGET_PAGES"],
      };
    }

    logger.info("[OCR] Processing PDF pages via batchAnnotateFiles", {
      targetPageCount: targetPages.length,
      maxPages,
      bufferSizeMB: parseFloat((buffer.length / 1024 / 1024).toFixed(1)),
    });

    const direct = await this.runDirectPdfBatches(buffer, targetPages);
    let pages = direct.pages;
    let mode: "direct" | "split" = "direct";

    const lowCoverage =
      targetPages.length > 0 &&
      pages.length < Math.max(1, Math.floor(targetPages.length * 0.6));
    const shouldSplit =
      direct.payloadLimitHit ||
      (direct.resourceExhaustedHit && lowCoverage) ||
      (buffer.length >= OCR_PDF_PAYLOAD_LIMIT_BYTES &&
        pages.length < targetPages.length);

    if (shouldSplit) {
      warnings.push(
        direct.payloadLimitHit
          ? "PAYLOAD_LIMIT_FALLBACK_SPLIT"
          : "RESOURCE_LIMIT_FALLBACK_SPLIT",
      );
      const split = await this.runSplitPdfBatches(buffer, targetPages);
      if (split.pages.length >= pages.length) {
        pages = split.pages;
        mode = "split";
        warnings.push(...split.warnings);
      }
    }

    const byPage = new Map<number, OcrPdfPageResult>();
    for (const p of pages) {
      if (!p || !Number.isFinite(p.page) || p.page < 1) continue;
      const existing = byPage.get(p.page);
      if (!existing || (p.text?.length ?? 0) > (existing.text?.length ?? 0)) {
        byPage.set(p.page, p);
      }
    }

    const sortedPages = Array.from(byPage.values()).sort(
      (a, b) => a.page - b.page,
    );
    const confidenceValues = sortedPages
      .map((p) => p.confidence)
      .filter((c) => Number.isFinite(c) && c > 0);
    const confidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, c) => sum + c, 0) /
          confidenceValues.length
        : 0.7;

    logger.info("[OCR] PDF OCR complete", {
      mode,
      pagesProcessed: sortedPages.length,
      targetPageCount: targetPages.length,
      confidencePct: parseFloat((confidence * 100).toFixed(1)),
    });

    return {
      pages: sortedPages,
      pageCount: maxPages,
      confidence,
      mode,
      warnings,
    };
  }

  private async detectPdfPageCount(buffer: Buffer): Promise<number> {
    let totalPages = 1;

    try {
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const info = await parser.getInfo();
      const textInfo = await parser.getText();
      await parser.destroy();

      const fromInfo = Number(info?.total || info?.numpages || 0);
      const markerMatches =
        String(textInfo?.text || "").match(
          /--\s*\d+\s*(of|de)\s*(\d+)\s*--/gi,
        ) || [];
      let fromMarkers = 0;
      for (const match of markerMatches) {
        const mm = match.match(/(?:of|de)\s*(\d+)/i);
        if (mm) {
          const n = Number(mm[1]);
          if (Number.isFinite(n)) fromMarkers = Math.max(fromMarkers, n);
        }
      }

      const formFeeds = String(textInfo?.text || "").split("\f").length;
      totalPages = Math.max(1, fromInfo, fromMarkers, formFeeds);
    } catch {
      try {
        const { PDFDocument } = require("@cantoo/pdf-lib");
        const pdfDoc = await PDFDocument.load(buffer);
        totalPages = Math.max(1, pdfDoc.getPageCount());
      } catch {
        totalPages = 1;
      }
    }

    return totalPages;
  }

  private normalizeTargetPages(
    pages: number[] | undefined,
    maxPages: number,
  ): number[] {
    if (!Array.isArray(pages) || pages.length === 0) {
      return Array.from({ length: maxPages }, (_, i) => i + 1);
    }

    const uniq = new Set<number>();
    for (const page of pages) {
      const n = Number(page);
      if (!Number.isFinite(n)) continue;
      const rounded = Math.floor(n);
      if (rounded >= 1 && rounded <= maxPages) uniq.add(rounded);
    }
    return Array.from(uniq).sort((a, b) => a - b);
  }

  private splitIntoBatches(pages: number[], batchSize: number): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < pages.length; i += batchSize) {
      out.push(pages.slice(i, i + batchSize));
    }
    return out;
  }

  private async runDirectPdfBatches(
    buffer: Buffer,
    targetPages: number[],
  ): Promise<{
    pages: OcrPdfPageResult[];
    payloadLimitHit: boolean;
    resourceExhaustedHit: boolean;
  }> {
    const pageBatches = this.splitIntoBatches(targetPages, OCR_PDF_BATCH_SIZE);
    const pages: OcrPdfPageResult[] = [];
    let payloadLimitHit = false;
    let resourceExhaustedHit = false;
    let cursor = 0;

    const workerCount = Math.min(OCR_PDF_MAX_CONCURRENCY, pageBatches.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= pageBatches.length) break;
        const batchPages = pageBatches[idx];
        try {
          const [result] = await this.client!.batchAnnotateFiles({
            requests: [
              {
                inputConfig: { content: buffer, mimeType: "application/pdf" },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" as any }],
                pages: batchPages,
              },
            ],
          });
          pages.push(...this.collectPdfResponses(result, batchPages, (n) => n));
        } catch (err: any) {
          if (this.isPayloadLimitError(err)) payloadLimitHit = true;
          if (this.isResourceExhaustedError(err)) resourceExhaustedHit = true;
          logger.warn("[OCR] Direct batch failed for pages", {
            pages: batchPages,
            error: err?.message || err,
          });
        }
      }
    });

    await Promise.all(workers);
    return { pages, payloadLimitHit, resourceExhaustedHit };
  }

  private async runSplitPdfBatches(
    buffer: Buffer,
    targetPages: number[],
  ): Promise<{
    pages: OcrPdfPageResult[];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const out: OcrPdfPageResult[] = [];
    const { PDFDocument } = require("@cantoo/pdf-lib");
    const sourcePdf = await PDFDocument.load(buffer);

    const queue = this.splitIntoBatches(targetPages, OCR_PDF_BATCH_SIZE);
    while (queue.length > 0) {
      const globalPages = queue.shift()!;
      let subsetBuffer = await this.buildPdfSubset(sourcePdf, globalPages);

      if (
        subsetBuffer.length >= OCR_PDF_PAYLOAD_LIMIT_BYTES &&
        globalPages.length > 1
      ) {
        const mid = Math.ceil(globalPages.length / 2);
        queue.unshift(globalPages.slice(mid), globalPages.slice(0, mid));
        warnings.push("SPLIT_BATCH_BY_SIZE");
        continue;
      }

      const localPages = Array.from(
        { length: globalPages.length },
        (_, i) => i + 1,
      );

      try {
        const [result] = await this.client!.batchAnnotateFiles({
          requests: [
            {
              inputConfig: {
                content: subsetBuffer,
                mimeType: "application/pdf",
              },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" as any }],
              pages: localPages,
            },
          ],
        });
        out.push(
          ...this.collectPdfResponses(
            result,
            localPages,
            (localPage) => globalPages[localPage - 1] || localPage,
          ),
        );
      } catch (err: any) {
        if (this.isResourceExhaustedError(err) && globalPages.length > 1) {
          const mid = Math.ceil(globalPages.length / 2);
          queue.unshift(globalPages.slice(mid), globalPages.slice(0, mid));
          warnings.push("SPLIT_BATCH_BY_RESOURCE");
          continue;
        }
        logger.warn("[OCR] Split batch failed for pages", {
          pages: globalPages,
          error: err?.message || err,
        });
      } finally {
        subsetBuffer = Buffer.alloc(0);
      }
    }

    return { pages: out, warnings };
  }

  private async buildPdfSubset(
    sourcePdf: any,
    globalPages: number[],
  ): Promise<Buffer> {
    const { PDFDocument } = require("@cantoo/pdf-lib");
    const subset = await PDFDocument.create();
    const indices = globalPages.map((p) => Math.max(0, p - 1));
    const copied = await subset.copyPages(sourcePdf, indices);
    copied.forEach((page: any) => subset.addPage(page));
    const bytes = await subset.save({ useObjectStreams: false });
    return Buffer.from(bytes);
  }

  private collectPdfResponses(
    result: any,
    requestedPages: number[],
    pageResolver: (page: number) => number,
  ): OcrPdfPageResult[] {
    const out: OcrPdfPageResult[] = [];
    const responses = result?.responses?.[0]?.responses || [];

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      const resolvedPage = pageResolver(requestedPages[i] ?? i + 1);
      const text = String(response?.fullTextAnnotation?.text || "").trim();
      const blocks =
        response?.fullTextAnnotation?.pages?.flatMap(
          (p: any) => p.blocks || [],
        ) || [];
      const confs = blocks
        .map((b: any) => b?.confidence)
        .filter(
          (c: any): c is number => typeof c === "number" && Number.isFinite(c),
        );
      const confidence =
        confs.length > 0
          ? confs.reduce((sum: number, c: number) => sum + c, 0) / confs.length
          : 0.7;

      out.push({ page: resolvedPage, text, confidence });
    }

    return out;
  }

  private isPayloadLimitError(err: any): boolean {
    const msg = String(err?.message || "").toLowerCase();
    return (
      msg.includes("request payload size exceeds the limit") ||
      msg.includes("41943040")
    );
  }

  private isResourceExhaustedError(err: any): boolean {
    const msg = String(err?.message || "").toLowerCase();
    return err?.code === 8 || msg.includes("resource_exhausted");
  }

  /**
   * OCR from an image buffer with automatic retry for transient errors.
   * Handles RST_STREAM errors, INTERNAL, and UNAVAILABLE gRPC codes.
   *
   * @param buffer - Image buffer to process
   * @param options - OCR options
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns OCR result
   */
  async extractTextWithRetry(
    buffer: Buffer,
    options: OcrOptions = {},
    maxRetries = 3,
  ): Promise<OcrResult> {
    // gRPC status codes for transient errors:
    // 2 = UNKNOWN, 13 = INTERNAL, 14 = UNAVAILABLE
    const TRANSIENT_CODES = [2, 13, 14];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.extractTextFromBuffer(buffer, options);
      } catch (err: any) {
        const isTransient =
          TRANSIENT_CODES.includes(err.code) ||
          err.message?.includes("RST_STREAM") ||
          err.message?.includes("INTERNAL") ||
          err.message?.includes("UNAVAILABLE");

        if (isTransient && attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s (capped at 8s)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          logger.warn("[OCR] Transient error, retrying", {
            attempt,
            maxRetries,
            delayMs: delay,
            error: err.message,
          });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    // Unreachable, but TypeScript needs this
    throw new Error("OCR retry exhausted without result");
  }

  /**
   * OCR from an image buffer (PNG/JPG/PDF page image, etc).
   */
  async extractTextFromBuffer(
    buffer: Buffer,
    options: OcrOptions = {},
  ): Promise<OcrResult> {
    const warnings: string[] = [];
    if (!this.client) {
      const msg = this.initError
        ? `Google Vision not initialized: ${this.initError}`
        : "Google Vision not initialized (missing credentials?)";
      throw new Error(msg);
    }

    const {
      mode = "document",
      languageHints = ["en", "pt"],
      maxChars = 200_000,
      stripHyphenLineBreaks = true,
    } = options;

    // Basic guard
    if (!buffer || buffer.length === 0) {
      return { text: "", warnings: ["EMPTY_BUFFER"] };
    }

    // Google API call
    const image = { content: buffer };

    const request =
      mode === "document"
        ? {
            image,
            imageContext: { languageHints },
          }
        : {
            image,
            imageContext: { languageHints },
          };

    let rawText = "";
    let confidence: number | undefined;
    let blocks: OcrResult["blocks"] | undefined;

    if (mode === "document") {
      const [res] = await this.client.documentTextDetection(request as any);
      const fullText = res.fullTextAnnotation?.text || "";
      rawText = fullText;

      // Try to compute an average confidence from pages/blocks if present
      const pageBlocks =
        res.fullTextAnnotation?.pages?.flatMap((p) => p.blocks || []) || [];

      if (pageBlocks.length > 0) {
        const confs = pageBlocks
          .map((b) => b.confidence)
          .filter((c): c is number => typeof c === "number");

        if (confs.length > 0) {
          confidence = confs.reduce((a, b) => a + b, 0) / confs.length;
        }

        // Optional: return blocks (trimmed)
        blocks = pageBlocks.slice(0, 120).map((b) => ({
          text:
            b.paragraphs
              ?.flatMap((p) => p.words || [])
              .flatMap((w) => w.symbols || [])
              .map((s) => s.text)
              .join("") || "",
          confidence: b.confidence ?? undefined,
          boundingBox:
            b.boundingBox?.vertices?.map((v) => ({
              x: v.x || 0,
              y: v.y || 0,
            })) || [],
        }));
      }
    } else {
      const [res] = await this.client.textDetection(request as any);
      rawText =
        res.fullTextAnnotation?.text ||
        (res.textAnnotations?.[0]?.description ?? "");
    }

    // Normalize output
    let text = rawText.replace(/\r\n/g, "\n");

    // Join hyphenated line breaks: "credi-\ncard" -> "credicard" (optional)
    if (stripHyphenLineBreaks) {
      text = text.replace(/(\w)-\n(\w)/g, "$1$2");
    }

    // Collapse excessive blank lines
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    // Cap size
    if (text.length > maxChars) {
      warnings.push("TRUNCATED_OUTPUT");
      text = text.slice(0, maxChars);
    }

    if (!text) warnings.push("NO_TEXT_DETECTED");

    return { text, confidence, blocks, warnings };
  }
}

// Singleton export (optional)
let _instance: GoogleVisionOcrService | null = null;

export function getGoogleVisionOcrService(): GoogleVisionOcrService {
  if (!_instance) _instance = new GoogleVisionOcrService();
  return _instance;
}

export default getGoogleVisionOcrService();
