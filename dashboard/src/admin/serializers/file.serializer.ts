// file: src/admin/serializers/file.serializer.ts
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FilesSerialized = {
  v: 1;
  total: number;
  files: Array<{
    documentId: string;
    userId: string | null;
    userEmailMasked: string | null;
    userEmailHash: string | null;
    encrypted: boolean;
    sizeBytes: number;
    format: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'image' | 'text' | 'other';
    uploadedAt: string | null;
    chunksCount: number | null;
    status: 'uploaded' | 'processing' | 'ready' | 'failed';
    previewStatus?: 'none' | 'processing' | 'ready' | 'failed';
  }>;
  charts?: {
    uploadsByType?: Array<{
      day: string;
      pdf: number;
      docx: number;
      pptx: number;
      xlsx: number;
      image: number;
      text: number;
      other: number;
    }>;
    processingSuccess?: Array<{ day: string; completed: number; failed: number }>;
    avgProcessingMsByType?: Array<{ type: string; valueMs: number }>;
  };
};

type RawFileInput = {
  id?: string;
  documentId?: string;
  userId?: string;
  userEmail?: string;
  email?: string;
  encrypted?: boolean;
  isEncrypted?: boolean;
  sizeBytes?: number;
  size?: number;
  fileSize?: number;
  format?: string;
  mimeType?: string;
  type?: string;
  extension?: string;
  uploadedAt?: string | Date;
  createdAt?: string | Date;
  chunksCount?: number;
  chunkCount?: number;
  status?: string;
  processingStatus?: string;
  previewStatus?: string;
};

type RawFilesInput = {
  total?: number;
  files?: RawFileInput[];
  documents?: RawFileInput[];
  charts?: {
    uploadsByType?: Array<{
      day?: string | Date;
      pdf?: number;
      docx?: number;
      pptx?: number;
      xlsx?: number;
      image?: number;
      text?: number;
      other?: number;
    }>;
    processingSuccess?: Array<{
      day?: string | Date;
      completed?: number;
      success?: number;
      failed?: number;
      failure?: number;
    }>;
    avgProcessingMsByType?: Array<{
      type?: string;
      format?: string;
      valueMs?: number;
      avgMs?: number;
    }>;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPepper(): string {
  return process.env.TELEMETRY_HASH_PEPPER ?? '';
}

function hashValue(val: string): string {
  const pepper = getPepper();
  return createHash('sha256')
    .update(pepper + val)
    .digest('hex');
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '***@***.***';

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf('.');

  const maskedLocal = local.length <= 2 ? local[0] + '***' : local.slice(0, 2) + '***';

  let maskedDomain: string;
  if (dotIndex < 1) {
    maskedDomain = domain.length <= 2 ? domain[0] + '***' : domain.slice(0, 2) + '***';
  } else {
    const domainName = domain.slice(0, dotIndex);
    const tld = domain.slice(dotIndex);
    const maskedDomainName = domainName.length <= 2 ? domainName[0] + '***' : domainName.slice(0, 2) + '***';
    maskedDomain = maskedDomainName + tld;
  }

  return `${maskedLocal}@${maskedDomain}`;
}

function toIsoStringOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function toDayString(val: unknown): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function toNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  return fallback;
}

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  return null;
}

function toStringOrNull(val: unknown): string | null {
  if (typeof val === 'string' && val.length > 0) return val;
  return null;
}

const FORMAT_MAP: Record<string, FilesSerialized['files'][0]['format']> = {
  pdf: 'pdf',
  'application/pdf': 'pdf',
  docx: 'docx',
  doc: 'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  pptx: 'pptx',
  ppt: 'pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'pptx',
  xlsx: 'xlsx',
  xls: 'xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  txt: 'text',
  md: 'text',
  markdown: 'text',
  json: 'text',
  csv: 'text',
  'text/plain': 'text',
  'text/markdown': 'text',
  'application/json': 'text',
  'text/csv': 'text',
};

function normalizeFormat(val: unknown): FilesSerialized['files'][0]['format'] {
  if (typeof val !== 'string') return 'other';
  const lower = val.toLowerCase().trim();
  return FORMAT_MAP[lower] ?? 'other';
}

