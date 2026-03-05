export type WorkerJobType = "extract" | "embed" | "preview" | "ocr";

export interface WorkerStorageLocation {
  provider?: "gcs" | "s3";
  bucket?: string;
  key: string;
}

export interface WorkerJobPayload {
  jobType: WorkerJobType;
  jobId?: string;
  userId: string;
  documentId: string;
  mimeType: string;
  filename?: string;
  langHint?: string;
  attempt?: number;
  storage?: WorkerStorageLocation;
}

export interface WorkerResponse {
  success: boolean;
  jobType: WorkerJobType;
  documentId: string;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
  [key: string]: unknown;
}
