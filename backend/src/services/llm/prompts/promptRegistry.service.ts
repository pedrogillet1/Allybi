export type {
  BankLoader,
  EnvName,
  LangCode,
  LlmRole,
  PromptBuildFailureEvent,
  PromptBuildStartEvent,
  PromptBuildSuccessEvent,
  PromptBundle,
  PromptContext,
  PromptMetricSink,
  PromptKind,
  PromptMessage,
  PromptRegistryTelemetry,
  PromptTraceEntry,
} from "./v2/types";

export {
  PromptBankDisabledError,
  PromptBankLoadError,
  PromptBankMissingError,
  PromptBankValidationError,
  PromptNoTemplateMatchError,
  PromptPlaceholderResolutionError,
  PromptRegistryConfigError,
  PromptRegistryError,
  PromptRoleValidationError,
  PromptTemplateSelectionError,
  type PromptRegistryErrorCode,
} from "./v2/errors";

export {
  createDefaultPromptRegistryTelemetry,
  NOOP_PROMPT_METRIC_SINK,
  NOOP_PROMPT_REGISTRY_TELEMETRY,
} from "./v2/telemetry";

import type { BankLoader, PromptRegistryTelemetry } from "./v2/types";
import { PromptRegistryServiceV2 } from "./v2/service";

export class PromptRegistryService extends PromptRegistryServiceV2 {
  constructor(bankLoader: BankLoader, telemetry?: PromptRegistryTelemetry) {
    super(bankLoader, telemetry);
  }
}

export default PromptRegistryService;
