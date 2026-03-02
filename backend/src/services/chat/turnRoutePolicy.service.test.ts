import { describe, test, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Module mock — must appear before any import of the subject under test so
// Jest hoists it before module evaluation.
// ---------------------------------------------------------------------------
jest.mock("../core/banks/bankLoader.service");
jest.mock("../core/banks/documentIntelligenceBanks.service", () => ({
  getDocumentIntelligenceBanksInstance: jest.fn(),
}));

import { getDocumentIntelligenceBanksInstance } from "../core/banks/documentIntelligenceBanks.service";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";

// ---------------------------------------------------------------------------
// Typed mock helper
// ---------------------------------------------------------------------------
const mockGetDocumentIntelligenceBanksInstance =
  getDocumentIntelligenceBanksInstance as jest.MockedFunction<
    typeof getDocumentIntelligenceBanksInstance
  >;
const mockGetRoutingBank = jest.fn<(bankId: string) => any>();

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
  mockGetRoutingBank.mockImplementation((bankId: string) => {
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
    mockGetDocumentIntelligenceBanksInstance.mockReturnValue({
      getRoutingBank: mockGetRoutingBank,
    } as any);
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("send an email to alice", "en")).toBe(true);
    });

    test("falls back to english email patterns when locale argument is 'pt'", () => {
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("send an email to alice", "pt")).toBe(true);
    });

    test("falls back to english email patterns when locale argument is 'es'", () => {
      const disabledConnectors = {
        ...mockConnectorsBank,
        config: { ...mockConnectorsBank.config, enabled: false },
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return disabledConnectors as any;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService();
      expect(svc.isConnectorTurn("send an email to carlos", "es")).toBe(true);
    });

    test("connector patterns with locale 'any' match regardless of locale", () => {
      // mockConnectorsBank rules use locale: "any"
      const disabledEmail = {
        ...mockEmailBank,
        config: { ...mockEmailBank.config, enabled: false },
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockReturnValue(null);

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /Missing required routing banks in strict mode/,
      );
    });

    test("throws mentioning connectors_routing when that bank is missing", () => {
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return null;
        if (bankId === "email_routing") return mockEmailBank as any;
        return null;
      });

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /connectors_routing/,
      );
    });

    test("throws mentioning email_routing when that bank is missing", () => {
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return mockConnectorsBank as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      expect(() => new TurnRoutePolicyService({ strict: true })).toThrow(
        /email_routing/,
      );
    });

    test("does NOT throw when banks are missing in non-strict mode", () => {
      mockGetRoutingBank.mockReturnValue(null);

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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
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
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return bankEmptyPatterns as any;
        if (bankId === "email_routing") return bankEmptyPatterns as any;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      expect(svc.isConnectorTurn("connect to google", "en")).toBe(false);
    });

    test("getOptionalBank is called with the correct bank IDs at construction", () => {
      new TurnRoutePolicyService();

      const calledIds = mockGetRoutingBank.mock.calls.map(
        (call) => call[0] as string,
      );
      expect(calledIds).toContain("connectors_routing");
      expect(calledIds).toContain("email_routing");
    });
  });

  describe("guardrails and provider routing", () => {
    test("reroutes sync to CONNECT_START when provider is not connected", () => {
      const connectorsBank = {
        config: {
          enabled: true,
          guardrails: { requireConnectBeforeSyncOrSearch: true },
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: {
            intent: "CONNECTORS",
            domain: "connectors",
            scope: "connectors",
          },
          thresholds: { minConfidence: 0.57 },
        },
        providers: { allowed: ["gmail", "outlook", "slack"] },
        rules: [
          {
            ruleId: "CR_SYNC",
            priority: 90,
            reasonCode: "connector_sync_requested",
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: ["\\bsync\\b.{0,20}\\bgmail\\b"],
                },
              ],
            },
            then: {
              intent: "CONNECTORS",
              operator: "CONNECTOR_SYNC",
              domain: "connectors",
              scope: "connectors",
            },
            confidenceBoost: 0.15,
          },
        ],
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return connectorsBank as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("sync gmail now", "en", {
        connectedProviders: { gmail: false },
      });

      expect(decision).not.toBeNull();
      expect(decision?.operatorId).toBe("CONNECT_START");
      expect(decision?.providerId).toBe("gmail");
      expect(decision?.decisionNotes).toContain(
        "guardrail:require_connect_before_sync_or_search",
      );
    });

    test("keeps sync operator when provider is connected", () => {
      const connectorsBank = {
        config: {
          enabled: true,
          guardrails: { requireConnectBeforeSyncOrSearch: true },
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: {
            intent: "CONNECTORS",
            domain: "connectors",
            scope: "connectors",
          },
          thresholds: { minConfidence: 0.57 },
        },
        providers: { allowed: ["gmail", "outlook", "slack"] },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: ["\\bsync\\b.{0,20}\\bgmail\\b"],
                },
              ],
            },
            then: {
              intent: "CONNECTORS",
              operator: "CONNECTOR_SYNC",
              domain: "connectors",
              scope: "connectors",
            },
          },
        ],
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return connectorsBank as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("sync gmail now", "en", {
        connectedProviders: { gmail: true },
      });

      expect(decision?.operatorId).toBe("CONNECTOR_SYNC");
      expect(decision?.providerId).toBe("gmail");
    });

    test("enforces permission guardrail for connector search", () => {
      const connectorsBank = {
        config: {
          enabled: true,
          guardrails: { neverReadConnectorContentWithoutUserPermission: true },
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: {
            intent: "CONNECTORS",
            domain: "connectors",
            scope: "connectors",
          },
          thresholds: { minConfidence: 0.57 },
        },
        providers: { allowed: ["gmail", "outlook", "slack"] },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: ["\\bsearch\\b.{0,20}\\bgmail\\b"],
                },
              ],
            },
            then: {
              intent: "CONNECTORS",
              operator: "CONNECTOR_SEARCH",
              domain: "connectors",
              scope: "connectors",
            },
          },
        ],
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return connectorsBank as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("search gmail", "en", {
        connectedProviders: { gmail: true },
        hasConnectorReadPermission: false,
      });

      expect(decision?.operatorId).toBe("CONNECTOR_STATUS");
      expect(decision?.decisionNotes).toContain(
        "guardrail:permission_required_for_connector_content",
      );
    });

    test("marks disconnect routes as requires confirmation", () => {
      const connectorsBank = {
        config: {
          enabled: true,
          guardrails: { disconnectAlwaysConfirm: true },
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: {
            intent: "CONNECTORS",
            domain: "connectors",
            scope: "connectors",
          },
          thresholds: { minConfidence: 0.57 },
        },
        providers: {
          allowed: ["gmail", "outlook", "slack"],
          aliases: { "office 365": "outlook" },
        },
        operators: { alwaysConfirm: [] },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: ["disconnect.*office 365"],
                },
              ],
            },
            then: {
              intent: "CONNECTORS",
              operator: "CONNECTOR_DISCONNECT",
              domain: "connectors",
              scope: "connectors",
            },
          },
        ],
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return connectorsBank as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision(
        "disconnect office 365",
        "en",
      );

      expect(decision?.providerId).toBe("outlook");
      expect(decision?.requiresConfirmation).toBe(true);
      expect(decision?.decisionNotes).toContain("requires_confirmation");
    });

    test("marks EMAIL_SEND as requires confirmation from email bank", () => {
      const emailBank = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: { intent: "EMAIL", domain: "email", scope: "email" },
          thresholds: { minConfidence: 0.58 },
        },
        providers: { allowed: ["gmail", "outlook", "email"] },
        operators: { alwaysConfirm: ["EMAIL_SEND"] },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: ["\\bsend\\b.{0,20}\\bemail\\b"],
                },
              ],
            },
            then: {
              intent: "EMAIL",
              operator: "EMAIL_SEND",
              domain: "email",
              scope: "email",
            },
          },
        ],
      };
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return null;
        if (bankId === "email_routing") return emailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision(
        "send email to finance",
        "en",
      );

      expect(decision?.intentFamily).toBe("email");
      expect(decision?.operatorId).toBe("EMAIL_SEND");
      expect(decision?.requiresConfirmation).toBe(true);
      expect(decision?.decisionNotes).toContain("requires_confirmation");
    });

    test("reroutes email_latest to slack connector search when query clearly targets slack", () => {
      const emailBank = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: { intent: "EMAIL", domain: "email", scope: "email" },
          thresholds: { minConfidence: 0.58 },
        },
        providers: { allowed: ["gmail", "outlook", "email"] },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: ["\\b(latest|last)\\b.{0,10}\\b(message|email)\\b"],
                },
              ],
            },
            then: {
              intent: "EMAIL",
              operator: "EMAIL_LATEST",
              domain: "email",
              scope: "email",
            },
          },
        ],
      };
      const connectorsBank = {
        config: {
          enabled: true,
          guardrails: {
            requireConnectBeforeSyncOrSearch: false,
          },
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: { intent: "CONNECTORS", domain: "connectors", scope: "connectors" },
          thresholds: { minConfidence: 0.57 },
        },
        providers: { allowed: ["gmail", "outlook", "slack"] },
        rules: [],
      };

      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return connectorsBank as any;
        if (bankId === "email_routing") return emailBank as any;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision(
        "show my latest slack message",
        "en",
        {
          connectedProviders: { slack: true },
          hasConnectorReadPermission: true,
        },
      );

      expect(decision?.intentFamily).toBe("connectors");
      expect(decision?.operatorId).toBe("CONNECTOR_SEARCH");
      expect(decision?.providerId).toBe("slack");
      expect(decision?.decisionNotes).toContain(
        "guardrail:slack_terms_prefer_connector_search",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // P0-4: Connector permission guardrail — default-deny semantics
  // ---------------------------------------------------------------------------
  describe("P0-4: neverReadConnectorContentWithoutUserPermission default-deny", () => {
    // Helper: build a connectors bank with a CONNECTOR_SEARCH rule and
    // configurable guardrails
    function makeSearchBank(guardrails: Record<string, unknown> = {}) {
      return {
        config: {
          enabled: true,
          guardrails,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
          defaults: {
            intent: "CONNECTORS",
            domain: "connectors",
            scope: "connectors",
          },
          thresholds: { minConfidence: 0.57 },
        },
        providers: { allowed: ["gmail", "outlook", "slack"] },
        rules: [
          {
            ruleId: "CR_SEARCH",
            priority: 85,
            reasonCode: "connector_search_requested",
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: ["\\bsearch\\b.{0,20}\\bgmail\\b"],
                },
              ],
            },
            then: {
              intent: "CONNECTORS",
              operator: "CONNECTOR_SEARCH",
              domain: "connectors",
              scope: "connectors",
            },
            confidenceBoost: 0.1,
          },
        ],
      };
    }

    test("guardrail undefined → guardrail ON: reroutes CONNECTOR_SEARCH to CONNECTOR_STATUS when permission not explicitly true", () => {
      // neverReadConnectorContentWithoutUserPermission is NOT set in guardrails
      // The default-deny logic treats undefined as active (via !== false check)
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing") return makeSearchBank({}) as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("search gmail", "en", {
        connectedProviders: { gmail: true },
        // hasConnectorReadPermission not provided (undefined)
      });

      expect(decision).not.toBeNull();
      expect(decision?.operatorId).toBe("CONNECTOR_STATUS");
      expect(decision?.decisionNotes).toContain(
        "guardrail:permission_required_for_connector_content",
      );
    });

    test("hasConnectorReadPermission undefined → DENIED: reroutes to CONNECTOR_STATUS", () => {
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing")
          return makeSearchBank({
            neverReadConnectorContentWithoutUserPermission: true,
          }) as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("search gmail", "en", {
        connectedProviders: { gmail: true },
        // hasConnectorReadPermission is undefined
      });

      expect(decision).not.toBeNull();
      expect(decision?.operatorId).toBe("CONNECTOR_STATUS");
      expect(decision?.decisionNotes).toContain(
        "guardrail:permission_required_for_connector_content",
      );
    });

    test("hasConnectorReadPermission true → GRANTED: keeps CONNECTOR_SEARCH", () => {
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing")
          return makeSearchBank({
            neverReadConnectorContentWithoutUserPermission: true,
          }) as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("search gmail", "en", {
        connectedProviders: { gmail: true },
        hasConnectorReadPermission: true,
      });

      expect(decision).not.toBeNull();
      expect(decision?.operatorId).toBe("CONNECTOR_SEARCH");
      // Should NOT contain the permission denial note
      expect(decision?.decisionNotes).not.toContain(
        "guardrail:permission_required_for_connector_content",
      );
    });

    test("hasConnectorReadPermission false → DENIED: reroutes to CONNECTOR_STATUS", () => {
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing")
          return makeSearchBank({
            neverReadConnectorContentWithoutUserPermission: true,
          }) as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("search gmail", "en", {
        connectedProviders: { gmail: true },
        hasConnectorReadPermission: false,
      });

      expect(decision).not.toBeNull();
      expect(decision?.operatorId).toBe("CONNECTOR_STATUS");
      expect(decision?.decisionNotes).toContain(
        "guardrail:permission_required_for_connector_content",
      );
    });

    test("guardrail explicitly false → guardrail OFF: allows CONNECTOR_SEARCH without permission", () => {
      // When neverReadConnectorContentWithoutUserPermission is explicitly false,
      // the guardrail should be disabled (the !== false check evaluates to false)
      mockGetRoutingBank.mockImplementation((bankId: string) => {
        if (bankId === "connectors_routing")
          return makeSearchBank({
            neverReadConnectorContentWithoutUserPermission: false,
          }) as any;
        if (bankId === "email_routing") return null;
        return null;
      });

      const svc = new TurnRoutePolicyService({ strict: false });
      const decision = svc.resolveConnectorDecision("search gmail", "en", {
        connectedProviders: { gmail: true },
        // No permission given, but guardrail is explicitly disabled
      });

      expect(decision).not.toBeNull();
      expect(decision?.operatorId).toBe("CONNECTOR_SEARCH");
      expect(decision?.decisionNotes).not.toContain(
        "guardrail:permission_required_for_connector_content",
      );
    });
  });
});
