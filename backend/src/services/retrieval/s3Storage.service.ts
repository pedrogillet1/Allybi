// src/services/storage/s3Storage.service.ts
/**
 * S3 Storage Service (clean + centralized)
 * - Simple upload/download/delete
 * - Presigned URL upload/download
 * - Multipart upload helpers
 * - LocalStack/MinIO support via endpoint + forcePathStyle
 *
 * Notes:
 * - Does NOT crash at import time if env is missing. It fails when methods are called.
 * - Uses strong typing + consistent error messages.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { Readable } from 'stream';

export type S3StorageConfig = {
  region: string;
  bucket: string;

  // Credentials (optional for some local setups if using instance roles, etc.)
  accessKeyId?: string;
  secretAccessKey?: string;

  // LocalStack/MinIO support
  endpoint?: string; // e.g. http://localhost:4566
  forcePathStyle?: boolean;

  // Defaults
  presignedUrlExpiresSeconds: number; // e.g. 3600
  serverSideEncryption?: 'AES256' | 'aws:kms' | undefined;
};

export class S3StorageError extends Error {
  public readonly code:
    | 'S3_NOT_CONFIGURED'
    | 'S3_UPLOAD_FAILED'
    | 'S3_DOWNLOAD_FAILED'
    | 'S3_DELETE_FAILED'
    | 'S3_HEAD_FAILED'
    | 'S3_PRESIGN_FAILED'
    | 'S3_MULTIPART_FAILED';

  public readonly cause?: unknown;

  constructor(
    code: S3StorageError['code'],
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'S3StorageError';
    this.code = code;
    this.cause = cause;
  }
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function envBool(v: string | undefined): boolean {
  return (v || '').toLowerCase() === 'true';
}

function loadConfigFromEnv(): S3StorageConfig {
  const region = process.env.AWS_REGION || 'us-east-1';
  const bucket = process.env.AWS_S3_BUCKET || 'koda-user-file';

  return {
    region,
    bucket,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
    forcePathStyle: envBool(process.env.AWS_S3_FORCE_PATH_STYLE),
    presignedUrlExpiresSeconds: Number(process.env.S3_PRESIGN_EXPIRES || 3600),
    serverSideEncryption: 'AES256',
  };
}

/**
 * Centralized S3 storage service.
 * Use one instance via DI/container in production, or export default singleton.
 */
export class S3StorageService {
  private client: S3Client | null = null;
  private readonly cfg: S3StorageConfig;

  constructor(cfg?: Partial<S3StorageConfig>) {
    this.cfg = { ...loadConfigFromEnv(), ...(cfg || {}) };
  }

  /**
   * Lazy init client so missing env doesn't crash import/boot.
   */
  private ensureClient(): S3Client {
    if (this.client) return this.client;

    // If endpoint is set (LocalStack/MinIO), credentials may still be required depending on setup.
    // For AWS real usage, credentials must exist unless you rely on instance roles.
    const hasExplicitCreds = !!(this.cfg.accessKeyId && this.cfg.secretAccessKey);

    // Reuse TCP/TLS connections across requests — critical for batch downloads
    // Higher values for VPS deployments with network latency
    const maxSockets = parseInt(process.env.S3_MAX_SOCKETS || '50', 10);
    const connectionTimeout = parseInt(process.env.S3_CONNECTION_TIMEOUT_MS || '10000', 10);
    const socketTimeout = parseInt(process.env.S3_SOCKET_TIMEOUT_MS || '300000', 10); // 5 min for large files
    const keepAliveOpts = { keepAlive: true, maxSockets };
    const requestHandler = new NodeHttpHandler({
      httpAgent: new HttpAgent(keepAliveOpts),
      httpsAgent: new HttpsAgent(keepAliveOpts),
      connectionTimeout,
      socketTimeout,
    });

    const clientConfig: S3ClientConfig = {
      region: this.cfg.region,
      requestHandler,
      ...(this.cfg.endpoint ? { endpoint: this.cfg.endpoint } : {}),
      ...(this.cfg.forcePathStyle ? { forcePathStyle: true } : {}),
      ...(hasExplicitCreds
        ? {
            credentials: {
              accessKeyId: this.cfg.accessKeyId!,
              secretAccessKey: this.cfg.secretAccessKey!,
            },
          }
        : {}),
    };

    this.client = new S3Client(clientConfig);
    return this.client;
  }

  private assertConfigured(): void {
    if (!this.cfg.bucket) {
      throw new S3StorageError(
        'S3_NOT_CONFIGURED',
        'S3 bucket is not configured (AWS_S3_BUCKET).'
      );
    }
  }

  // ===========================================================================
  // BASIC FILE OPS
  // ===========================================================================

