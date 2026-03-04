export {
  getResponseContractEnforcer,
  type ResponseContractContext,
  type DraftResponse,
  type EnforcedResponse,
  ResponseContractEnforcerService,
} from "./responseContractEnforcer.v2.service";

import { getResponseContractEnforcer } from "./responseContractEnforcer.v2.service";
import type { ResponseContractContext } from "./responseContractEnforcer.v2.service";

export function resolveSoftTokenLimit(ctx: ResponseContractContext): number {
  const enforcer = getResponseContractEnforcer();
  return (
    enforcer as unknown as {
      [key: string]: (c: ResponseContractContext) => number;
    }
  )["resolveSoftTokenLimitInternal"](ctx);
}

export function resolveHardTokenLimit(
  ctx: ResponseContractContext,
  softLimit: number,
): number {
  const enforcer = getResponseContractEnforcer();
  return (enforcer as unknown as {
    [key: string]: (c: ResponseContractContext, s: number) => number;
  })["resolveHardTokenLimitInternal"](
    ctx,
    softLimit,
  );
}

export function resolveHardCharLimit(ctx: ResponseContractContext): number {
  const enforcer = getResponseContractEnforcer();
  return (
    enforcer as unknown as {
      [key: string]: (c: ResponseContractContext) => number;
    }
  )["resolveHardCharLimitInternal"](ctx);
}
