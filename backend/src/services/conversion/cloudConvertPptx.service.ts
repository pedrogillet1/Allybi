/**
 * CloudConvert Office → PDF Conversion Service
 *
 * Uses the CloudConvert API to convert Office documents (PPTX, DOCX, XLSX, etc.)
 * to PDF with high-fidelity rendering. Replaces LibreOffice for all formats.
 *
 * Pipeline: file buffer → base64 import → convert (X→pdf) → export URL → download PDF
 */

import CloudConvert from "cloudconvert";
import { config } from "../../config/env";

export interface CloudConvertResult {
  success: boolean;
  pdfBuffer?: Buffer;
  docxBuffer?: Buffer;
  error?: string;
}

let clientInstance: CloudConvert | null = null;

function getClient(): CloudConvert {
  if (!clientInstance) {
    if (!config.CLOUDCONVERT_API_KEY) {
      throw new Error("CLOUDCONVERT_API_KEY is not set");
    }
    clientInstance = new CloudConvert(config.CLOUDCONVERT_API_KEY);
  }
  return clientInstance;
}

/**
 * Map MIME type to CloudConvert input_format string.
 */
const MIME_TO_FORMAT: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/pdf": "pdf",
  "application/rtf": "rtf",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
};

/**
 * Derive the CloudConvert input format from filename extension or MIME type.
 */
function resolveInputFormat(
  filename: string,
  mimeType?: string,
): string | null {
  // Try MIME type first
  if (mimeType && MIME_TO_FORMAT[mimeType]) {
    return MIME_TO_FORMAT[mimeType];
  }
  // Fallback to extension
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && Object.values(MIME_TO_FORMAT).includes(ext)) {
    return ext;
  }
  return null;
}

/**
 * Convert an Office document buffer to PDF via CloudConvert.
 *
 * Creates a job with three tasks:
 *   1. import/base64  — upload the file
 *   2. convert        — X → pdf (office engine)
 *   3. export/url     — get a temporary download link
 *
 * Then downloads the resulting PDF and returns it as a Buffer.
 */
export async function convertToPdf(
  fileBuffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<CloudConvertResult> {
  const startTime = Date.now();

  try {
    const client = getClient();
    const inputFormat = resolveInputFormat(filename, mimeType);

    if (!inputFormat) {
      return {
        success: false,
        error: `Unsupported format for CloudConvert: ${mimeType || filename}`,
      };
    }

    console.log(
      `[CloudConvert] Starting ${inputFormat}→PDF conversion for "${filename}" (${(fileBuffer.length / 1024).toFixed(1)} KB)`,
    );

    // Create a job: import → convert → export
    const job = await client.jobs.create({
      tasks: {
        "import-file": {
          operation: "import/base64" as const,
          file: fileBuffer.toString("base64"),
          filename,
        },
        "convert-to-pdf": {
          operation: "convert" as const,
          input: "import-file",
          input_format: inputFormat,
          output_format: "pdf",
          engine: "office",
        },
        "export-pdf": {
          operation: "export/url" as const,
          input: "convert-to-pdf",
        },
      },
    });

    console.log(
      `[CloudConvert] Job created: ${job.id}, waiting for completion...`,
    );

    // Wait for the job to finish (polling)
    const finishedJob = await client.jobs.wait(job.id);

    // Check job status
    if (finishedJob.status === "error") {
      const failedTask = finishedJob.tasks.find((t) => t.status === "error");
      const errorMsg = failedTask?.message || "Unknown CloudConvert error";
      console.error(`[CloudConvert] Job failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    // Get the export URLs
    const exportUrls = client.jobs.getExportUrls(finishedJob);

    if (!exportUrls.length || !exportUrls[0].url) {
      console.error("[CloudConvert] No export URL returned");
      return {
        success: false,
        error: "No export URL in CloudConvert response",
      };
    }

    const downloadUrl = exportUrls[0].url;
    console.log(`[CloudConvert] Downloading PDF from export URL...`);

    // Download the PDF
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      const error = `Failed to download PDF: HTTP ${response.status}`;
      console.error(`[CloudConvert] ${error}`);
      return { success: false, error };
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    const duration = Date.now() - startTime;

    console.log(
      `[CloudConvert] Conversion complete: "${filename}" (${inputFormat}) → PDF ` +
        `(${(pdfBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`,
    );

    return { success: true, pdfBuffer };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const error = err.message || "Unknown CloudConvert error";
    console.error(
      `[CloudConvert] Conversion failed after ${duration}ms: ${error}`,
    );
    return { success: false, error };
  }
}

/**
 * Convert a document buffer to DOCX via CloudConvert.
 * This is used for export flows (e.g., PDF/PPTX/XLSX -> DOCX) when enabled.
 */
export async function convertToDocx(
  fileBuffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<CloudConvertResult> {
  const startTime = Date.now();

  try {
    const client = getClient();
    const inputFormat = resolveInputFormat(filename, mimeType);

    if (!inputFormat) {
      return {
        success: false,
        error: `Unsupported format for CloudConvert: ${mimeType || filename}`,
      };
    }

    console.log(
      `[CloudConvert] Starting ${inputFormat}→DOCX conversion for "${filename}" (${(fileBuffer.length / 1024).toFixed(1)} KB)`,
    );

    const convertTask: Record<string, unknown> = {
      operation: "convert",
      input: "import-file",
      input_format: inputFormat,
      output_format: "docx",
    };

    // CloudConvert "office" engine is appropriate for office inputs; for pdf, omit engine to let CC choose.
    if (inputFormat !== "pdf") {
      convertTask.engine = "office";
    }

    const job = await client.jobs.create({
      tasks: {
        "import-file": {
          operation: "import/base64" as const,
          file: fileBuffer.toString("base64"),
          filename,
        },
        "convert-to-docx": convertTask as any,
        "export-docx": {
          operation: "export/url" as const,
          input: "convert-to-docx",
        },
      },
    });

    const finishedJob = await client.jobs.wait(job.id);

    if (finishedJob.status === "error") {
      const failedTask = finishedJob.tasks.find((t) => t.status === "error");
      const errorMsg = failedTask?.message || "Unknown CloudConvert error";
      console.error(`[CloudConvert] DOCX job failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    const exportUrls = client.jobs.getExportUrls(finishedJob);
    if (!exportUrls.length || !exportUrls[0].url) {
      console.error("[CloudConvert] No export URL returned for DOCX");
      return {
        success: false,
        error: "No export URL in CloudConvert response",
      };
    }

    const downloadUrl = exportUrls[0].url;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      const error = `Failed to download DOCX: HTTP ${response.status}`;
      console.error(`[CloudConvert] ${error}`);
      return { success: false, error };
    }

    const docxBuffer = Buffer.from(await response.arrayBuffer());
    const duration = Date.now() - startTime;

    console.log(
      `[CloudConvert] Conversion complete: "${filename}" (${inputFormat}) → DOCX ` +
        `(${(docxBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`,
    );

    return { success: true, docxBuffer };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const error = err.message || "Unknown CloudConvert error";
    console.error(
      `[CloudConvert] DOCX conversion failed after ${duration}ms: ${error}`,
    );
    return { success: false, error };
  }
}

/**
 * Legacy alias — kept for backward compatibility.
 */
export const convertPptxToPdf = convertToPdf;

/**
 * Check whether CloudConvert is configured (API key present).
 */
export function isCloudConvertAvailable(): boolean {
  return !!config.CLOUDCONVERT_API_KEY;
}
