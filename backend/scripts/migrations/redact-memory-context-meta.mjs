#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toStringArray(value, maxItems = 32) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const next = String(raw || "").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeRecallEntry(entry) {
  const record = asObject(entry);
  const role =
    String(record.role || "").toLowerCase() === "assistant"
      ? "assistant"
      : "user";
  const messageId = String(record.messageId || "").trim();
  const intentFamily = String(record.intentFamily || "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 48);
  const sourceDocumentIds = toStringArray(record.sourceDocumentIds, 24);
  const sourceCount = Math.max(
    0,
    Number(record.sourceCount || sourceDocumentIds.length) || 0,
  );
  const createdAt = String(record.createdAt || "").trim();
  const contentHash = String(record.contentHash || "").trim();
  const summary =
    String(record.summary || "").trim() ||
    `role:${role};intent:${intentFamily || "general"};sources:${sourceCount}`;

  if (!messageId) return null;
  return {
    messageId,
    role,
    intentFamily: intentFamily || "general",
    sourceDocumentIds,
    sourceCount,
    summary,
    contentHash,
    createdAt,
  };
}

function sanitizeMemory(memoryRaw) {
  const memory = asObject(memoryRaw);
  const recall = Array.isArray(memory.recall) ? memory.recall : [];
  const safeRecall = recall
    .map((entry) => sanitizeRecallEntry(entry))
    .filter(Boolean)
    .slice(0, 32);

  const turnsSinceLastSummary = Math.max(
    0,
    Number(memory.turnsSinceLastSummary || 0) || 0,
  );

  return {
    summary: "Conversation active.",
    summaryMode: "structural",
    currentTopic: String(memory.currentTopic || "General inquiry").slice(0, 64),
    keyTopics: toStringArray(memory.keyTopics, 8),
    recentMessageIds: toStringArray(memory.recentMessageIds, 48),
    sourceDocumentIds: toStringArray(memory.sourceDocumentIds, 24),
    recall: safeRecall,
    turnsSinceLastSummary,
    lastSummaryAt: String(memory.lastSummaryAt || "").trim() || null,
    lastRole:
      String(memory.lastRole || "").toLowerCase() === "assistant"
        ? "assistant"
        : "user",
    lastMessageId: String(memory.lastMessageId || "").trim() || null,
  };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const batchArg = process.argv.find((arg) => arg.startsWith("--batch="));
  const batchSize = Math.max(
    50,
    Number(batchArg ? batchArg.split("=")[1] : "200") || 200,
  );

  let cursor = null;
  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const rows = await prisma.conversation.findMany({
      where: {
        contextMeta: { not: null },
        isDeleted: false,
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        summary: true,
        contextMeta: true,
      },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      try {
        const contextMeta = asObject(row.contextMeta);
        if (!contextMeta.memory) {
          skipped += 1;
          continue;
        }

        const nextMemory = sanitizeMemory(contextMeta.memory);
        const nextContextMeta = {
          ...contextMeta,
          memory: nextMemory,
        };

        const currentNormalized = JSON.stringify(contextMeta.memory);
        const nextNormalized = JSON.stringify(nextMemory);
        const summaryNeedsReset = String(row.summary || "").trim() !== "Conversation active.";
        if (!summaryNeedsReset && currentNormalized === nextNormalized) {
          skipped += 1;
          continue;
        }

        changed += 1;
        if (!execute) continue;

        await prisma.conversation.update({
          where: { id: row.id },
          data: {
            summary: "Conversation active.",
            contextMeta: nextContextMeta,
          },
        });
      } catch {
        failed += 1;
      }
    }

    cursor = rows[rows.length - 1]?.id || null;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    execute,
    batchSize,
    scanned,
    changed,
    skipped,
    failed,
  };

  const reportsDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(
    reportsDir,
    "memory_redaction_migration_report.json",
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(
    `[memory-migration] mode=${execute ? "execute" : "dry-run"} scanned=${scanned} changed=${changed} skipped=${skipped} failed=${failed}`,
  );
  // eslint-disable-next-line no-console
  console.log(`[memory-migration] report=${reportPath}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("[memory-migration] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

