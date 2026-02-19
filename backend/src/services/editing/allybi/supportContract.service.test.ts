import { describe, expect, test } from "@jest/globals";
import { SupportContractService } from "./supportContract.service";

describe("SupportContractService", () => {
  const service = new SupportContractService();

  test("passes explicit-operator requests when catalog + executor + scope are valid", () => {
    const out = service.evaluatePreApply({
      instruction: "Set this paragraph to title case",
      domain: "docx",
      runtimeOperator: "EDIT_PARAGRAPH",
      intentSource: "explicit_operator",
      resolvedTargetId: "docx:p:1",
    });
    expect(out.ok).toBe(true);
    expect(out.blockedReason).toBeUndefined();
  });

  test("blocks classified unknown instructions with typed unknown_unsupported outcome", () => {
    const out = service.evaluatePreApply({
      instruction: "zzqv nvxq 123 nevermatch",
      domain: "docx",
      runtimeOperator: "EDIT_PARAGRAPH",
      intentSource: "classified",
      resolvedTargetId: "docx:p:1",
    });
    expect(out.ok).toBe(false);
    expect(out.outcomeType).toBe("unknown_unsupported");
    expect(out.blockedReason?.code).toBe("UNKNOWN_UNSUPPORTED_INTENT");
  });

  test("blocks missing scope for target-required operators", () => {
    const out = service.evaluatePreApply({
      instruction: "Rewrite the paragraph",
      domain: "docx",
      runtimeOperator: "EDIT_PARAGRAPH",
      intentSource: "explicit_operator",
      resolvedTargetId: "",
    });
    expect(out.ok).toBe(false);
    expect(out.outcomeType).toBe("blocked");
    expect(out.blockedReason?.code).toBe("TARGET_NOT_RESOLVED");
  });

  test("returns engine_unsupported when runtime operator is not mapped for domain", () => {
    const out = service.evaluatePreApply({
      instruction: "Rewrite the paragraph",
      domain: "docx",
      runtimeOperator: "REPLACE_SLIDE_IMAGE" as any,
      intentSource: "explicit_operator",
      resolvedTargetId: "docx:p:1",
    });
    expect(out.ok).toBe(false);
    expect(out.outcomeType).toBe("engine_unsupported");
    expect(out.blockedReason?.code).toBe("ENGINE_UNSUPPORTED");
  });
});
