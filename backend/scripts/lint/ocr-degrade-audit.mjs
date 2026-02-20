#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict");
const CWD = process.cwd();
const BACKEND_ROOT = fs.existsSync(path.resolve(CWD, "backend/src"))
  ? path.resolve(CWD, "backend")
  : CWD;
const SRC = path.resolve(BACKEND_ROOT, "src");

function read(relPath) {
  return fs.readFileSync(path.resolve(BACKEND_ROOT, relPath), "utf8");
}

function exists(relPath) {
  return fs.existsSync(path.resolve(BACKEND_ROOT, relPath));
}

function has(text, pattern) {
  return pattern.test(text);
}

const queuePath = "src/queues/document.queue.ts";
const extractionIndexPath = "src/services/extraction/index.ts";
const visionPath = "src/services/extraction/google-vision-ocr.service.ts";
const ocrCleanupPath = "src/services/extraction/ocrCleanup.service.ts";

const queueSrc = exists(queuePath) ? read(queuePath) : "";
const extractionIndexSrc = exists(extractionIndexPath)
  ? read(extractionIndexPath)
  : "";
const visionSrc = exists(visionPath) ? read(visionPath) : "";

const gracefulImageProviderUnavailable =
  has(queueSrc, /Provider unavailable, saving as visual-only/) &&
  has(queueSrc, /skipReason:\s*`Image saved as visual-only/) &&
  !has(
    queueSrc,
    /throw new Error\(\s*`Image OCR unavailable \(Google Vision not initialized\):/,
  );

const gracefulImageOcrRuntimeFailure =
  has(queueSrc, /OCR processing failed, saving as visual-only/) &&
  has(queueSrc, /skipReason:\s*`Image saved as visual-only \(ocr_error:/);

const imageSkipMarkedReady =
  has(queueSrc, /const keepVisibleWithoutText\s*=\s*[\s\S]*isImageMime\(effectiveMimeType\)/) &&
  has(queueSrc, /status:\s*keepVisibleWithoutText \? "ready" : "skipped"/);

const visionRetryPresent =
  has(visionSrc, /async extractTextWithRetry\(/) &&
  has(visionSrc, /TRANSIENT_CODES/) &&
  has(visionSrc, /Math\.pow\(2,\s*attempt - 1\)/);

const noDeadOcrCleanup =
  !exists(ocrCleanupPath) && !has(extractionIndexSrc, /ocrCleanup\.service/);

const checks = [
  {
    id: "graceful_provider_unavailable",
    points: 3,
    ok: gracefulImageProviderUnavailable,
  },
  {
    id: "graceful_runtime_failure",
    points: 2,
    ok: gracefulImageOcrRuntimeFailure,
  },
  {
    id: "ready_visual_only_contract",
    points: 2,
    ok: imageSkipMarkedReady,
  },
  {
    id: "vision_retry_resilience",
    points: 2,
    ok: visionRetryPresent,
  },
  {
    id: "unused_ocr_cleanup_removed",
    points: 1,
    ok: noDeadOcrCleanup,
  },
];

const maxScore = checks.reduce((sum, c) => sum + c.points, 0);
const score = checks.reduce((sum, c) => sum + (c.ok ? c.points : 0), 0);
const failed = checks.filter((c) => !c.ok);

console.log(`[ocr-audit] score: ${score}/${maxScore}`);
for (const check of checks) {
  const value = check.ok ? check.points : 0;
  console.log(`[ocr-audit] ${check.id}: ${value}/${check.points}`);
}

if (failed.length > 0) {
  for (const check of failed) {
    console.log(`[ocr-audit] FAIL ${check.id}`);
  }
}

if (STRICT && failed.length > 0) {
  process.exit(1);
}
