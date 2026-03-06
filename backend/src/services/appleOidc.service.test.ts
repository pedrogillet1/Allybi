import crypto from "crypto";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, test } from "@jest/globals";
import {
  resetAppleJwksCacheForTests,
  verifyAppleIdToken,
} from "./appleOidc.service";

describe("appleOidc.service", () => {
  beforeEach(() => {
    resetAppleJwksCacheForTests();
  });

  test("verifies signed Apple id_token with issuer/audience/nonce checks", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const kid = "apple-kid-1";
    const nonce = "nonce-123";
    const clientId = "com.koda.web";

    const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
    const token = jwt.sign(
      {
        sub: "apple-user-1",
        email: "apple-user@example.com",
        nonce,
      },
      privateKey,
      {
        algorithm: "RS256",
        keyid: kid,
        issuer: "https://appleid.apple.com",
        audience: clientId,
        expiresIn: "5m",
      },
    );

    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({
          keys: [{ ...jwk, kid, kty: "RSA", use: "sig", alg: "RS256" }],
        }),
      }) as unknown as Response;

    const claims = await verifyAppleIdToken({
      idToken: token,
      clientId,
      expectedNonce: nonce,
      fetchImpl,
    });

    expect(claims.sub).toBe("apple-user-1");
    expect(claims.email).toBe("apple-user@example.com");
  });

  test("rejects nonce mismatch", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const kid = "apple-kid-2";
    const clientId = "com.koda.web";

    const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
    const token = jwt.sign(
      {
        sub: "apple-user-2",
        email: "apple-user2@example.com",
        nonce: "nonce-good",
      },
      privateKey,
      {
        algorithm: "RS256",
        keyid: kid,
        issuer: "https://appleid.apple.com",
        audience: clientId,
        expiresIn: "5m",
      },
    );

    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({
          keys: [{ ...jwk, kid, kty: "RSA", use: "sig", alg: "RS256" }],
        }),
      }) as unknown as Response;

    await expect(
      verifyAppleIdToken({
        idToken: token,
        clientId,
        expectedNonce: "nonce-other",
        fetchImpl,
      }),
    ).rejects.toThrow("Apple id_token nonce mismatch");
  });
});
