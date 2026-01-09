/**
 * Koda Claude Data Worker - Cloud Run HTTP Server
 * Koda Cognitive Intelligence v4.0
 * 50,232 items across 3 languages
 */

import http from 'http';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, buildPrompt } from './documentsPrompts.mjs';
import { buildConversationPrompt } from './conversationPrompts.mjs';
import { buildHelpPrompt } from './helpPrompts.mjs';

// Claude configuration
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const CLAUDE_TEMPERATURE = parseFloat(process.env.CLAUDE_TEMPERATURE || '0.2');
const CLAUDE_MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '2048');

const PORT = process.env.PORT || 8080;

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  // Only accept POST to /generate
  if (req.method !== 'POST' || !req.url.startsWith('/generate')) {
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
    return;
  }

  try {
    // Parse request body
    const body = await parseBody(req);
    const result = await handleGenerate(body);
    res.writeHead(result.statusCode);
    res.end(result.body);
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: error.message }));
  }
});

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle generation request
 */
async function handleGenerate(job) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return errorResponse(500, 'CLAUDE_API_KEY not configured');
  }

  const { jobId, artifactType } = job;

  console.log(`Generating: ${jobId}`);

  // Build prompt based on intent
  let userPrompt;
  if (job.intent === 'conversation') {
    userPrompt = buildConversationPrompt(job);
  } else if (job.intent === 'help') {
    userPrompt = buildHelpPrompt(job);
  } else if (job.intent === 'documents') {
    userPrompt = buildPrompt(job);
  } else {
    // Fallback to unified builder
    userPrompt = buildPrompt(job);
  }

  // Call Claude API
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

    // Add metadata
    const output = {
      ...parsedData,
      generatedAt: new Date().toISOString(),
      model: CLAUDE_MODEL,
      usage: response.usage
    };

    const itemCount = parsedData.items?.length || parsedData.templates?.length || parsedData.policies?.length || 0;

    // Return data in response (orchestrator will save locally)
    return successResponse({
      message: `Generated ${itemCount} items`,
      jobId,
      data: output,
      itemCount,
      usage: response.usage
    });

  } catch (error) {
    console.error('Claude API error:', error);

    if (error.status === 429 || error.message?.includes('rate') || error.message?.includes('Rate')) {
      const errorDetail = error.error?.message || error.message || 'Unknown rate limit';
      console.log(`[${jobId}] Rate limited: ${errorDetail}`);
      return errorResponse(429, `Rate limit: ${errorDetail}`);
    }

    return errorResponse(500, `Claude API error: ${error.message}`);
  }
}

/**
 * Response helpers
 */
function successResponse(data) {
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, ...data })
  };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    body: JSON.stringify({ success: false, error: message })
  };
}

// Start server
server.listen(PORT, () => {
  console.log(`Cloud Run worker listening on port ${PORT}`);
});
