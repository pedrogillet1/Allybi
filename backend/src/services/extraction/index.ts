/**
 * Extraction Services Index
 * Exports all extraction-related services.
 */

export { DoclingBridge, isDoclingAvailable, runDoclingExtract, loadDoclingOutput, extractWithDocling as extractWithDoclingBridge } from './doclingBridge.service';
export type { DoclingBridgeResult, DoclingSuccessResult, DoclingErrorResult, DoclingChunk, DoclingExtractedDocument } from './doclingBridge.service';

export { DoclingExtractor, extractWithDocling } from './doclingExtractor.service';
export type { DoclingExtractionResult } from './doclingExtractor.service';
