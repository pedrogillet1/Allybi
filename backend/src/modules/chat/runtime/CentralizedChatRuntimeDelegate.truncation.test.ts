import "reflect-metadata";
import { describe, expect, test } from "@jest/globals";
import {
  CentralizedChatRuntimeDelegate,
  shouldApplyPreEnforcerTrim,
} from "./CentralizedChatRuntimeDelegate";

describe("CentralizedChatRuntimeDelegate pre-enforcer trim", () => {
  test("returns false when requested output tokens are not provided", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "length" },
        finalText: "Incomplete output from provider that stops abruptly at",
        requestedMaxOutputTokens: null,
      }),
    ).toBe(false);
  });

  test("returns false when provider did not overflow", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "stop" },
        finalText: "Complete output.",
        requestedMaxOutputTokens: 1200,
      }),
    ).toBe(false);
  });

  test("returns false when provider overflow happened but semantic output is complete", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "length" },
        finalText: "This answer is complete and ends cleanly with punctuation.",
        requestedMaxOutputTokens: 1200,
      }),
    ).toBe(false);
  });

  test("returns true when provider overflow and semantic incompleteness both occur", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "max_tokens" },
        finalText:
          "This answer keeps listing evidence across sections and then abruptly stops in the middle of a",
        requestedMaxOutputTokens: 1200,
      }),
    ).toBe(true);
  });
});

describe("CentralizedChatRuntimeDelegate provider overflow repair", () => {
  test("replaces incomplete overflow narrative with complete localized fallback", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as CentralizedChatRuntimeDelegate;

    const repaired = (delegate as any).repairProviderOverflowStructuredOutput(
      'Com base no documento "Trabalho_projeto_.',
      { finishReason: "length" },
      "pt",
    );

    expect(repaired).toBe(
      "A resposta foi interrompida antes de concluir. Posso reenviar em bullets para garantir completude.",
    );
  });
});
