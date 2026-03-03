/**
 * Document Processing Queue — Re-export Facade
 *
 * This file preserves all existing import paths while the actual logic
 * lives in focused modules under ./queueConfig, ./workers/, and
 * ../services/ingestion/.
 */

// Queue instances & config
export {
  documentQueue,
  previewReconciliationQueue,
  previewGenerationQueue,
  stuckDocSweepQueue,
  connection,
  QUEUE_PREFIX,
} from "./queueConfig";
export type {
  ProcessDocumentJobData,
  PreviewGenerationJobData,
} from "./queueConfig";

// Job helpers
export {
  addDocumentJob,
  addDocumentJobsBulk,
  getQueueStats,
} from "./workers/jobHelpers.service";

// Document job processor (used by GCP Pub/Sub worker)
export { processDocumentJobData } from "./workers/documentJobProcessor.service";

// Document worker
export {
  startDocumentWorker,
  stopDocumentWorker,
} from "./workers/documentWorker.service";

// Preview workers
export {
  startPreviewReconciliationWorker,
  stopPreviewReconciliationWorker,
  startPreviewGenerationWorker,
  stopPreviewGenerationWorker,
  addPreviewGenerationJob,
} from "./workers/previewWorkers.service";

// Stuck document sweeper
export {
  startStuckDocSweeper,
  stopStuckDocSweeper,
} from "./workers/stuckDocSweeper.service";

// Pipeline internals (re-exported for backward compat)
export { processDocumentAsync } from "../services/ingestion/pipeline/documentPipeline.service";
export { extractText } from "../services/ingestion/extraction/extractionDispatch.service";
export { buildInputChunks, deduplicateChunks } from "../services/ingestion/pipeline/chunkAssembly.service";
export { clampProgress, stageFromMessage, emitProcessingUpdate, emitToUser, documentProgressService } from "../services/ingestion/progress/documentProgress.service";

// Default export preserving the original shape
import { documentQueue, previewReconciliationQueue, previewGenerationQueue, stuckDocSweepQueue } from "./queueConfig";
import { addDocumentJob, addDocumentJobsBulk, getQueueStats } from "./workers/jobHelpers.service";
import { startDocumentWorker, stopDocumentWorker } from "./workers/documentWorker.service";
import { startPreviewReconciliationWorker, stopPreviewReconciliationWorker, startPreviewGenerationWorker, stopPreviewGenerationWorker, addPreviewGenerationJob } from "./workers/previewWorkers.service";
import { startStuckDocSweeper, stopStuckDocSweeper } from "./workers/stuckDocSweeper.service";

export default {
  documentQueue,
  previewReconciliationQueue,
  previewGenerationQueue,
  stuckDocSweepQueue,
  startDocumentWorker,
  stopDocumentWorker,
  startPreviewReconciliationWorker,
  stopPreviewReconciliationWorker,
  startPreviewGenerationWorker,
  stopPreviewGenerationWorker,
  startStuckDocSweeper,
  stopStuckDocSweeper,
  addDocumentJob,
  addDocumentJobsBulk,
  addPreviewGenerationJob,
  getQueueStats,
};
