import { describe, test, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Module mock — must appear before any import of the subject under test so
// Jest hoists it before module evaluation.
// ---------------------------------------------------------------------------
jest.mock("../core/banks/bankLoader.service");

import { getOptionalBank } from "../core/banks/bankLoader.service";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

// ---------------------------------------------------------------------------
// Typed mock helper
// ---------------------------------------------------------------------------
const mockGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

// ---------------------------------------------------------------------------
// Realistic bank fixtures
// ---------------------------------------------------------------------------
const mockConnectorsBank = {
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
            locale: "any",
            patterns: ["connect.*google", "sync.*drive"],
          },
        ],
      },
    },
  ],
};

const mockEmailBank = {
  config: {
    enabled: true,
    matching: {
      caseSensitive: false,
      stripDiacriticsForMatching: false,
      collapseWhitespace: false,
    },
  },
  rules: [
    {
      when: {
        any: [
          {
            type: "regex",
            locale: "en",
            patterns: ["send.*email", "compose.*mail"],
          },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper: configure the mock to return the two canonical banks
// ---------------------------------------------------------------------------
function setupBothBanks() {
  mockGetOptionalBank.mockImplementation((bankId: string) => {
    if (bankId === "connectors_routing") return mockConnectorsBank as any;
    if (bankId === "email_routing") return mockEmailBank as any;
    return null;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("TurnRoutePolicyService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default: both banks available
    setupBothBanks();
  });

  // -------------------------------------------------------------------------
  // Empty / blank messages
  // -------------------------------------------------------------------------
  describe("empty messages", () => {
    test("returns false for an empty string", () => {
      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("", "en")).toBe(false);
    });

    test("returns false for a whitespace-only string", () => {
      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("   ", "en")).toBe(false);
    });

    test("returns false for a tab-only string", () => {
      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("\t\n", "en")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Disabled bank config
  // -------------------------------------------------------------------------
  describe("disabled bank config", () => {
    test("returns false when connectorsRouting bank has enabled: false", () => {
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      const emailOnlyBank = {
        ...mockEmailBank,
        config: { ...mockEmailBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return emailOnlyBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      // Pattern would match connectors bank, but both banks are disabled
      expect(svc.isConnectorTurn("connect my google account", "en")).toBe(
        false,
      );
    });

    test("returns false when only the matching bank has enabled: false", () => {
      const disabledEmail = {
        ...mockEmailBank,
        config: { ...mockEmailBank.config, enabled: false },
      };
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return disabledEmail as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("send an email to alice", "en")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Connector routing pattern matches
  // -------------------------------------------------------------------------
  describe("connector routing pattern matching", () => {
    test("returns true when message matches first connector pattern", () => {
      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("connect my google account", "en")).toBe(true);
    });

    test("returns true when message matches second connector pattern", () => {
      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("sync my drive files", "en")).toBe(true);
    });

    test("returns true when connector pattern matches with mixed case (case-insensitive)", () => {
      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("CONNECT to Google Drive", "en")).toBe(true);
    });

    test("returns false when message does not match any connector pattern", () => {
      // Disable email bank so only connectors are checked
      const disabledEmail = {
        ...mockEmailBank,
        config: { ...mockEmailBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return mockConnectorsBank as any;
        if (bankId === "email_routing") return disabledEmail as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("what is the weather today", "en")).toBe(
        false,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Email routing pattern matches
  // -------------------------------------------------------------------------
  describe("email routing pattern matching", () => {
    test("returns true when message matches send email pattern", () => {
      // Disable connectors so we isolate email routing
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("send an email to bob", "en")).toBe(true);
    });

    test("returns true when message matches compose mail pattern", () => {
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("compose a mail to the team", "en")).toBe(
        true,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Locale filtering
  // -------------------------------------------------------------------------
  describe("locale filtering", () => {
    test("email patterns with locale 'en' match when locale argument is 'en'", () => {
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("send an email to alice", "en")).toBe(true);
    });

    test("email patterns with locale 'en' do NOT match when locale argument is 'pt'", () => {
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      // mockEmailBank rules have locale: "en", so 'pt' should not match
      expect(svc.isConnectorTurn("send an email to alice", "pt")).toBe(false);
    });

    test("email patterns with locale 'en' do NOT match when locale argument is 'es'", () => {
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("send an email to carlos", "es")).toBe(false);
    });

    test("connector patterns with locale 'any' match regardless of locale", () => {
      // mockConnectorsBank rules use locale: "any"
      const disabledEmail = {
        ...mockEmailBank,
        config: { ...mockEmailBank.config, enabled: false },
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return mockConnectorsBank as any;
        if (bankId === "email_routing") return disabledEmail as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("connect to google now", "pt")).toBe(true);
      expect(svc.isConnectorTurn("connect to google now", "es")).toBe(true);
      expect(svc.isConnectorTurn("connect to google now", "en")).toBe(true);
    });

    test("locale matching is case-insensitive in bank clause (lowercase normalization)", () => {
      // Provide a bank whose clause locale is uppercase "EN" — should still match locale "en"
      const bankWithUpperCaseLocale = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: false,
            collapseWhitespace: false,
          },
        },
        rules: [
          {
            when: {
              any: [
                { type: "regex", locale: "EN", patterns: ["test.*locale"] },
              ],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing")
          return bankWithUpperCaseLocale as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("test locale matching", "en")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Strict mode — missing banks
  // -------------------------------------------------------------------------
  describe("strict mode", () => {
    test("throws when both banks are missing in strict mode", () => {
      mockGetOptionalBank.mockReturnValue(null);

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /Missing required routing banks in strict mode/,
      );
    });

    test("throws mentioning connectors_routing when that bank is missing", () => {
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return null;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /connectors_routing/,
      );
    });

    test("throws mentioning email_routing when that bank is missing", () => {
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return mockConnectorsBank as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /email_routing/,
      );
    });

    test("does NOT throw when banks are missing in non-strict mode", () => {
      mockGetOptionalBank.mockReturnValue(null);

      expect(() => new TurnRoutePolicyService({ strict: false })).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Strict mode — invalid regex
  // -------------------------------------------------------------------------
  describe("strict mode — invalid regex patterns", () => {
    test("throws on invalid regex in connectors_routing bank in strict mode", () => {
      const bankWithBadRegex = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: false,
            collapseWhitespace: false,
          },
        },
        rules: [
          {
            when: {
              any: [
                { type: "regex", locale: "any", patterns: ["[invalid(regex"] },
              ],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return bankWithBadRegex as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /Invalid regex in connectors_routing/,
      );
    });

    test("throws on invalid regex in email_routing bank in strict mode", () => {
      const bankWithBadRegex = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: false,
            collapseWhitespace: false,
          },
        },
        rules: [
          {
            when: {
              any: [{ type: "regex", locale: "en", patterns: ["(unclosed"] }],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return mockConnectorsBank as any;
        if (bankId === "email_routing") return bankWithBadRegex as any;
        return null;
      });

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /Invalid regex in email_routing/,
      );
    });

    test("does NOT throw on invalid regex in non-strict mode (silently skips)", () => {
      const bankWithBadRegex = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: false,
            collapseWhitespace: false,
          },
        },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "any",
                  patterns: ["[bad", "sync.*drive"],
                },
              ],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return bankWithBadRegex as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      expect(() => new TurnRoutePolicyService({ strict: false })).not.toThrow();
    });

    test("invalid regex in non-strict mode is skipped; valid patterns in same clause still match", () => {
      const bankWithMixedRegex = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: false,
            collapseWhitespace: false,
          },
        },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "any",
                  // First pattern is bad; second is valid
                  patterns: ["[bad", "sync.*drive"],
                },
              ],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return bankWithMixedRegex as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      // The valid pattern "sync.*drive" should still fire
      expect(svc.isConnectorTurn("sync my drive files", "en")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Text normalization
  // -------------------------------------------------------------------------
  describe("text normalization", () => {
    test("strips diacritics before matching when stripDiacriticsForMatching is true", () => {
      // mockConnectorsBank has stripDiacriticsForMatching: true
      // Message contains accented chars; stripped form matches "connect.*google"
      const svc = new TurnRoutePolicyService();
      // "cönnéct" → stripped → "connect"
      expect(svc.isConnectorTurn("cönnéct to google services", "en")).toBe(
        true,
      );
    });

    test("collapses multiple whitespace into single space before matching", () => {
      // mockConnectorsBank has collapseWhitespace: true
      const svc = new TurnRoutePolicyService();
      // Extra spaces should be collapsed so "sync   my   drive" → "sync my drive"
      expect(svc.isConnectorTurn("sync   my   drive  files", "en")).toBe(true);
    });

    test("trims leading and trailing whitespace", () => {
      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("   connect my google account   ", "en")).toBe(
        true,
      );
    });

    test("diacritics are NOT stripped when stripDiacriticsForMatching is false", () => {
      // mockEmailBank has stripDiacriticsForMatching: false
      // A bank whose pattern only matches the un-diacritic-ized form should not fire
      // when the original message differs after stripping
      const bankNoStrip = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: false,
            collapseWhitespace: false,
          },
        },
        rules: [
          {
            when: {
              any: [{ type: "regex", locale: "any", patterns: ["^plain$"] }],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return bankNoStrip as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      // "pläin" with diacritics — stripDiacritics is false so it stays as "pläin"
      // The pattern "^plain$" should NOT match "pläin"
      expect(svc.isConnectorTurn("pläin", "en")).toBe(false);
      // The literal "plain" should match
      expect(svc.isConnectorTurn("plain", "en")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Clause type filtering
  // -------------------------------------------------------------------------
  describe("clause type filtering", () => {
    test("ignores clauses whose type is not 'regex'", () => {
      const bankWithNonRegexClause = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: false,
            collapseWhitespace: false,
          },
        },
        rules: [
          {
            when: {
              any: [
                // type is "keyword" — should be skipped entirely
                {
                  type: "keyword",
                  locale: "any",
                  patterns: ["connect.*google"],
                },
              ],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing")
          return bankWithNonRegexClause as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      // Even though the pattern would match, the clause type is wrong
      expect(svc.isConnectorTurn("connect to google", "en")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases — empty rules / missing fields
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    test("returns false when bank has no rules array", () => {
      const bankNoRules = {
        config: { enabled: true, matching: {} },
        // rules intentionally omitted
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return bankNoRules as any;
        if (bankId === "email_routing") return bankNoRules as any;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      expect(svc.isConnectorTurn("connect to google", "en")).toBe(false);
    });

    test("returns false when bank rules have empty patterns array", () => {
      const bankEmptyPatterns = {
        config: { enabled: true, matching: {} },
        rules: [
          {
            when: {
              any: [{ type: "regex", locale: "any", patterns: [] }],
            },
          },
        ],
      };
      mockGetOptionalBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return bankEmptyPatterns as any;
        if (bankId === "email_routing") return bankEmptyPatterns as any;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      expect(svc.isConnectorTurn("connect to google", "en")).toBe(false);
    });

    test("getOptionalBank is called with the correct bank IDs at construction", () => {
      new TurnRoutePolicyService();

      const calledIds = mockGetOptionalBank.mock.calls.map(
        (call) => call[0] as string,
      );
      expect(calledIds).toContain("connectors_routing");
      expect(calledIds).toContain("email_routing");
    });
  });
});
