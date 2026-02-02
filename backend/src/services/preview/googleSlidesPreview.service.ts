/**
 * Google Slides Preview Service
 *
 * Uses Google Drive API + Slides API to convert PPTX files to PDF
 * with native Google rendering (highest fidelity for presentations).
 *
 * Prerequisites:
 *   1. Google Cloud project with Drive API + Slides API enabled
 *   2. Service account JSON key file
 *   3. Shared Drive folder for temporary uploads
 *
 * Env vars:
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service account JSON key
 *   GOOGLE_SLIDES_FOLDER_ID        — Drive folder ID for temp uploads
 *
 * Pipeline:
 *   1. Upload PPTX to Google Drive (converts to Google Slides)
 *   2. Export as PDF via Drive API
 *   3. Delete temp file from Drive
 *   4. Return PDF buffer
 */

import { google } from 'googleapis';
import { Readable } from 'stream';

export interface GoogleSlidesResult {
  success: boolean;
  pdfBuffer?: Buffer;
  slideCount?: number;
  error?: string;
}

let authInstance: any = null;

function getAuth() {
  if (!authInstance) {
    authInstance = new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/presentations.readonly',
      ],
    });
  }
  return authInstance;
}

/**
 * Check whether Google Slides conversion is configured.
 */
export function isGoogleSlidesAvailable(): boolean {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    process.env.GOOGLE_SLIDES_FOLDER_ID
  );
}

/**
 * Convert a PPTX buffer to PDF via Google Drive + Slides API.
 */
export async function convertPptxViaSlidesApi(
  fileBuffer: Buffer,
  filename: string,
): Promise<GoogleSlidesResult> {
  const startTime = Date.now();
  let uploadedFileId: string | null = null;

  try {
    if (!isGoogleSlidesAvailable()) {
      return { success: false, error: 'Google Slides API not configured' };
    }

    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    console.log(`[GoogleSlides] Uploading "${filename}" to Google Drive...`);

    // 1. Upload PPTX to Drive — auto-converts to Google Slides format
    const uploaded = await drive.files.create({
      requestBody: {
        name: `preview-${Date.now()}-${filename}`,
        mimeType: 'application/vnd.google-apps.presentation',
        parents: [process.env.GOOGLE_SLIDES_FOLDER_ID!],
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        body: Readable.from(fileBuffer),
      },
      fields: 'id',
    });

    uploadedFileId = uploaded.data.id!;
    console.log(`[GoogleSlides] Uploaded as Google Slides: ${uploadedFileId}`);

    // 2. Export as PDF
    console.log(`[GoogleSlides] Exporting as PDF...`);
    const pdfResponse = await drive.files.export(
      { fileId: uploadedFileId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    );

    const pdfBuffer = Buffer.from(pdfResponse.data as ArrayBuffer);
    const duration = Date.now() - startTime;

    console.log(
      `[GoogleSlides] Conversion complete: "${filename}" → PDF ` +
      `(${(pdfBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`
    );

    return { success: true, pdfBuffer };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const error = err.message || 'Google Slides conversion failed';
    console.error(`[GoogleSlides] Failed after ${duration}ms: ${error}`);
    return { success: false, error };
  } finally {
    // 3. Clean up — delete temp file from Drive
    if (uploadedFileId) {
      try {
        const auth = getAuth();
        const drive = google.drive({ version: 'v3', auth });
        await drive.files.delete({ fileId: uploadedFileId });
        console.log(`[GoogleSlides] Cleaned up temp file: ${uploadedFileId}`);
      } catch (cleanupErr: any) {
        console.warn(`[GoogleSlides] Cleanup failed (non-fatal): ${cleanupErr.message}`);
      }
    }
  }
}
