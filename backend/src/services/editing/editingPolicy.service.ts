import { getOptionalBank } from "../core/banks/bankLoader.service";

export interface EditingPolicySnapshot {
  alwaysConfirmOperators: string[];
  silentExecuteConfidence: number;
  autoApplyInViewer: boolean;
  autoApplyComputeBundles: boolean;
  databanksUsed: string[];
}

export function getEditingPolicySnapshot(): EditingPolicySnapshot {
  const capabilities: any = getOptionalBank("allybi_capabilities");
  const alwaysConfirmOperators = Array.isArray(
    capabilities?.alwaysConfirmOperators,
  )
    ? capabilities.alwaysConfirmOperators.map((x: any) => String(x))
    : [];
  const silentExecuteConfidence =
    typeof capabilities?.config?.silentExecuteConfidence === "number"
      ? capabilities.config.silentExecuteConfidence
      : 0.9;

  const autoApplyInViewer =
    typeof capabilities?.config?.autoApplyInViewer === "boolean"
      ? capabilities.config.autoApplyInViewer
      : true;

  const autoApplyComputeBundles =
    typeof capabilities?.config?.autoApplyComputeBundles === "boolean"
      ? capabilities.config.autoApplyComputeBundles
      : true;

  return {
    alwaysConfirmOperators,
    silentExecuteConfidence,
    autoApplyInViewer,
    autoApplyComputeBundles,
    databanksUsed: [
      ...(capabilities?._meta?.id ? [String(capabilities._meta.id)] : []),
    ],
  };
}
