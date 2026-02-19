#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), 'src');

const checks = [
  {
    file: 'services/llm/core/llmChatEngine.ts',
    patterns: [
      /SYSTEM_PROMPT\s*=/,
      /You are Allybi, an intelligent document assistant/,
    ],
    reason: 'llmChatEngine must not embed root system prompts.',
  },
  {
    file: 'modules/chat/application/chat-runtime.service.ts',
    patterns: [
      /chatRuntime\.legacy\.service/,
      /LegacyChatRuntimeService/,
    ],
    reason: 'Centralized runtime must not import legacy chat runtime path.',
  },
  {
    file: 'modules/chat/runtime/CentralizedChatRuntimeDelegate.ts',
    patterns: [
      /\bYou are\b/,
    ],
    reason: 'Centralized runtime must not embed root system prompts.',
  },
];

const failures = [];

for (const check of checks) {
  const fullPath = path.join(ROOT, check.file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`[missing] ${check.file} (${check.reason})`);
    continue;
  }

  const src = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of check.patterns) {
    if (pattern.test(src)) {
      failures.push(`[match] ${check.file}: ${pattern} (${check.reason})`);
    }
  }
}

if (failures.length) {
  console.error('Prompt lint failed:\n' + failures.map((f) => `- ${f}`).join('\n'));
  process.exit(1);
}

console.log('Prompt lint passed.');
