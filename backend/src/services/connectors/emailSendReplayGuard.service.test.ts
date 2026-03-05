import { beforeEach, describe, expect, test } from "@jest/globals";

import {
  consumeEmailSendConfirmationTokenOnce,
  resetEmailSendReplayCacheForTests,
} from "./emailSendReplayGuard.service";

describe("emailSendReplayGuard", () => {
  beforeEach(() => {
    resetEmailSendReplayCacheForTests();
  });

  test("accepts first token use and rejects replay", async () => {
    const payload = {
      userId: "user-1",
      provider: "gmail" as const,
      exp: Date.now() + 5 * 60 * 1000,
    };

    const first = await consumeEmailSendConfirmationTokenOnce(
      "token-abc",
      payload,
    );
    const second = await consumeEmailSendConfirmationTokenOnce(
      "token-abc",
      payload,
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  test("treats different tokens independently", async () => {
    const payload = {
      userId: "user-1",
      provider: "gmail" as const,
      exp: Date.now() + 5 * 60 * 1000,
    };

    const first = await consumeEmailSendConfirmationTokenOnce(
      "token-abc",
      payload,
    );
    const second = await consumeEmailSendConfirmationTokenOnce(
      "token-def",
      payload,
    );

    expect(first).toBe(true);
    expect(second).toBe(true);
  });
});

