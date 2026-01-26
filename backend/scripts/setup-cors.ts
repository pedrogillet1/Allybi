/**
 * AWS S3 CORS Configuration Script
 * Sets up CORS rules to allow localhost and production origins to access the S3 bucket
 *
 * Usage: npx ts-node src/scripts/setup-cors.ts
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'koda-user-file';

async function setupCORS() {
  console.log('🚀 Setting up CORS for AWS S3 bucket...\n');

  // Validate credentials
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS credentials not found!');
    console.error('   Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in .env');
    process.exit(1);
  }

  // Create S3 client
  const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
  });

  // CORS configuration
  const corsConfiguration = {
    CORSRules: [
      {
        // Development origins
        AllowedOrigins: [
          // Production
          'https://getkoda.ai',
          'https://www.getkoda.ai',
          'https://app.getkoda.ai',
          // Development
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:5000',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:5000'
        ],
        AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
        AllowedHeaders: [
          '*'
        ],
        ExposeHeaders: [
          'ETag',
          'Content-Length',
          'Content-Type',
          'Content-Disposition',
          'Content-Range',
          'x-amz-request-id',
          'x-amz-id-2'
        ],
        MaxAgeSeconds: 3600
      }
    ]
  };

  try {
    // Apply CORS configuration
    const putCommand = new PutBucketCorsCommand({
      Bucket: AWS_S3_BUCKET,
      CORSConfiguration: corsConfiguration
    });

    await s3Client.send(putCommand);
    console.log('✅ CORS configuration applied successfully!\n');

    // Verify by reading back the configuration
    const getCommand = new GetBucketCorsCommand({
      Bucket: AWS_S3_BUCKET
    });

    const response = await s3Client.send(getCommand);

    console.log('📋 Current CORS Configuration:');
    console.log('─'.repeat(50));
    console.log(`   Bucket: ${AWS_S3_BUCKET}`);
    console.log(`   Region: ${AWS_REGION}`);
    console.log('');
    console.log('   Allowed Origins:');
    response.CORSRules?.[0]?.AllowedOrigins?.forEach(origin => {
      console.log(`     • ${origin}`);
    });
    console.log('');
    console.log('   Allowed Methods:');
    console.log(`     • ${response.CORSRules?.[0]?.AllowedMethods?.join(', ')}`);
    console.log('');
    console.log('   Max Age: 3600 seconds (1 hour)');
    console.log('─'.repeat(50));
    console.log('\n✅ Your localhost can now access the S3 bucket for document previews!');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error setting CORS configuration:', error.message);

    if (error.name === 'AccessDenied') {
      console.error('\n💡 Tip: Make sure your AWS credentials have s3:PutBucketCors permission');
    }

    process.exit(1);
  }
}

setupCORS();
