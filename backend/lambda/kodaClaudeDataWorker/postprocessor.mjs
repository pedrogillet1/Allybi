/**
 * Post-Processor - Validates and merges batches into final datasets
 * Run: node postprocessor.mjs --language en
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { INTENT_HIERARCHY, DATA_TYPES, getAllCombinations } from './schemas.mjs';

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'koda-intelligence-datasets';
const REGION = process.env.AWS_REGION || 'us-east-2';

const s3Client = new S3Client({ region: REGION });

/**
 * Get all batch files for a specific path
 */
async function getBatchFiles(prefix) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix
  });

  const response = await s3Client.send(command);
  return response.Contents?.map(obj => obj.Key) || [];
}

/**
 * Read JSON from S3
 */
async function readS3Json(key) {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const response = await s3Client.send(command);
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (error) {
    console.error(`Error reading ${key}:`, error.message);
    return null;
  }
}

/**
 * Write JSON to S3
 */
async function writeS3Json(key, data) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  });
  await s3Client.send(command);
}

/**
 * Validate items based on data type
 */
function validateItems(items, dataType) {
  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const item of items) {
    // Skip nulls and empty
    if (!item) {
      invalid.push({ item, reason: 'null or empty' });
      continue;
    }

    // For strings (keywords, examples, patterns, etc.)
    if (typeof item === 'string') {
      const normalized = item.toLowerCase().trim();

      // Skip duplicates
      if (seen.has(normalized)) {
        invalid.push({ item, reason: 'duplicate' });
        continue;
      }

      // Skip too short
      if (item.length < 2) {
        invalid.push({ item, reason: 'too short' });
        continue;
      }

      // Validate patterns (try to compile regex)
      if (dataType === 'patterns') {
        try {
          new RegExp(item, 'i');
        } catch (e) {
          invalid.push({ item, reason: 'invalid regex' });
          continue;
        }
      }

      seen.add(normalized);
      valid.push(item);
    }
    // For objects (validation rules)
    else if (typeof item === 'object') {
      if (item.type && item.condition) {
        valid.push(item);
      } else {
        invalid.push({ item, reason: 'missing required fields' });
      }
    }
  }

  return { valid, invalid };
}

/**
 * Merge and validate all batches for a sub-intent
 */
async function processSubIntent(intent, subIntent, language) {
  const results = {};

  for (const dataType of DATA_TYPES) {
    const prefix = `intents/${intent}/${subIntent}/${dataType}/${language}/`;
    const batchFiles = await getBatchFiles(prefix);

    if (batchFiles.length === 0) {
      results[dataType] = { status: 'no_batches', count: 0 };
      continue;
    }

    // Read all batches
    const allItems = [];
    let totalUsage = { inputTokens: 0, outputTokens: 0 };

    for (const file of batchFiles) {
      const batch = await readS3Json(file);
      if (batch && Array.isArray(batch.items)) {
        allItems.push(...batch.items);
        if (batch.usage) {
          totalUsage.inputTokens += batch.usage.inputTokens || 0;
          totalUsage.outputTokens += batch.usage.outputTokens || 0;
        }
      }
    }

    // Validate
    const { valid, invalid } = validateItems(allItems, dataType);

    results[dataType] = {
      status: 'processed',
      batches: batchFiles.length,
      raw: allItems.length,
      valid: valid.length,
      invalid: invalid.length,
      usage: totalUsage
    };

    // Save merged file
    const mergedKey = `processed/${language}/${intent}/${subIntent}/${dataType}.json`;
    await writeS3Json(mergedKey, {
      intent,
      subIntent,
      dataType,
      language,
      items: valid,
      count: valid.length,
      processedAt: new Date().toISOString(),
      stats: {
        batches: batchFiles.length,
        rawCount: allItems.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        deduped: allItems.length - valid.length - invalid.length
      },
      usage: totalUsage
    });

    console.log(`  ${dataType}: ${valid.length}/${allItems.length} valid`);
  }

  return results;
}

/**
 * Create final combined dataset for Koda
 */
async function createFinalDataset(language) {
  console.log('\nCreating final combined dataset...');

  const dataset = {
    version: '2.0',
    language,
    generatedAt: new Date().toISOString(),
    intents: {}
  };

  let totalKeywords = 0;
  let totalPatterns = 0;
  let totalExamples = 0;

  for (const { intent, subIntent } of getAllCombinations()) {
    if (!dataset.intents[intent]) {
      dataset.intents[intent] = {
        description: INTENT_HIERARCHY[intent].description,
        subIntents: {}
      };
    }

    const subIntentData = {
      keywords: [],
      patterns: [],
      examples: [],
      edge_cases: [],
      negatives: [],
      validation: []
    };

    for (const dataType of DATA_TYPES) {
      const key = `processed/${language}/${intent}/${subIntent}/${dataType}.json`;
      const data = await readS3Json(key);
      if (data && Array.isArray(data.items)) {
        subIntentData[dataType] = data.items;
      }
    }

    dataset.intents[intent].subIntents[subIntent] = subIntentData;
    totalKeywords += subIntentData.keywords.length;
    totalPatterns += subIntentData.patterns.length;
    totalExamples += subIntentData.examples.length;
  }

  dataset.stats = {
    totalKeywords,
    totalPatterns,
    totalExamples,
    totalIntents: Object.keys(dataset.intents).length,
    totalSubIntents: getAllCombinations().length
  };

  // Save final dataset
  const finalKey = `final/${language}/intent_dataset_v2.json`;
  await writeS3Json(finalKey, dataset);

  console.log(`\nFinal dataset saved to: s3://${BUCKET_NAME}/${finalKey}`);
  console.log(`  Keywords: ${totalKeywords}`);
  console.log(`  Patterns: ${totalPatterns}`);
  console.log(`  Examples: ${totalExamples}`);

  return dataset;
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const languageIdx = args.indexOf('--language');
  const language = languageIdx !== -1 ? args[languageIdx + 1] : 'en';

  console.log('='.repeat(60));
  console.log('KODA Post-Processor - Validate & Merge');
  console.log('='.repeat(60));
  console.log(`Language: ${language}\n`);

  const allResults = {};

  for (const { intent, subIntent } of getAllCombinations()) {
    console.log(`\nProcessing ${intent}/${subIntent}...`);
    const results = await processSubIntent(intent, subIntent, language);
    allResults[`${intent}/${subIntent}`] = results;
  }

  // Create final dataset
  await createFinalDataset(language);

  // Save processing report
  const reportKey = `reports/${language}/processing_report_${Date.now()}.json`;
  await writeS3Json(reportKey, {
    language,
    processedAt: new Date().toISOString(),
    results: allResults
  });

  console.log('\n' + '='.repeat(60));
  console.log('POST-PROCESSING COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
