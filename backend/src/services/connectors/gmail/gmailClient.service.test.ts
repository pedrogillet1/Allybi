import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockGetProfile = jest.fn();

jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    gmail: jest.fn(() => ({
      users: {
        getProfile: (...args: any[]) => mockGetProfile(...args),
        messages: {
          list: jest.fn(),
          get: jest.fn(),
          attachments: { get: jest.fn() },
          send: jest.fn(),
        },
        history: { list: jest.fn() },
      },
    })),
  },
}));

import { GmailClientError, GmailClientService } from "./gmailClient.service";

describe("GmailClientService retry behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("retries transient API failures then succeeds", async () => {
    mockGetProfile
      .mockRejectedValueOnce({
        response: { status: 429, data: { error: { message: "rate limited" } } },
      })
      .mockResolvedValueOnce({ data: { emailAddress: "user@example.com" } });

    const svc = new GmailClientService({
      maxRetries: 1,
      baseBackoffMs: 0,
      maxBackoffMs: 0,
    });

    const out = await svc.getProfile("token-1");
    expect(out.emailAddress).toBe("user@example.com");
    expect(mockGetProfile).toHaveBeenCalledTimes(2);
  });

  test("does not retry auth failures", async () => {
    mockGetProfile.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { error: { message: "invalid credentials" } },
      },
    });

    const svc = new GmailClientService({ maxRetries: 3 });
    const op = svc.getProfile("token-1");
    await expect(op).rejects.toBeInstanceOf(GmailClientError);
    await expect(op).rejects.toMatchObject({
      code: "AUTH_ERROR",
      retryable: false,
    });
    expect(mockGetProfile).toHaveBeenCalledTimes(1);
  });
});
