/**
 * Core services barrel.
 *
 * Re-exports the primary class/function from each service module.
 * Types (LanguageCode, AnswerMode, OutputShape, etc.) are NOT re-exported
 * here because many modules define identical type names. Import types
 * directly from the specific service file that defines them.
 *
 * Usage:
 *   import { KodaIntentEngineV3Service } from '../services/core';
 *   import { getBank } from '../services/core';
 */

// banks/
export {
  BankLoaderService,
  getBankLoaderInstance,
  getBank,
  getOptionalBank,
  hasBank,
  listLoadedBanks,
  getBankLoaderHealth,
} from "./banks/bankLoader.service";
export {
  DataBankLoaderService,
  DataBankError,
} from "./banks/dataBankLoader.service";

// inputs/
export { LanguageDetectorService } from "./inputs/languageDetector.service";
export { LanguageEnforcementService } from "./inputs/languageEnforcement.service";
export { MonthNormalizationService } from "./inputs/monthNormalization.service";
export {
  MarkdownNormalizerService,
  getMarkdownNormalizer,
} from "./inputs/markdownNormalizer.service";
export {
  BoilerplateStripperService,
  getBoilerplateStripper,
} from "./inputs/boilerplateStripper.service";
export {
  BoldingNormalizerService,
  getBoldingNormalizer,
} from "./inputs/boldingNormalizer.service";
export {
  FormatConstraintParserService,
  getFormatConstraintParser,
} from "./inputs/formatConstraintParser.service";
export { runtimePatterns } from "./inputs/runtimePatterns.service";

// routing/
export { RouterService, getRouter } from "./routing/router.service";
export { KodaIntentEngineV3Service } from "./routing/intentEngine.service";
export {
  rewriteQueryForRegeneration,
  shouldRewriteQuery,
} from "./routing/queryRewriter.service";
export {
  OperatorResolver,
  OperatorResolverWithPolicy,
  getOperatorResolver,
  getOperatorResolverWithPolicy,
} from "./routing/operatorResolver.service";
export {
  OperatorTiebreakersService,
  operatorTiebreakers,
} from "./routing/operatorTiebreakers.service";
export { AnswerModeRouterService } from "./routing/answerModeRouter.service";
export {
  DomainEnforcementService,
  getDomainEnforcement,
} from "./routing/domainEnforcement.service";
export { createDefaultRoutingSignals } from "./routing/routingSignals";

// scope/
export { ScopeGateService } from "./scope/scopeGate.service";

// retrieval/
export { RetrievalEngineService } from "./retrieval/retrievalEngine.service";
export {
  EvidenceGateService,
  getEvidenceGate,
} from "./retrieval/evidenceGate.service";
export {
  SourceButtonsService,
  getSourceButtonsService,
  buildDocGroundedResponse,
  buildFileActionResponse,
  buildFileListResponse,
  buildNoEvidenceResponse,
} from "./retrieval/sourceButtons.service";

// compose/
export { KodaAnswerEngineV3Service } from "./compose/answerEngine.service";
export { AnswerComposerService } from "./compose/answerComposer.service";
export { MicrocopyPickerService } from "./compose/microcopyPicker.service";

// enforcement/
export {
  TrustGateService,
  getTrustGate,
} from "./enforcement/trustGate.service";
export { QualityGateRunnerService } from "./enforcement/qualityGateRunner.service";
export {
  ResponseContractEnforcerService,
  getResponseContractEnforcer,
} from "./enforcement/responseContractEnforcer.service";
export {
  isContentQuestion,
  isFileActionQuery,
  classifyQuery,
  resetPatternCache,
  getBankStats,
} from "./enforcement/contentGuard.service";
export { FallbackEngineService } from "./enforcement/fallbackEngine.service";
