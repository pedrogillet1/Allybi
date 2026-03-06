import { beforeEach, describe, expect, test } from "@jest/globals";
import {
  consumeTwoFactorLoginChallenge,
  issueTwoFactorLoginChallenge,
  resetTwoFactorChallengeStoreForTests,
  verifyTwoFactorLoginChallenge,
} from "./authLoginChallenge.service";

describe("authLoginChallenge.service", () => {
  beforeEach(() => {
    process.env.KODA_LOGIN_CHALLENGE_SECRET = "test-login-challenge-secret";
    resetTwoFactorChallengeStoreForTests();
  });

  test("issues and consumes challenge once", async () => {
    const token = await issueTwoFactorLoginChallenge({
      userId: "user-1",
      email: "user1@example.com",
    });

    const firstUse = await consumeTwoFactorLoginChallenge(token);
    expect(firstUse).toEqual({
      userId: "user-1",
      email: "user1@example.com",
    });

    await expect(consumeTwoFactorLoginChallenge(token)).rejects.toThrow(
      "2FA challenge invalid or expired",
    );
  });

  test("verification does not consume challenge", async () => {
    const token = await issueTwoFactorLoginChallenge({
      userId: "user-2",
      email: "user2@example.com",
    });

    const verified = await verifyTwoFactorLoginChallenge(token);
    expect(verified.userId).toBe("user-2");
    expect(verified.email).toBe("user2@example.com");

    const consumed = await consumeTwoFactorLoginChallenge(token);
    expect(consumed).toEqual({
      userId: "user-2",
      email: "user2@example.com",
    });
  });
});