function normalizeStatus(val: unknown): FilesSerialized['files'][0]['status'] {
  if (typeof val !== 'string') return 'uploaded';
  const lower = val.toLowerCase().trim();
  if (lower === 'uploaded' || lower === 'pending' || lower === 'queued') return 'uploaded';
  if (lower === 'processing' || lower === 'in_progress' || lower === 'inprogress') return 'processing';
  if (lower === 'ready' || lower === 'complete' || lower === 'completed' || lower === 'success' || lower === 'done')
    return 'ready';
  if (lower === 'failed' || lower === 'error' || lower === 'failure') return 'failed';
  return 'uploaded';
}

function normalizePreviewStatus(val: unknown): FilesSerialized['files'][0]['previewStatus'] {
  if (typeof val !== 'string') return 'none';
  const lower = val.toLowerCase().trim();
  if (lower === 'none' || lower === 'pending' || lower === '') return 'none';
  if (lower === 'processing' || lower === 'in_progress' || lower === 'inprogress') return 'processing';
  if (lower === 'ready' || lower === 'complete' || lower === 'completed' || lower === 'success' || lower === 'done')
    return 'ready';
  if (lower === 'failed' || lower === 'error' || lower === 'failure') return 'failed';
  return 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export function serializeFile(raw: unknown): FilesSerialized['files'][0] {
  const input = (raw ?? {}) as RawFileInput;

  const documentId =
    typeof input.documentId === 'string' ? input.documentId : typeof input.id === 'string' ? input.id : '';
  const userId = toStringOrNull(input.userId);
  const email =
    typeof input.userEmail === 'string' && input.userEmail.includes('@')
      ? input.userEmail
      : typeof input.email === 'string' && input.email.includes('@')
        ? input.email
        : null;

  const format = normalizeFormat(input.format ?? input.mimeType ?? input.type ?? input.extension);

  return {
    documentId,
    userId,
    userEmailMasked: email ? maskEmail(email) : null,
    userEmailHash: email ? hashValue(email.toLowerCase()) : null,
    encrypted: input.encrypted === true || input.isEncrypted === true,
    sizeBytes: toNumber(input.sizeBytes ?? input.size ?? input.fileSize, 0),
    format,
    uploadedAt: toIsoStringOrNull(input.uploadedAt) ?? toIsoStringOrNull(input.createdAt),
    chunksCount: toNullableNumber(input.chunksCount ?? input.chunkCount),
    status: normalizeStatus(input.status ?? input.processingStatus),
    previewStatus: normalizePreviewStatus(input.previewStatus),
  };
}

export function serializeFiles(raw: unknown): FilesSerialized {
  const input = (raw ?? {}) as RawFilesInput;
  const rawFiles = input.files ?? input.documents ?? [];
  const charts = input.charts;

  const serializedFiles = rawFiles.map((f) => serializeFile(f));

  const result: FilesSerialized = {
    v: 1,
    total: toNumber(input.total, serializedFiles.length),
    files: serializedFiles,
  };

  if (charts) {
    result.charts = {};

    if (charts.uploadsByType) {
      result.charts.uploadsByType = charts.uploadsByType.map((item) => ({
        day: toDayString(item?.day),
        pdf: toNumber(item?.pdf, 0),
        docx: toNumber(item?.docx, 0),
        pptx: toNumber(item?.pptx, 0),
        xlsx: toNumber(item?.xlsx, 0),
        image: toNumber(item?.image, 0),
        text: toNumber(item?.text, 0),
        other: toNumber(item?.other, 0),
      }));
    }

    if (charts.processingSuccess) {
      result.charts.processingSuccess = charts.processingSuccess.map((item) => ({
        day: toDayString(item?.day),
        completed: toNumber(item?.completed ?? item?.success, 0),
        failed: toNumber(item?.failed ?? item?.failure, 0),
      }));
    }

    if (charts.avgProcessingMsByType) {
      result.charts.avgProcessingMsByType = charts.avgProcessingMsByType.map((item) => ({
        type: typeof item?.type === 'string' ? item.type : typeof item?.format === 'string' ? item.format : 'unknown',
        valueMs: toNumber(item?.valueMs ?? item?.avgMs, 0),
      }));
    }
  }

  return result;
}