  async uploadFile(params: {
    key: string;
    buffer: Buffer;
    mimeType: string;
    cacheControl?: string;
  }): Promise<{ key: string }> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.mimeType,
        CacheControl: params.cacheControl,
        ...(this.cfg.serverSideEncryption
          ? { ServerSideEncryption: this.cfg.serverSideEncryption }
          : {}),
      });

      await s3.send(cmd);
      return { key: params.key };
    } catch (err) {
      throw new S3StorageError(
        'S3_UPLOAD_FAILED',
        `Failed to upload to S3 (key="${params.key}").`,
        err
      );
    }
  }

  async downloadFile(params: {
    key: string;
  }): Promise<{ buffer: Buffer; mimeType: string }> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
      });

      const res = await s3.send(cmd);

      const body = res.Body;
      if (!body) {
        throw new Error('S3 returned empty body.');
      }

      const stream = body as Readable;
      const buffer = await streamToBuffer(stream);
      const mimeType = res.ContentType || 'application/octet-stream';

      return { buffer, mimeType };
    } catch (err) {
      throw new S3StorageError(
        'S3_DOWNLOAD_FAILED',
        `Failed to download from S3 (key="${params.key}").`,
        err
      );
    }
  }

  async deleteFile(params: { key: string }): Promise<void> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new DeleteObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
      });

      await s3.send(cmd);
    } catch (err) {
      throw new S3StorageError(
        'S3_DELETE_FAILED',
        `Failed to delete from S3 (key="${params.key}").`,
        err
      );
    }
  }

  async fileExists(params: { key: string }): Promise<boolean> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new HeadObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
      });

      await s3.send(cmd);
      return true;
    } catch (err: any) {
      // AWS SDK v3: NotFound can be 404 or specific name depending on provider
      const name = err?.name || '';
      const status = err?.$metadata?.httpStatusCode;
      if (name === 'NotFound' || status === 404) return false;

      throw new S3StorageError(
        'S3_HEAD_FAILED',
        `Failed to check existence in S3 (key="${params.key}").`,
        err
      );
    }
  }

  async getFileMetadata(params: { key: string }): Promise<{
    size?: number;
    mimeType?: string;
    lastModified?: Date;
    etag?: string;
  }> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new HeadObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
      });

      const res = await s3.send(cmd);

      return {
        size: res.ContentLength,
        mimeType: res.ContentType,
        lastModified: res.LastModified,
        etag: res.ETag,
      };
    } catch (err) {
      throw new S3StorageError(
        'S3_HEAD_FAILED',
        `Failed to read metadata from S3 (key="${params.key}").`,
        err
      );
    }
  }

  // ===========================================================================
  // PRESIGNED URLS
  // ===========================================================================

  async presignUpload(params: {
    key: string;
    mimeType: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string }> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        ContentType: params.mimeType,
        ...(this.cfg.serverSideEncryption
          ? { ServerSideEncryption: this.cfg.serverSideEncryption }
          : {}),
      });

      const url = await getSignedUrl(s3, cmd, {
        expiresIn: params.expiresInSeconds ?? this.cfg.presignedUrlExpiresSeconds,
      });

      return { url };
    } catch (err) {
      throw new S3StorageError(
        'S3_PRESIGN_FAILED',
        `Failed to presign upload URL (key="${params.key}").`,
        err
      );
    }
  }

  async presignDownload(params: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string }> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
      });

      const url = await getSignedUrl(s3, cmd, {
        expiresIn: params.expiresInSeconds ?? this.cfg.presignedUrlExpiresSeconds,
      });

      return { url };
    } catch (err) {
      throw new S3StorageError(
        'S3_PRESIGN_FAILED',
        `Failed to presign download URL (key="${params.key}").`,
        err
      );
    }
  }

  // ===========================================================================
  // MULTIPART UPLOAD
  // ===========================================================================

  async createMultipartUpload(params: {
    key: string;
    mimeType: string;
  }): Promise<{ uploadId: string }> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new CreateMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        ContentType: params.mimeType,
        ...(this.cfg.serverSideEncryption
          ? { ServerSideEncryption: this.cfg.serverSideEncryption }
          : {}),
      });

      const res = await s3.send(cmd);
      if (!res.UploadId) {
        throw new Error('S3 did not return UploadId.');
      }

      return { uploadId: res.UploadId };
    } catch (err) {
      throw new S3StorageError(
        'S3_MULTIPART_FAILED',
        `Failed to create multipart upload (key="${params.key}").`,
        err
      );
    }
  }

  async presignUploadPart(params: {
    key: string;
    uploadId: string;
    partNumber: number; // 1-indexed
    expiresInSeconds?: number;
  }): Promise<{ url: string }> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new UploadPartCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        PartNumber: params.partNumber,
      });

      const url = await getSignedUrl(s3, cmd, {
        expiresIn: params.expiresInSeconds ?? this.cfg.presignedUrlExpiresSeconds,
      });

      return { url };
    } catch (err) {
      throw new S3StorageError(
        'S3_MULTIPART_FAILED',
        `Failed to presign upload part URL (key="${params.key}", part=${params.partNumber}).`,
        err
      );
    }
  }

  async presignUploadParts(params: {
    key: string;
    uploadId: string;
    partNumbers: number[];
    expiresInSeconds?: number;
  }): Promise<{ urls: Array<{ partNumber: number; url: string }> }> {
    const urls = await Promise.all(
      params.partNumbers.map(async (partNumber) => {
        const { url } = await this.presignUploadPart({
          key: params.key,
          uploadId: params.uploadId,
          partNumber,
          expiresInSeconds: params.expiresInSeconds,
        });
        return { partNumber, url };
      })
    );

    return { urls };
  }

  async completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: CompletedPart[]; // must include ETag + PartNumber
  }): Promise<void> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const sortedParts = [...params.parts].sort(
        (a, b) => (a.PartNumber || 0) - (b.PartNumber || 0)
      );

      const cmd = new CompleteMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        MultipartUpload: { Parts: sortedParts },
      });

      await s3.send(cmd);
    } catch (err) {
      throw new S3StorageError(
        'S3_MULTIPART_FAILED',
        `Failed to complete multipart upload (key="${params.key}").`,
        err
      );
    }
  }

  async abortMultipartUpload(params: {
    key: string;
    uploadId: string;
  }): Promise<void> {
    this.assertConfigured();
    const s3 = this.ensureClient();

    try {
      const cmd = new AbortMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: params.key,
        UploadId: params.uploadId,
      });

      await s3.send(cmd);
    } catch (err) {
      // Abort is best-effort cleanup: don't throw a second error that hides original failures.
      // Still keep structured error if you want to log upstream.
    }
  }
}

// Default singleton (optional) – prefer DI in your container
const s3Storage = new S3StorageService();
export default s3Storage;
