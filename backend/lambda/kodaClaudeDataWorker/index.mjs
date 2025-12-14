/**
 * Koda Claude Data Worker - Tier 2 Batch Generator
 * Atomic unit: 1 sub-intent × 1 data type × 1 language × 1 batch
 */

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ClaudeGenerator } from './generator.mjs';
import { getPromptBuilder } from './prompts.mjs';
import {
  INTENT_HIERARCHY,
  SUB_INTENT_DESCRIPTIONS,
  TIER2_TARGETS,
  DATA_TYPES,
  generateAllJobs,
  calculateTotalInvocations,
  getAllCombinations,
  getSubIntents
} from './schemas.mjs';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'koda-intelligence-datasets';

/**
 * Main Lambda Handler
 */
export async function handler(event) {
  console.log('Event:', JSON.stringify(event, null, 2));

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return errorResponse(500, 'CLAUDE_API_KEY not configured');
  }

  try {
    const action = event.action || 'generate-batch';

    switch (action) {
      case 'generate-batch':
        return await generateBatch(apiKey, event);

      case 'list-jobs':
        return await listJobs(event.language || 'en');

      case 'get-stats':
        return await getStats(event.language || 'en');

      case 'list-intents':
        return successResponse({
          intents: INTENT_HIERARCHY,
          subIntentDescriptions: SUB_INTENT_DESCRIPTIONS,
          dataTypes: DATA_TYPES,
          targets: TIER2_TARGETS,
          invocations: calculateTotalInvocations()
        });

      default:
        return errorResponse(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Handler error:', error);
    return errorResponse(500, error.message);
  }
}

/**
 * Generate a single batch (atomic unit)
 * S3 structure: intents/{intent}/{subIntent}/{dataType}/{language}/batch-{index}.json
 */
async function generateBatch(apiKey, job) {
  const { intent, subIntent, dataType, language, batchIndex, batchSize, jobId } = job;

  // Validate inputs
  if (!INTENT_HIERARCHY[intent]) {
    return errorResponse(400, `Invalid intent: ${intent}`);
  }
  if (!getSubIntents(intent).includes(subIntent)) {
    return errorResponse(400, `Invalid subIntent: ${subIntent} for ${intent}`);
  }
  if (!DATA_TYPES.includes(dataType)) {
    return errorResponse(400, `Invalid dataType: ${dataType}`);
  }

  const promptBuilder = getPromptBuilder(dataType);
  if (!promptBuilder) {
    return errorResponse(400, `No prompt builder for: ${dataType}`);
  }

  console.log(`Generating: ${intent}/${subIntent}/${dataType}/${language} batch ${batchIndex}`);

  // Build prompt
  const prompt = promptBuilder({
    intent,
    subIntent,
    language,
    batchSize: batchSize || TIER2_TARGETS[dataType].batchSize,
    batchIndex: batchIndex || 0
  });

  // Call Claude
  const generator = new ClaudeGenerator(apiKey);
  const result = await generator.generate(prompt);

  if (!result.success) {
    return errorResponse(500, `Claude API error: ${result.error}`);
  }

  // Validate JSON response
  let items = result.data;
  if (!Array.isArray(items)) {
    console.warn('Response not an array, attempting extraction');
    items = [];
  }

  // Build S3 key
  const batchNum = String(batchIndex || 0).padStart(3, '0');
  const s3Key = `intents/${intent}/${subIntent}/${dataType}/${language}/batch-${batchNum}.json`;

  // Save to S3
  const output = {
    jobId: jobId || `${intent}_${subIntent}_${dataType}_${language}_${batchNum}`,
    intent,
    subIntent,
    dataType,
    language,
    batchIndex: batchIndex || 0,
    items,
    itemCount: items.length,
    generatedAt: new Date().toISOString(),
    model: 'claude-sonnet-4-20250514',
    usage: result.usage
  };

  await saveToS3(s3Key, output);

  return successResponse({
    message: `Generated ${items.length} items`,
    jobId: output.jobId,
    s3Key,
    itemCount: items.length,
    usage: result.usage
  });
}

/**
 * List all jobs for orchestration
 */
async function listJobs(language) {
  const jobs = generateAllJobs(language);
  const stats = calculateTotalInvocations();

  return successResponse({
    language,
    totalJobs: jobs.length,
    stats,
    jobs
  });
}

/**
 * Get generation stats from S3
 */
async function getStats(language) {
  const stats = {
    language,
    intents: {},
    totalBatches: 0,
    totalItems: 0
  };

  for (const { intent, subIntent } of getAllCombinations()) {
    if (!stats.intents[intent]) {
      stats.intents[intent] = {};
    }
    stats.intents[intent][subIntent] = {};

    for (const dataType of DATA_TYPES) {
      const prefix = `intents/${intent}/${subIntent}/${dataType}/${language}/`;

      try {
        const listCmd = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix
        });
        const response = await s3Client.send(listCmd);
        const count = response.Contents?.length || 0;
        stats.intents[intent][subIntent][dataType] = count;
        stats.totalBatches += count;
      } catch (e) {
        stats.intents[intent][subIntent][dataType] = 0;
      }
    }
  }

  return successResponse(stats);
}

/**
 * Save to S3
 */
async function saveToS3(key, data) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  });
  await s3Client.send(command);
  console.log(`Saved: s3://${BUCKET_NAME}/${key}`);
}

/**
 * Response helpers
 */
function successResponse(data) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: true, ...data })
  };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: false, error: message })
  };
}
