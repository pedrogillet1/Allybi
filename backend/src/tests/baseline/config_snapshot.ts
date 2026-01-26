/**
 * Baseline Config Snapshot
 *
 * Records the exact state of routing patterns, content guard, language detector,
 * answer composer rules, and validation policies at the time of mass testing setup.
 *
 * Purpose: Prevent "tests pass today, fail tomorrow" confusion by tracking
 * which version of config files the tests were designed against.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FileChecksum {
  path: string;
  md5: string;
  size: number;
  lastModified: string;
}

export interface BaselineSnapshot {
  version: string;
  createdAt: string;
  gitCommit: string;
  gitBranch: string;
  description: string;

  // Core data files
  dataFiles: FileChecksum[];

  // Core service files
  serviceFiles: FileChecksum[];

  // Key configuration values (extracted from JSON)
  config: {
    intentPatternCount: number;
    // routingTiebreakerCount ARCHIVED
    answerStyleCount: number;
    scopeRuleCount: number;
    fallbackCount: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE LISTS TO TRACK
// ═══════════════════════════════════════════════════════════════════════════

const DATA_FILES = [
  'src/data_banks/routing/intent_patterns.runtime.any.json',
  // routing_tiebreakers.json ARCHIVED - dead code removed
  'src/data_banks/rendering/answer_styles.any.json',
  'src/data_banks/scope/scope_rules.any.json',
  'src/data_banks/routing/fallback_router.any.json',
  'src/data_banks/semantics/pattern_bank_master.any.json',
  'src/data_banks/normalizers/language_profiles.any.json',
  'src/data_banks/policies/retrieval_policies.any.json',
  'src/data_banks/policies/capabilities_catalog.any.json',
  'src/data_banks/semantics/synonym_expansion.any.json',
];

const SERVICE_FILES = [
  'src/services/core/contentGuard.service.ts',
  'src/services/core/languageDetector.service.ts',
  'src/services/core/answerComposer.service.ts',
  'src/services/core/kodaIntentEngineV3.service.ts',
  'src/services/core/kodaOrchestratorV3.service.ts',
  'src/services/core/decisionTree.service.ts',
  'src/services/core/completionGate.service.ts',
  'src/services/core/coherenceGate.service.ts',
  'src/services/core/evidenceGate.service.ts',
  'src/services/formatting/answerPlanner.service.ts',
  'src/services/formatting/highlightPolicy.service.ts',
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getFileMd5(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch {
    return 'FILE_NOT_FOUND';
  }
}

function getFileStats(filePath: string): { size: number; lastModified: string } {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      lastModified: stats.mtime.toISOString(),
    };
  } catch {
    return { size: 0, lastModified: 'UNKNOWN' };
  }
}

function getFileChecksum(relativePath: string, basePath: string): FileChecksum {
  const fullPath = path.join(basePath, relativePath);
  const stats = getFileStats(fullPath);
  return {
    path: relativePath,
    md5: getFileMd5(fullPath),
    size: stats.size,
    lastModified: stats.lastModified,
  };
}

function countJsonArrayOrObject(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.length;
    if (typeof parsed === 'object') return Object.keys(parsed).length;
    return 0;
  } catch {
    return -1;
  }
}

function getGitInfo(basePath: string): { commit: string; branch: string } {
  try {
    const { execSync } = require('child_process');
    const commit = execSync('git rev-parse HEAD', { cwd: basePath }).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: basePath }).toString().trim();
    return { commit, branch };
  } catch {
    return { commit: 'UNKNOWN', branch: 'UNKNOWN' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT CREATION
// ═══════════════════════════════════════════════════════════════════════════

export function createSnapshot(basePath: string, description: string): BaselineSnapshot {
  const gitInfo = getGitInfo(basePath);

  const dataFiles = DATA_FILES.map(f => getFileChecksum(f, basePath));
  const serviceFiles = SERVICE_FILES.map(f => getFileChecksum(f, basePath));

  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    gitCommit: gitInfo.commit,
    gitBranch: gitInfo.branch,
    description,

    dataFiles,
    serviceFiles,

    config: {
      intentPatternCount: countJsonArrayOrObject(path.join(basePath, 'src/data_banks/routing/intent_patterns.runtime.any.json')),
      // routingTiebreakerCount ARCHIVED - dead code removed
      answerStyleCount: countJsonArrayOrObject(path.join(basePath, 'src/data_banks/rendering/answer_styles.any.json')),
      scopeRuleCount: countJsonArrayOrObject(path.join(basePath, 'src/data_banks/scope/scope_rules.any.json')),
      fallbackCount: countJsonArrayOrObject(path.join(basePath, 'src/data_banks/routing/fallback_router.any.json')),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT COMPARISON
// ═══════════════════════════════════════════════════════════════════════════

export interface SnapshotDiff {
  hasChanges: boolean;
  changedDataFiles: string[];
  changedServiceFiles: string[];
  configChanges: Record<string, { before: number; after: number }>;
}

export function compareSnapshots(baseline: BaselineSnapshot, current: BaselineSnapshot): SnapshotDiff {
  const changedDataFiles: string[] = [];
  const changedServiceFiles: string[] = [];
  const configChanges: Record<string, { before: number; after: number }> = {};

  // Compare data files
  for (const baseFile of baseline.dataFiles) {
    const currFile = current.dataFiles.find(f => f.path === baseFile.path);
    if (!currFile || currFile.md5 !== baseFile.md5) {
      changedDataFiles.push(baseFile.path);
    }
  }

  // Compare service files
  for (const baseFile of baseline.serviceFiles) {
    const currFile = current.serviceFiles.find(f => f.path === baseFile.path);
    if (!currFile || currFile.md5 !== baseFile.md5) {
      changedServiceFiles.push(baseFile.path);
    }
  }

  // Compare config counts
  for (const key of Object.keys(baseline.config) as (keyof typeof baseline.config)[]) {
    if (baseline.config[key] !== current.config[key]) {
      configChanges[key] = {
        before: baseline.config[key],
        after: current.config[key],
      };
    }
  }

  return {
    hasChanges: changedDataFiles.length > 0 || changedServiceFiles.length > 0 || Object.keys(configChanges).length > 0,
    changedDataFiles,
    changedServiceFiles,
    configChanges,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const SNAPSHOT_FILE = 'src/tests/baseline/BASELINE_SNAPSHOT.json';

export function saveSnapshot(snapshot: BaselineSnapshot, basePath: string): void {
  const filePath = path.join(basePath, SNAPSHOT_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.log(`Baseline snapshot saved to ${SNAPSHOT_FILE}`);
}

export function loadSnapshot(basePath: string): BaselineSnapshot | null {
  const filePath = path.join(basePath, SNAPSHOT_FILE);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as BaselineSnapshot;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export function validateAgainstBaseline(basePath: string): {
  valid: boolean;
  message: string;
  diff?: SnapshotDiff;
} {
  const baseline = loadSnapshot(basePath);
  if (!baseline) {
    return {
      valid: false,
      message: 'No baseline snapshot found. Run createAndSaveBaseline() first.',
    };
  }

  const current = createSnapshot(basePath, 'Current state validation');
  const diff = compareSnapshots(baseline, current);

  if (diff.hasChanges) {
    const changes: string[] = [];
    if (diff.changedDataFiles.length > 0) {
      changes.push(`Data files changed: ${diff.changedDataFiles.join(', ')}`);
    }
    if (diff.changedServiceFiles.length > 0) {
      changes.push(`Service files changed: ${diff.changedServiceFiles.join(', ')}`);
    }
    if (Object.keys(diff.configChanges).length > 0) {
      changes.push(`Config changes: ${JSON.stringify(diff.configChanges)}`);
    }

    return {
      valid: false,
      message: `Baseline drift detected:\n${changes.join('\n')}`,
      diff,
    };
  }

  return {
    valid: true,
    message: `Baseline valid. Commit: ${baseline.gitCommit.slice(0, 8)}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function createAndSaveBaseline(basePath: string, description: string): void {
  const snapshot = createSnapshot(basePath, description);
  saveSnapshot(snapshot, basePath);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' BASELINE SNAPSHOT CREATED');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Version: ${snapshot.version}`);
  console.log(`  Created: ${snapshot.createdAt}`);
  console.log(`  Git Commit: ${snapshot.gitCommit}`);
  console.log(`  Git Branch: ${snapshot.gitBranch}`);
  console.log(`  Description: ${snapshot.description}`);
  console.log('');
  console.log('  Config Summary:');
  console.log(`    - Intent Patterns: ${snapshot.config.intentPatternCount}`);
  console.log(`    - Answer Styles: ${snapshot.config.answerStyleCount}`);
  console.log(`    - Scope Rules: ${snapshot.config.scopeRuleCount}`);
  console.log(`    - Fallbacks: ${snapshot.config.fallbackCount}`);
  console.log('');
  console.log(`  Data Files Tracked: ${snapshot.dataFiles.length}`);
  console.log(`  Service Files Tracked: ${snapshot.serviceFiles.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Run if executed directly
if (require.main === module) {
  const basePath = path.resolve(__dirname, '../../..');
  createAndSaveBaseline(basePath, 'ChatGPT-parity mass testing baseline');
}
