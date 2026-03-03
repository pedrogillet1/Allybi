import { resolvePolicyBank } from "./policyBankResolver.service";

type ViewerLockedChatPolicyBank = {
  config?: {
    enabled?: boolean;
    strict?: boolean;
  };
  policy?: {
    defaultViewerIntent?: string;
    defaultAnswerMode?: string;
    scope?: {
      lockToActiveDocument?: boolean;
      emitScopeSignals?: string[];
    };
  };
};

export type ViewerLockedChatPolicyConfig = {
  enabled: boolean;
  strict: boolean;
  defaultViewerIntent: string;
  defaultAnswerMode: string;
  lockToActiveDocument: boolean;
  emitScopeSignals: string[];
};

const DEFAULTS: ViewerLockedChatPolicyConfig = {
  enabled: true,
  strict: true,
  defaultViewerIntent: "qa_locked",
  defaultAnswerMode: "doc_grounded_single",
  lockToActiveDocument: true,
  emitScopeSignals: ["explicitDocLock", "singleDocIntent", "hardScopeActive"],
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export class ViewerLockedChatPolicyService {
  resolve(): ViewerLockedChatPolicyConfig {
    const bank = resolvePolicyBank<ViewerLockedChatPolicyBank>(
      "viewer_locked_chat_policy",
      "viewer_locked_chat_policy.any.json",
    );
    const policy = bank?.policy || {};
    const scope = policy.scope || {};

    return {
      enabled: bank?.config?.enabled !== false,
      strict: bank?.config?.strict !== false,
      defaultViewerIntent:
        String(policy.defaultViewerIntent || "").trim() ||
        DEFAULTS.defaultViewerIntent,
      defaultAnswerMode:
        String(policy.defaultAnswerMode || "").trim() ||
        DEFAULTS.defaultAnswerMode,
      lockToActiveDocument:
        typeof scope.lockToActiveDocument === "boolean"
          ? scope.lockToActiveDocument
          : DEFAULTS.lockToActiveDocument,
      emitScopeSignals:
        asStringList(scope.emitScopeSignals).length > 0
          ? asStringList(scope.emitScopeSignals)
          : DEFAULTS.emitScopeSignals,
    };
  }
}
