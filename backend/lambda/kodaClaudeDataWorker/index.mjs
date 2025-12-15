/**
 * Koda Claude Data Worker - Production Lambda Handler
 * Supports: Documents D1-D16 + 14 Facets + Depths + Templates + Policies
 * With INTERNAL rate limiting via Redis (not just orchestrator)
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import {
  SYSTEM_PROMPT,
  getPromptBuilder,
  buildPatternsPrompt,
  buildKeywordsPrompt,
  buildDepthExamplesPrompt,
  buildOutputTemplatesPrompt,
  buildPoliciesPrompt
} from './documentsPrompts.mjs';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'koda-intelligence-datasets';

// Redis for rate limiting INSIDE Lambda
let redis = null;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }
  return redis;
}

// No internal rate limiting - orchestrator handles it via staggered starts

// Environment identity for safe regeneration
const APP_ENV = process.env.APP_ENV || 'data-gen';
const DATASET_VERSION = process.env.DATASET_VERSION || 'v1';
const S3_DATASET_PREFIX = process.env.S3_DATASET_PREFIX || 'document-intents';

// Claude configuration - Haiku 4.5 (800K output TPM)
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const CLAUDE_TEMPERATURE = parseFloat(process.env.CLAUDE_TEMPERATURE || '0.2'); // Low variance for valid JSON
const CLAUDE_MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '2048'); // Lower = more throughput (output TPM reserves full max_tokens)

// Worker identity for traceability
const WORKER_ID = process.env.AWS_LAMBDA_LOG_STREAM_NAME || `local_${Date.now()}`;

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
    const action = event.action || 'generate';

    switch (action) {
      case 'generate':
        return await generateBatch(apiKey, event);

      case 'health':
        return successResponse({ status: 'healthy', timestamp: new Date().toISOString() });

      default:
        return errorResponse(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Handler error:', error);
    return errorResponse(500, error.message);
  }
}

/**
 * Generate a single batch (atomic unit) with rate limiting
 */
async function generateBatch(apiKey, job) {
  const { jobId, artifactType, language, target, tier, part, count, depth, templates, policies, description, depthDescription, totalTarget } = job;

  console.log(`Generating: ${jobId}`);

  // Build prompt based on artifact type
  let userPrompt;

  if (artifactType === 'documents_patterns' || artifactType === 'documents_facets_patterns') {
    userPrompt = buildPatternsPrompt({ language, target, tier, count, part, description, artifactType });
  } else if (artifactType === 'documents_keywords' || artifactType === 'documents_facets_keywords') {
    userPrompt = buildKeywordsPrompt({ language, target, count, part, description, artifactType });
  } else if (artifactType === 'documents_depth_examples') {
    userPrompt = buildDepthExamplesPrompt({ language, target, depth, count, part, description, depthDescription });
  } else if (artifactType === 'documents_output_templates') {
    userPrompt = buildOutputTemplatesPrompt({ templates });
  } else if (artifactType === 'documents_policies') {
    userPrompt = buildPoliciesPrompt({ policies });
  } else {
    return errorResponse(400, `Unknown artifactType: ${artifactType}`);
  }

  // Call Claude API - orchestrator handles rate limiting via staggered starts
  const anthropic = new Anthropic({ apiKey });
  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      temperature: CLAUDE_TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const durationMs = Date.now() - startTime;
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    console.log(`[${jobId}] Success: ${inputTokens}+${outputTokens} tokens, ${durationMs}ms`);

    const text = response.content[0]?.text || '';

    // Parse JSON response
    let parsedData;
    try {
      // Try to find JSON object in response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON object found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      console.error('Raw response:', text.substring(0, 500));
      return errorResponse(500, `JSON parse error: ${parseError.message}`);
    }

    // Build S3 key based on artifact type
    let s3Key;
    if (artifactType === 'documents_output_templates' || artifactType === 'documents_policies') {
      s3Key = `documents/${artifactType}.json`;
    } else {
      const partStr = String(part || 0).padStart(2, '0');
      if (tier) {
        s3Key = `documents/${artifactType}/${language}/${target}/${tier}/part${partStr}.json`;
      } else if (depth) {
        s3Key = `documents/${artifactType}/${language}/${target}/${depth}/part${partStr}.json`;
      } else {
        s3Key = `documents/${artifactType}/${language}/${target}/part${partStr}.json`;
      }
    }

    // Add metadata
    const output = {
      ...parsedData,
      generatedAt: new Date().toISOString(),
      model: CLAUDE_MODEL,
      usage: response.usage
    };

    // Save to S3
    await saveToS3(s3Key, output);

    // Extract item count
    const itemCount = parsedData.items?.length || parsedData.templates?.length || parsedData.policies?.length || 0;

    return successResponse({
      message: `Generated ${itemCount} items`,
      jobId,
      s3Key,
      items: parsedData.items || parsedData.templates || parsedData.policies || [],
      itemCount,
      usage: response.usage
    });

  } catch (error) {
    console.error('Claude API error:', error);

    // Handle rate limit errors (429) - return ACTUAL error message for debugging
    if (error.status === 429 || error.message?.includes('rate') || error.message?.includes('Rate')) {
      const errorDetail = error.error?.message || error.message || 'Unknown rate limit';
      console.log(`[${jobId}] Rate limited: ${errorDetail}`);
      return errorResponse(429, `Rate limit: ${errorDetail}`);
    }

    return errorResponse(500, `Claude API error: ${error.message}`);
  }
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
