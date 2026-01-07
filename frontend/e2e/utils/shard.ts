/**
 * Shard Utility - Splits test questions into parallel shards
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TestQuestion {
  id: string;
  text: string;
  expectType: 'list' | 'count' | 'metadata' | 'summary' | 'content' | 'extraction' | 'fileAction' | 'comparison' | 'table';
  followUp: boolean;
}

export interface TestManifest {
  suiteName: string;
  shardSize: number;
  questions: TestQuestion[];
}

export interface Shard {
  shardIndex: number;
  shardName: string;
  questions: TestQuestion[];
}

/**
 * Load the test manifest from JSON file
 */
export function loadManifest(manifestPath: string): TestManifest {
  const fullPath = path.resolve(__dirname, '..', manifestPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as TestManifest;
}

/**
 * Split questions into shards of specified size
 * Ensures follow-up questions stay with their context question
 */
export function createShards(manifest: TestManifest): Shard[] {
  const shards: Shard[] = [];
  const { questions, shardSize, suiteName } = manifest;

  let currentShard: TestQuestion[] = [];
  let shardIndex = 0;

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    currentShard.push(question);

    // Check if we should close this shard
    // Don't break in the middle of follow-up sequences
    const nextQuestion = questions[i + 1];
    const isEndOfFollowUp = !nextQuestion || !nextQuestion.followUp;
    const isShardFull = currentShard.length >= shardSize;

    if (isShardFull && isEndOfFollowUp) {
      shards.push({
        shardIndex,
        shardName: `${suiteName}_shard_${String(shardIndex + 1).padStart(2, '0')}`,
        questions: [...currentShard]
      });
      currentShard = [];
      shardIndex++;
    }
  }

  // Push remaining questions
  if (currentShard.length > 0) {
    shards.push({
      shardIndex,
      shardName: `${suiteName}_shard_${String(shardIndex + 1).padStart(2, '0')}`,
      questions: [...currentShard]
    });
  }

  return shards;
}

/**
 * Get a specific shard by index
 */
export function getShard(manifest: TestManifest, shardIndex: number): Shard | null {
  const shards = createShards(manifest);
  return shards[shardIndex] || null;
}

/**
 * Get total number of shards
 */
export function getShardCount(manifest: TestManifest): number {
  return createShards(manifest).length;
}

// Export for CLI usage
if (require.main === module) {
  const manifest = loadManifest('manifests/questions_en.json');
  const shards = createShards(manifest);

  console.log(`Suite: ${manifest.suiteName}`);
  console.log(`Total questions: ${manifest.questions.length}`);
  console.log(`Shard size: ${manifest.shardSize}`);
  console.log(`Total shards: ${shards.length}`);
  console.log('');

  shards.forEach(shard => {
    console.log(`${shard.shardName}: ${shard.questions.length} questions (${shard.questions[0].id} - ${shard.questions[shard.questions.length - 1].id})`);
  });
}
