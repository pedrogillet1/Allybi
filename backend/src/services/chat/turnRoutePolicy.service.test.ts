import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { getOptionalBank } from "../core/banks/bankLoader.service";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

type RoutingBank = {
  config?: {
    enabled?: boolean;
    matching?: {
      caseSensitive?: boolean;
      stripDiacriticsForMatching?: boolean;
      collapseWhitespace?: boolean;
    };
  };
  rules?: Array<{
    when?: {
      any?: Array<{
        type?: string;
        locale?: string;
        patterns?: string[];
      }>;
    };
  }>;
};

function bankWithPatterns(patterns: string[], locale = "any"): RoutingBank {
  return {
    config: {
      enabled: true,
      matching: {
        caseSensitive: false,
        stripDiacriticsForMatching: true,
        collapseWhitespace: true,
      },
    },
    rules: [
      {
        when: {
          any: [
            {
              type: "regex",
              locale,
              patterns,
            },
          ],
        },
      },
    ],
  };
}

describe("TurnRoutePolicyService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
    delete process.env.NODE_ENV;
  });

  it("matches connector/email regex from bank", () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "email_routing") return bankWithPatterns(["\\bemail\\b"]);
      if (id === "connectors_routing") return bankWithPatterns(["\\bslack\\b"]);
      return null;
    });

    const svc = new TurnRoutePolicyService({ strict: false });
    expect(svc.isConnectorTurn("send this by email", "en")).toBe(true);
    expect(svc.isConnectorTurn("post this to slack", "en")).toBe(true);
    expect(svc.isConnectorTurn("what is the summary?", "en")).toBe(false);
  });

  it("throws in strict mode when required banks are missing", () => {
    process.env.NODE_ENV = "production";
    mockedGetOptionalBank.mockReturnValue(null);
    expect(() => new TurnRoutePolicyService()).toThrow(
      /Missing required routing banks in strict mode/i,
    );
  });

  it("does not throw in non-strict mode when banks are missing", () => {
    mockedGetOptionalBank.mockReturnValue(null);
    const svc = new TurnRoutePolicyService({ strict: false });
    expect(svc.isConnectorTurn("anything", "en")).toBe(false);
  });

  it("fails fast on invalid regex in strict mode", () => {
    process.env.NODE_ENV = "staging";
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "email_routing") return bankWithPatterns(["[invalid"]);
      if (id === "connectors_routing") return bankWithPatterns(["\\bslack\\b"]);
      return null;
    });
    expect(() => new TurnRoutePolicyService()).toThrow(
      /Invalid regex in email_routing/i,
    );
  });
});
