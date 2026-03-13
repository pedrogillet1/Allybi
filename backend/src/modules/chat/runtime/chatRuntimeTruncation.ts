import { classifyProviderTruncation, classifyVisibleTruncation } from "./truncationClassifier";

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function shouldApplyPreEnforcerTrim(params: {
  telemetry?: Record<string, unknown> | null;
  finalText: string;
  requestedMaxOutputTokens: number | null;
}): boolean {
  if (!params.requestedMaxOutputTokens || params.requestedMaxOutputTokens <= 0) {
    return false;
  }
  const provider = classifyProviderTruncation(toObject(params.telemetry));
  if (!provider.occurred) return false;
  const semantic = classifyVisibleTruncation({
    finalText: params.finalText,
    enforcementRepairs: [],
    providerTruncation: provider,
  });
  return semantic.occurred;
}
