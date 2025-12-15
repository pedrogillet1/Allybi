import dotenv from 'dotenv';

dotenv.config();

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
  GCS_BUCKET_NAME: string;
  GCS_PROJECT_ID: string;
  GCS_KEY_FILE: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  RESEND_API_KEY: string;
  SENDGRID_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string;
  PINECONE_API_KEY: string;
  PINECONE_INDEX_NAME: string;
  ALPHA_VANTAGE_API_KEY: string;
  FRED_API_KEY: string;
  NEWS_API_KEY: string;
  MISTRAL_API_KEY: string;
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
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
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
  GCS_BUCKET_NAME: getEnvVar('GCS_BUCKET_NAME'),
  GCS_PROJECT_ID: getEnvVar('GCS_PROJECT_ID'),
  GCS_KEY_FILE: getEnvVar('GCS_KEY_FILE'),
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: getEnvVar('REDIS_PASSWORD', false),
  UPSTASH_REDIS_REST_URL: getEnvVar('UPSTASH_REDIS_REST_URL', false),
  UPSTASH_REDIS_REST_TOKEN: getEnvVar('UPSTASH_REDIS_REST_TOKEN', false),
  RESEND_API_KEY: getEnvVar('RESEND_API_KEY', false),
  SENDGRID_API_KEY: getEnvVar('SENDGRID_API_KEY', false),
  TWILIO_ACCOUNT_SID: getEnvVar('TWILIO_ACCOUNT_SID', false),
  TWILIO_AUTH_TOKEN: getEnvVar('TWILIO_AUTH_TOKEN', false),
  TWILIO_PHONE_NUMBER: getEnvVar('TWILIO_PHONE_NUMBER', false),
  OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY'),
  GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY', false),
  PINECONE_API_KEY: getEnvVar('PINECONE_API_KEY'),
  PINECONE_INDEX_NAME: getEnvVar('PINECONE_INDEX_NAME'),
  ALPHA_VANTAGE_API_KEY: getEnvVar('ALPHA_VANTAGE_API_KEY', false),
  FRED_API_KEY: getEnvVar('FRED_API_KEY', false),
  NEWS_API_KEY: getEnvVar('NEWS_API_KEY', false),
  MISTRAL_API_KEY: getEnvVar('MISTRAL_API_KEY', false),
};
