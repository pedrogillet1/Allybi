// src/services/core/orchestration/index.ts
//
// Centralized orchestrator module entrypoint.
// Keep imports stable for all consumers (container, apps, tests).

export { KodaOrchestratorV3Service } from './kodaOrchestrator.service';
export { buildOrchestratorDeps, createOrchestrator } from './orchestratorFactory';

