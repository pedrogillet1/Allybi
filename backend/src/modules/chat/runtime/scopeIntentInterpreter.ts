import type { ChatRequest } from "../domain/chat.contracts";
import type { ScopeRuntimeConfig } from "./scopeRuntimeConfig";

export class ScopeIntentInterpreter {
  constructor(
    private readonly runtimeConfig: Pick<ScopeRuntimeConfig, "clearScopeRegex">,
  ) {}

  shouldClearScope(req: ChatRequest): boolean {
    const explicit = Boolean((req.meta as any)?.clearScope);
    if (explicit) return true;

    const q = String(req.message || "").toLowerCase();
    return this.runtimeConfig.clearScopeRegex.some((pattern) => pattern.test(q));
  }
}
