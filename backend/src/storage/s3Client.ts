/**
 * S3 Client
 * AWS S3 storage client
 *
 * SECURITY:
 * - No static AWS credentials: uses IAM role / instance profile / env-based
 *   credential chain provided by the AWS SDK. Never embed access keys here.
 * - Server-side encryption with KMS (aws:kms). In production, KODA_KMS_KEY_ID
 *   must be set — the client will refuse to start without it.
 * - Presigned URL TTL shortened to 5 minutes (300s) to minimize exposure window.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpsAgent } from 'https';

const IS_PROD = process.env.NODE_ENV === 'production';

// Reuse TCP/TLS connections across requests
const requestHandler = new NodeHttpHandler({
  httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 25 }),
  connectionTimeout: 5_000,
  socketTimeout: 120_000,
});

// Let the SDK resolve credentials from the standard chain:
// env vars (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY), shared config,
// ECS task role, EC2 instance profile, etc.
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  requestHandler,
});

const BUCKET = process.env.S3_BUCKET_NAME || '';

const KMS_KEY_ID = process.env.KODA_KMS_KEY_ID || undefined;

// In production, KMS key is mandatory for at-rest encryption compliance
if (IS_PROD && !KMS_KEY_ID) {
  throw new Error('[S3] KODA_KMS_KEY_ID is required in production for server-side encryption');
}

/** Default presigned URL TTL: 5 minutes */
const DEFAULT_PRESIGNED_TTL = 300;

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'aws:kms',
    ...(KMS_KEY_ID ? { SSEKMSKeyId: KMS_KEY_ID } : {}),
  }));
  return key;
}

export async function getSignedDownloadUrl(key: string, expiresIn: number = DEFAULT_PRESIGNED_TTL): Promise<string> {
  // Cap presigned URL TTL in production
  const ttl = IS_PROD ? Math.min(expiresIn, DEFAULT_PRESIGNED_TTL) : expiresIn;
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: ttl });
}

export async function deleteFile(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}

export { s3Client };
