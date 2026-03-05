<!-- d263f215-0f89-4cf7-a58a-e812de4c7db3 -->
---
todos:
  - id: "await-persist"
    content: "Await the 3 persistWithRetry calls (lines 283, 362, 373) in documentIngestionPipeline.service.ts"
    status: pending
  - id: "ringbuffer-reset"
    content: "Add reset() method to RingBuffer class and use it in resetMetrics()"
    status: pending
  - id: "cheerio-trycatch"
    content: "Wrap cheerio.load body in try/catch in htmlTextExtractor.ts"
    status: pending
  - id: "console-to-logger"
    content: "Replace 4 console.error calls with logger in fileValidator.service.ts"
    status: pending
  - id: "password-error-field"
    content: "Add missing error field to checkPasswordProtection catch block in fileValidator.service.ts"
    status: pending
  - id: "ocr-circuit-metrics"
    content: "Record extraction attempt + OCR usage when both OCR circuits are open in extractionDispatch.service.ts"
    status: pending
  - id: "ocr-waste-zero"
    content: "Skip recordOcrWaste when textLen <= 0 in pipelineMetrics.service.ts"
    status: pending
  - id: "extraction-throw-attempt"
    content: "Record extraction attempt on throw in extractText via succeeded flag in extractionDispatch.service.ts"
    status: pending
  - id: "stop-mutation-warnings"
    content: "Stop mutating extraction.extractionWarnings, add DOCX fallback warning, remove dead PPTX/XLSX defaults in dispatch"
    status: pending
isProject: false
---
# Fix Remaining Pipeline Bugs (Tasks 10-18)

Tasks 1-9 from the previous session are already complete. This plan covers the 9 remaining items.

---

## Task 10: Await persistWithRetry calls in documentIngestionPipeline.service.ts

**File:** `backend/src/queues/workers/documentIngestionPipeline.service.ts`

Three `persistWithRetry(...)` calls are fire-and-forget (no `await`):
- Line 283: skipped telemetry
- Line 362: processing metrics
- Line 373: ingestion telemetry

Also in the catch block:
- Line 478: failure metrics
- Line 487: failure telemetry

Add `await` to lines 283, 362, 373 so data is persisted before returning. The catch-block calls (478, 487) can remain fire-and-forget since the function is about to throw anyway.

---

## Task 11: Add reset() method to RingBuffer in pipelineMetrics.service.ts

**File:** `backend/src/services/ingestion/pipeline/pipelineMetrics.service.ts`

`resetMetrics()` (line 247) hacks private fields via bracket notation:
```typescript
extractionTimings["buffer"] = [];
extractionTimings["index"] = 0;
extractionTimings["full"] = false;
```

Add a public `reset()` method to the `RingBuffer` class, then call it from `resetMetrics()` instead.

---

## Task 12: Wrap cheerio.load in try/catch in htmlTextExtractor.ts

**File:** `backend/src/utils/htmlTextExtractor.ts`

Line 13: `cheerio.load(html)` can throw on severely malformed input. Wrap the body of `stripHtmlToText` in a try/catch that returns `""` on failure.

---

## Task 13: Replace console.error with logger in fileValidator.service.ts

**File:** `backend/src/services/ingestion/fileValidator.service.ts`

Four `console.error` calls at lines 125, 139, 170, 306. Import `logger` from `../../utils/logger` and replace:
- Lines 125, 139, 170: `console.error(...)` -> `logger.warn(...)` (these are validation warnings, not fatal)
- Line 306: `console.error("Server-side validation error:", error)` -> `logger.error(...)`

---

## Task 14: Add missing error field in password check catch

**File:** `backend/src/services/ingestion/fileValidator.service.ts`

The `checkPasswordProtection` catch block (lines 375-382) returns a `ValidationResult` without the `error` field:

```375:382:backend/src/services/ingestion/fileValidator.service.ts
    } catch (error: any) {
      return {
        isValid: false,
        errorCode: ValidationErrorCode.FILE_CORRUPTED,
        suggestion:
          "File could not be read. It may be corrupted or password-protected.",
      };
    }
```

Add `error: error?.message || "Password protection check failed"` to the return object.

---

## Task 15: Record metrics when both OCR circuits are open

**File:** `backend/src/services/ingestion/extraction/extractionDispatch.service.ts`

Lines 430-434: when both OCR circuit breakers are open, the function returns `toVisualOnly(...)` without recording an extraction attempt or OCR usage metrics.

Add `recordExtractionAttempt(false)` and `recordOcrUsage("google_vision", false)` / `recordOcrUsage("tesseract", false)` before the early return.

This requires importing `recordExtractionAttempt` (currently only `recordExtractorTiming`, `recordOcrUsage`, `recordOcrWaste` are imported).

---

## Task 16: Fix recordOcrWaste(0) skewing data

**File:** `backend/src/services/ingestion/pipeline/pipelineMetrics.service.ts`

`recordOcrWaste(0)` adds zero-length entries that drag down percentiles. Guard the push:

```typescript
export function recordOcrWaste(textLen: number): void {
  if (!Number.isFinite(textLen) || textLen <= 0) return;
  ocrWasteBuffer.push(textLen);
}
```

Change `textLen <= 0` to skip zeros. The callers in `extractionDispatch.service.ts` that call `recordOcrWaste(textLength)` when `textLength === 0` will now be harmless no-ops.

---

## Task 17: Record extraction attempt on extraction throw

**File:** `backend/src/services/ingestion/extraction/extractionDispatch.service.ts`

When `extractText` throws (e.g., unsupported mime, corrupted file), the `finally` block only records extractor timing. It should also record a failed extraction attempt. Add `recordExtractionAttempt(false)` to a catch block or the finally block when the function throws.

Since the function can throw at any point, add a `let succeeded = false;` flag at the top, set it to `true` before each successful return, and in `finally`, if `!succeeded`, call `recordExtractionAttempt(false)`.

---

## Task 18: Stop extraction mutation + DOCX fallback warning

**File:** `backend/src/services/ingestion/pipeline/documentPipeline.service.ts` (mutation)

Lines 288-299 mutate `extraction.extractionWarnings` directly. Instead, accumulate the extra warning into the local `extractionWarnings` array (line 302-309) which already collects warnings. Remove the mutation and push the extra warning into the local array after it's created.

**File:** `backend/src/services/extraction/docxExtractor.service.ts` (DOCX fallback warning)

Lines 430-448: the `else` fallback path (when `$$` ordered children is unavailable) silently loses paragraph/table ordering. Add a `logger.warn` call noting the fallback.

**File:** `backend/src/services/ingestion/extraction/extractionDispatch.service.ts` (PPTX defaults)

Lines 258, 269: The defaults `slideCount: 0, slides: []` and `sheetCount: 0, sheets: []` before `...result` are technically overwritten by the spread, but they're misleading. Remove them since extractors always return these fields. This also applies to `sections: []` on line 247.
