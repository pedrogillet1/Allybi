import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockUserFindFirst = jest.fn();
const mockAddPhoneToPending = jest.fn();
const mockFormatPhoneNumber = jest.fn();
const mockIsValidPhoneNumber = jest.fn();
const mockSendVerificationSMS = jest.fn();

jest.mock("../config/database", () => ({
  __esModule: true,
  default: {
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    session: {
      create: jest.fn(),
    },
    pendingUser: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("./pendingUser.service", () => ({
  __esModule: true,
  addPhoneToPending: (...args: unknown[]) => mockAddPhoneToPending(...args),
}));

jest.mock("./sms.service", () => ({
  __esModule: true,
  formatPhoneNumber: (...args: unknown[]) => mockFormatPhoneNumber(...args),
  isValidPhoneNumber: (...args: unknown[]) => mockIsValidPhoneNumber(...args),
  sendVerificationSMS: (...args: unknown[]) => mockSendVerificationSMS(...args),
}));

describe("auth.service addPhoneToPendingUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatPhoneNumber.mockImplementation((value: string) => value);
    mockIsValidPhoneNumber.mockReturnValue(true);
    mockUserFindFirst.mockResolvedValue(null);
    mockAddPhoneToPending.mockResolvedValue({
      pendingUser: { email: "user@test.com", phoneVerified: false },
      phoneCode: "123456",
    });
    mockSendVerificationSMS.mockResolvedValue(undefined);
  });

  test("rejects invalid phone format before checking persistence", async () => {
    const { addPhoneToPendingUser } = await import("./auth.service");
    mockIsValidPhoneNumber.mockReturnValue(false);

    await expect(
      addPhoneToPendingUser("user@test.com", "bad-phone"),
    ).rejects.toThrow("Invalid phone number format");
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockAddPhoneToPending).not.toHaveBeenCalled();
  });

  test("returns success even if SMS provider fails after creating pending record", async () => {
    const { addPhoneToPendingUser } = await import("./auth.service");
    mockSendVerificationSMS.mockRejectedValueOnce(new Error("provider timeout"));

    const result = await addPhoneToPendingUser("user@test.com", "+15555550100");

    expect(mockUserFindFirst).toHaveBeenCalledWith({
      where: { phoneNumber: "+15555550100" },
    });
    expect(mockAddPhoneToPending).toHaveBeenCalledWith(
      "user@test.com",
      "+15555550100",
    );
    expect(result).toEqual({
      success: true,
      message: "Verification code sent to your phone",
    });
  });

  test("rejects when phone number already belongs to an existing user", async () => {
    const { addPhoneToPendingUser } = await import("./auth.service");
    mockUserFindFirst.mockResolvedValueOnce({ id: "user-existing" });

    await expect(
      addPhoneToPendingUser("user@test.com", "+15555550100"),
    ).rejects.toThrow("Phone number already in use");
    expect(mockAddPhoneToPending).not.toHaveBeenCalled();
  });
});
