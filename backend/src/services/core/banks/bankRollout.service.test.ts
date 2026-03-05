import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("./bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "./bankLoader.service";
import { BankRolloutService } from "./bankRollout.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("BankRolloutService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses feature_flags id/defaultByEnv schema", () => {
    mockedGetOptionalBank.mockReturnValue({
      flags: [
        {
          id: "ff.sample",
          defaultByEnv: { dev: true },
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.sample", {});
    expect(out).toBe(true);
  });

  test("respects rolloutPercent when base flag is enabled", () => {
    mockedGetOptionalBank.mockReturnValue({
      flags: [
        {
          id: "ff.sample",
          defaultByEnv: { local: true },
          rolloutPercent: 0,
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.sample", {
      userId: "user-1",
    });
    expect(out).toBe(false);
  });
});
