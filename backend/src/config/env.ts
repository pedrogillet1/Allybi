import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local first (local dev overrides), then .env as base.
// dotenv won't overwrite vars that are already set, so .env.local wins.
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

// Safety guard: prevent local dev from accidentally using production DB
if (
  process.env.NODE_ENV !== 'production' &&
  process.env.DATABASE_URL?.includes('supabase.com') &&
  !process.env.ALLOW_REMOTE_DB
) {
  console.warn(
    '\x1b[33m[DEV SAFETY] Using remote Supabase DB in dev mode. ' +
    'Set ALLOW_REMOTE_DB=1 in .env to silence this warning, ' +
    'or use .env.local with a local Postgres.\x1b[0m'
  );
}

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRY: string;
  JWT_REFRESH_EXPIRY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  APPLE_CLIENT_ID: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
  APPLE_CALLBACK_URL: string;
  FRONTEND_URL: string;
  ENCRYPTION_KEY: string;
  // AWS
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_S3_BUCKET: string;
  // GCS
  GCS_BUCKET_NAME: string;
  GCS_PROJECT_ID: string;
  GCS_KEY_FILE: string;
  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  REDIS_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  // Workers
  WORKER_CONCURRENCY: number;
  // Email & SMS (Infobip)
  INFOBIP_API_KEY: string;
  INFOBIP_BASE_URL: string;
  EMAIL_FROM: string;
  // AI / LLM
  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string;
  MISTRAL_API_KEY: string;
  CLAUDE_API_KEY: string;
  // Search
  GOOGLE_SEARCH_API_KEY: string;
  GOOGLE_SEARCH_ENGINE_ID: string;
  // Vector DB
  PINECONE_API_KEY: string;
  PINECONE_INDEX_NAME: string;
  // Financial APIs
  ALPHA_VANTAGE_API_KEY: string;
  FRED_API_KEY: string;
  NEWS_API_KEY: string;
  // Admin
  JWT_ADMIN_ACCESS_SECRET: string;
  JWT_ADMIN_REFRESH_SECRET: string;
  JWT_ADMIN_ACCESS_EXPIRY: string;
  JWT_ADMIN_REFRESH_EXPIRY: string;
  // Encryption / Security
  KODA_KEY_PROVIDER: string;
  KODA_MASTER_KEY_BASE64: string;
  KODA_KMS_KEY_ID: string;
  KODA_REFRESH_PEPPER: string;
  KODA_OWNER_ADMIN_ID: string;
  KODA_ADMIN_KEY: string;
  // CloudConvert
  CLOUDCONVERT_API_KEY: string;
  // Google Drive
  GOOGLE_DRIVE_FOLDER_ID: string;
}

const getEnvVar = (key: string, required: boolean = true): string => {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value || '';
};

export const config: EnvConfig = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: getEnvVar('DATABASE_URL'),
  JWT_ACCESS_SECRET: getEnvVar('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: getEnvVar('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '24h',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
  GOOGLE_CLIENT_ID: getEnvVar('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: getEnvVar('GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: getEnvVar('GOOGLE_CALLBACK_URL'),
  APPLE_CLIENT_ID: getEnvVar('APPLE_CLIENT_ID', false),
  APPLE_TEAM_ID: getEnvVar('APPLE_TEAM_ID', false),
  APPLE_KEY_ID: getEnvVar('APPLE_KEY_ID', false),
  APPLE_PRIVATE_KEY: getEnvVar('APPLE_PRIVATE_KEY', false),
  APPLE_CALLBACK_URL: getEnvVar('APPLE_CALLBACK_URL', false),
  FRONTEND_URL: getEnvVar('FRONTEND_URL'),
  ENCRYPTION_KEY: getEnvVar('ENCRYPTION_KEY'),
  // AWS
  AWS_REGION: process.env.AWS_REGION || 'us-east-2',
  AWS_ACCESS_KEY_ID: getEnvVar('AWS_ACCESS_KEY_ID', false),
  AWS_SECRET_ACCESS_KEY: getEnvVar('AWS_SECRET_ACCESS_KEY', false),
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'koda-user-file',
  // GCS
  GCS_BUCKET_NAME: getEnvVar('GCS_BUCKET_NAME'),
  GCS_PROJECT_ID: getEnvVar('GCS_PROJECT_ID'),
  GCS_KEY_FILE: getEnvVar('GCS_KEY_FILE'),
  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: getEnvVar('REDIS_PASSWORD', false),
  REDIS_URL: getEnvVar('REDIS_URL', false),
  UPSTASH_REDIS_REST_URL: getEnvVar('UPSTASH_REDIS_REST_URL', false),
  UPSTASH_REDIS_REST_TOKEN: getEnvVar('UPSTASH_REDIS_REST_TOKEN', false),
  // Workers
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
  // Email & SMS (Infobip)
  INFOBIP_API_KEY: getEnvVar('INFOBIP_API_KEY', false),
  INFOBIP_BASE_URL: process.env.INFOBIP_BASE_URL || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'info@getkoda.ai',
  // AI / LLM
  OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY'),
  GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY', false),
  MISTRAL_API_KEY: getEnvVar('MISTRAL_API_KEY', false),
  CLAUDE_API_KEY: getEnvVar('CLAUDE_API_KEY', false),
  // Search
  GOOGLE_SEARCH_API_KEY: getEnvVar('GOOGLE_SEARCH_API_KEY', false),
  GOOGLE_SEARCH_ENGINE_ID: getEnvVar('GOOGLE_SEARCH_ENGINE_ID', false),
  // Vector DB
  PINECONE_API_KEY: getEnvVar('PINECONE_API_KEY'),
  PINECONE_INDEX_NAME: getEnvVar('PINECONE_INDEX_NAME'),
  // Financial APIs
  ALPHA_VANTAGE_API_KEY: getEnvVar('ALPHA_VANTAGE_API_KEY', false),
  FRED_API_KEY: getEnvVar('FRED_API_KEY', false),
  NEWS_API_KEY: getEnvVar('NEWS_API_KEY', false),
  JWT_ADMIN_ACCESS_SECRET: process.env.JWT_ADMIN_ACCESS_SECRET || getEnvVar('JWT_ACCESS_SECRET'),
  JWT_ADMIN_REFRESH_SECRET: process.env.JWT_ADMIN_REFRESH_SECRET || getEnvVar('JWT_REFRESH_SECRET'),
  JWT_ADMIN_ACCESS_EXPIRY: process.env.JWT_ADMIN_ACCESS_EXPIRY || '15m',
  JWT_ADMIN_REFRESH_EXPIRY: process.env.JWT_ADMIN_REFRESH_EXPIRY || '7d',
  KODA_KEY_PROVIDER: process.env.KODA_KEY_PROVIDER || 'local',
  KODA_MASTER_KEY_BASE64: getEnvVar('KODA_MASTER_KEY_BASE64', false),
  KODA_KMS_KEY_ID: getEnvVar('KODA_KMS_KEY_ID', false),
  KODA_REFRESH_PEPPER: getEnvVar('KODA_REFRESH_PEPPER', false),
  KODA_OWNER_ADMIN_ID: getEnvVar('KODA_OWNER_ADMIN_ID', false),
  KODA_ADMIN_KEY: getEnvVar('KODA_ADMIN_KEY', false),
  // CloudConvert
  CLOUDCONVERT_API_KEY: getEnvVar('CLOUDCONVERT_API_KEY', false),
  // Google Drive
  GOOGLE_DRIVE_FOLDER_ID: getEnvVar('GOOGLE_DRIVE_FOLDER_ID', false),
};
