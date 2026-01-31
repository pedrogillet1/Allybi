/**
 * CloudConvert PPTX → PDF Conversion Service
 *
 * Uses the CloudConvert API to convert PPTX files to PDF with high-fidelity
 * rendering (custom fonts, auto-fit text, SmartArt, etc.).
 *
 * Pipeline: PPTX buffer → base64 import → convert (pptx→pdf) → export URL → download PDF
 */

import CloudConvert from 'cloudconvert';
import { config } from '../../config/env';

export interface CloudConvertResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
}

let clientInstance: CloudConvert | null = null;

function getClient(): CloudConvert {
  if (!clientInstance) {
    if (!config.CLOUDCONVERT_API_KEY) {
      throw new Error('CLOUDCONVERT_API_KEY is not set');
    }
    clientInstance = new CloudConvert(config.CLOUDCONVERT_API_KEY);
  }
  return clientInstance;
}

/**
 * Convert a PPTX buffer to PDF via CloudConvert.
 *
 * Creates a job with three tasks:
 *   1. import/base64  — upload the PPTX
 *   2. convert        — pptx → pdf (office engine)
 *   3. export/url     — get a temporary download link
 *
 * Then downloads the resulting PDF and returns it as a Buffer.
 */
export async function convertPptxToPdf(
  fileBuffer: Buffer,
  filename: string,
): Promise<CloudConvertResult> {
  const startTime = Date.now();

  try {
    const client = getClient();

    console.log(`[CloudConvert] Starting PPTX→PDF conversion for "${filename}" (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

    // Create a job: import → convert → export
    const job = await client.jobs.create({
      tasks: {
        'import-pptx': {
          operation: 'import/base64' as const,
          file: fileBuffer.toString('base64'),
          filename,
        },
        'convert-to-pdf': {
          operation: 'convert' as const,
          input: 'import-pptx',
          input_format: 'pptx',
          output_format: 'pdf',
          engine: 'office',
        },
        'export-pdf': {
          operation: 'export/url' as const,
          input: 'convert-to-pdf',
        },
      },
    });

    console.log(`[CloudConvert] Job created: ${job.id}, waiting for completion...`);

    // Wait for the job to finish (polling)
    const finishedJob = await client.jobs.wait(job.id);

    // Check job status
    if (finishedJob.status === 'error') {
      const failedTask = finishedJob.tasks.find(t => t.status === 'error');
      const errorMsg = failedTask?.message || 'Unknown CloudConvert error';
      console.error(`[CloudConvert] Job failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    // Get the export URLs
    const exportUrls = client.jobs.getExportUrls(finishedJob);

    if (!exportUrls.length || !exportUrls[0].url) {
      console.error('[CloudConvert] No export URL returned');
      return { success: false, error: 'No export URL in CloudConvert response' };
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
      `[CloudConvert] Conversion complete: "${filename}" → PDF ` +
      `(${(pdfBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`
    );

    return { success: true, pdfBuffer };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const error = err.message || 'Unknown CloudConvert error';
    console.error(`[CloudConvert] Conversion failed after ${duration}ms: ${error}`);
    return { success: false, error };
  }
}

/**
 * Check whether CloudConvert is configured (API key present).
 */
export function isCloudConvertAvailable(): boolean {
  return !!config.CLOUDCONVERT_API_KEY;
}
