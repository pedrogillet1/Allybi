import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ComposeMicrocopyService } from "./composeMicrocopy.service";

const mockGetOptionalBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
}));

describe("ComposeMicrocopyService", () => {
  beforeEach(() => {
    mockGetOptionalBank.mockReset();
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "openers") {
        return {
          config: { enabled: true },
          openers: [
            {
              id: "o1",
              language: "en",
              intent: "extract",
              text: "I found relevant evidence.",
            },
          ],
        };
      }
      if (bankId === "followup_suggestions_v1c6269cc") {
        return {
          config: { enabled: true },
          suggestions: [
            {
              id: "new1",
              language: "en",
              intent: "extract",
              text: "validate this against the adjacent section.",
            },
          ],
        };
      }
      if (bankId === "followup_suggestions") {
        return {
          config: { enabled: true },
          suggestions: [
            {
              id: "legacy1",
              language: "en",
              intent: "extract",
              text: "legacy follow-up that should not be preferred.",
            },
          ],
        };
      }
      if (bankId === "citation_policy") {
        return { config: { enabled: true, maxCitationsPerClaim: 2 } };
      }
      return { config: { enabled: true } };
    });
  });

  test("prefers versioned follow-up bank over legacy bank when both exist", () => {
    const service = new ComposeMicrocopyService();
    const copy = service.resolveAnalyticalCopy({
      language: "en",
      seed: "seed-1",
      intent: "extract",
    });

    expect(copy.followupLine).toContain(
      "validate this against the adjacent section.",
    );
    expect(copy.followupLine).not.toContain(
      "legacy follow-up that should not be preferred.",
    );
  });

  test("does not fallback to legacy follow-up bank when canonical bank is absent", () => {
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "openers") {
        return {
          config: { enabled: true },
          openers: [
            {
              id: "o1",
              language: "en",
              intent: "extract",
              text: "I found relevant evidence.",
            },
          ],
        };
      }
      if (bankId === "followup_suggestions_v1c6269cc") {
        return null;
      }
      if (bankId === "followup_suggestions") {
        return {
          config: { enabled: true },
          suggestions: [
            {
              id: "legacy1",
              language: "en",
              intent: "extract",
              text: "legacy follow-up that should be ignored.",
            },
          ],
        };
      }
      if (bankId === "citation_policy") {
        return { config: { enabled: true, maxCitationsPerClaim: 2 } };
      }
      return { config: { enabled: true } };
    });

    const service = new ComposeMicrocopyService();
    const copy = service.resolveAnalyticalCopy({
      language: "en",
      seed: "seed-2",
      intent: "extract",
    });

    expect(copy.followupLine).toContain(
      "I can also break this down by document section.",
    );
    expect(copy.followupLine).not.toContain("legacy follow-up");
  });
});
