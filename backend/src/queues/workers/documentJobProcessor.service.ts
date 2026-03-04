/**
 * Document Job Processor
 *
 * Shared entry point used by the GCP Pub/Sub HTTP worker.
 * Delegates to the shared ingestion pipeline for all processing logic.
 */

import type { ProcessDocumentJobData } from "../queueConfig";
import type { ProgressEmitter } from "../../services/ingestion/pipeline/pipelineTypes";
import { runDocumentIngestionPipeline } from "./documentIngestionPipeline.service";

/**
 * Run the same ingestion pipeline as the local BullMQ worker, but callable directly.
 * This is used by the GCP Pub/Sub HTTP worker so it can process jobs without BullMQ.
 */
export async function processDocumentJobData(
  data: ProcessDocumentJobData,
  opts?: { emitProgress?: ProgressEmitter },
): Promise<Record<string, unknown>> {
  const result = await runDocumentIngestionPipeline(data, {
    emitProgress: opts?.emitProgress,
    handlePreviewAndReady: false,
  });
  return result as unknown as Record<string, unknown>;
}
