import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const passportUseMock = jest.fn();
const passportSerializeMock = jest.fn();
const passportDeserializeMock = jest.fn();
const googleStrategyMock = jest.fn();

jest.mock("passport", () => ({
  __esModule: true,
  default: {
    use: (...args: unknown[]) => passportUseMock(...args),
    serializeUser: (...args: unknown[]) => passportSerializeMock(...args),
    deserializeUser: (...args: unknown[]) => passportDeserializeMock(...args),
  },
}));

jest.mock("passport-google-oauth20", () => ({
  Strategy: function (...args: unknown[]) {
    return googleStrategyMock(...args);
  },
}));

jest.mock("./env", () => ({
  config: {
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    GOOGLE_CALLBACK_URL: "https://legacy.example.com/api/auth/google/callback",
    GOOGLE_AUTH_CALLBACK_URL: "https://auth.example.com/api/auth/google/callback",
  },
}));

describe("config/passport", () => {
  beforeEach(() => {
    passportUseMock.mockReset();
    passportSerializeMock.mockReset();
    passportDeserializeMock.mockReset();
    googleStrategyMock.mockReset();
    jest.resetModules();
  });

  test("uses GOOGLE_AUTH_CALLBACK_URL for Google strategy callback", async () => {
    googleStrategyMock.mockImplementation((options) => ({ options }));
    await import("./passport");

    expect(googleStrategyMock).toHaveBeenCalledTimes(1);
    const [options] = googleStrategyMock.mock.calls[0] as [Record<string, string>];
    expect(options.callbackURL).toBe(
      "https://auth.example.com/api/auth/google/callback",
    );
  });

  test("includes provider emailVerified flag in mapped profile when present", async () => {
    googleStrategyMock.mockImplementation((options, verify) => ({
      options,
      verify,
    }));
    await import("./passport");

    const [, verify] = googleStrategyMock.mock.calls[0] as [
      Record<string, string>,
      (...args: unknown[]) => void,
    ];
    const done = jest.fn();

    verify(
      "access",
      "refresh",
      {
        id: "google-user-1",
        displayName: "Google User",
        emails: [{ value: "user@example.com", verified: false }],
      },
      done,
    );

    expect(done).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        id: "google-user-1",
        email: "user@example.com",
        emailVerified: false,
      }),
    );
  });
});

