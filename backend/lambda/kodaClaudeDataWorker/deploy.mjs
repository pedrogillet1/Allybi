/**
 * Deploy Lambda function using AWS SDK
 */

import 'dotenv/config';
import { LambdaClient, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda';
import { readFileSync } from 'fs';

const LAMBDA_FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || 'kodaClaudeDataWorker';
const REGION = process.env.AWS_REGION || 'us-east-2';

async function deploy() {
  console.log('Deploying Lambda function...');
  console.log(`  Function: ${LAMBDA_FUNCTION_NAME}`);
  console.log(`  Region: ${REGION}`);

  const lambdaClient = new LambdaClient({ region: REGION });

  // Read the zip file
  const zipFile = readFileSync('./function.zip');
  console.log(`  Package size: ${(zipFile.length / 1024 / 1024).toFixed(2)} MB`);

  const command = new UpdateFunctionCodeCommand({
    FunctionName: LAMBDA_FUNCTION_NAME,
    ZipFile: zipFile
  });

  try {
    const response = await lambdaClient.send(command);
    console.log('\nDeployment successful!');
    console.log(`  Version: ${response.Version}`);
    console.log(`  Last modified: ${response.LastModified}`);
    console.log(`  Code size: ${(response.CodeSize / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  }
}

deploy();
