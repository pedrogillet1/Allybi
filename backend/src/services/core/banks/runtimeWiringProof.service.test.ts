import { describe, expect, test } from "@jest/globals";
import "reflect-metadata";

import { TurnRoutePolicyService } from "../../chat/turnRoutePolicy.service";
import { QualityGateRunnerService } from "../enforcement/qualityGateRunner.service";

describe("Runtime wiring proof (bank-driven behavior)", () => {
  test("turn route policy changes behavior when routing bank regex changes", () => {
    const bankA = {
      getRoutingBank: (bankId: string) => {
        if (bankId === "connectors_routing") {
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
                      locale: "any",
                      patterns: ["connect.*slack"],
                    },
                  ],
                },
                then: {
                  intent: "connectors",
                  operator: "connect_slack",
                  domain: "connectors",
                },
              },
            ],
          };
        }
        if (bankId === "email_routing") {
          return {
            config: { enabled: false },
            rules: [],
          };
        }
        return null;
      },
    };

    const bankB = {
      getRoutingBank: (bankId: string) => {
        if (bankId === "connectors_routing") {
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
                      locale: "any",
                      patterns: ["sync.*drive"],
                    },
                  ],
                },
                then: {
                  intent: "connectors",
                  operator: "sync_drive",
                  domain: "connectors",
                },
              },
            ],
          };
        }
        if (bankId === "email_routing") {
          return {
            config: { enabled: false },
            rules: [],
          };
        }
        return null;
      },
    };

    const svcA = new TurnRoutePolicyService({
      strict: true,
      banks: bankA as any,
    });
    const svcB = new TurnRoutePolicyService({
      strict: true,
      banks: bankB as any,
    });

    const message = "please connect slack for this workspace";
    expect(svcA.isConnectorTurn(message, "en")).toBe(true);
    expect(svcB.isConnectorTurn(message, "en")).toBe(false);
  });

  test("quality gate runner changes result when docint quality bank is toggled", async () => {
    const noPolicyBanks = {
      getQualityGateBank: (_type: string) => null,
    };
    const policyEnabledBanks = {
      getQualityGateBank: (type: string) =>
        type === "source_policy" ? { config: { enabled: true } } : null,
    };

    const runnerWithoutPolicy = new QualityGateRunnerService(
      noPolicyBanks as any,
    );
    const runnerWithPolicy = new QualityGateRunnerService(
      policyEnabledBanks as any,
    );

    const response = "| value | source |\n|---|---|\n| 10 | [doc-1] |";
    const ctx = {
      answerMode: "nav_pills",
    };

    const resultWithoutPolicy = await runnerWithoutPolicy.runGates(
      response,
      ctx,
    );
    const resultWithPolicy = await runnerWithPolicy.runGates(response, ctx);

    const withPolicyGate = resultWithPolicy.results.find(
      (gate) => gate.gateName === "source_policy_navigation_mode",
    );

    expect(withPolicyGate).toBeDefined();
    expect(withPolicyGate?.passed).toBe(false);
    expect(
      resultWithoutPolicy.results.some(
        (g) => g.gateName === "source_policy_navigation_mode",
      ),
    ).toBe(false);
  });
});
