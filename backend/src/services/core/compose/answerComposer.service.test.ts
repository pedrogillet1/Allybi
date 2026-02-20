import { describe, expect, it, jest } from "@jest/globals";

import { AnswerComposerService } from "./answerComposer.service";
import { getBank } from "../banks/bankLoader.service";

jest.mock("../banks/bankLoader.service", () => ({
  getBank: jest.fn(),
}));

jest.mock("../inputs/markdownNormalizer.service", () => ({
  getMarkdownNormalizer: () => ({
    normalize: (text: string) => ({ text, repairs: [], warnings: [] }),
    enforceShortParagraphs: (text: string) => ({ text, repaired: false }),
  }),
}));

jest.mock("../inputs/boldingNormalizer.service", () => ({
  getBoldingNormalizer: () => ({
    normalize: ({ text }: { text: string }) => ({
      text,
      meta: { transformations: [] },
    }),
  }),
}));

jest.mock("../inputs/boilerplateStripper.service", () => ({
  getBoilerplateStripper: () => ({
    strip: (text: string) => ({ text, modified: false }),
  }),
}));

const mockedGetBank = getBank as jest.MockedFunction<typeof getBank>;

function makeStyleBank(profileSelection?: any) {
  const budget = {
    maxChars: 4000,
    maxParagraphs: 8,
    maxBullets: 14,
    maxTableRows: 20,
    maxQuoteLines: 7,
    maxQuestions: 1,
  };

  const behavior = {
    intro: "always" as const,
    conclusion: "always" as const,
    allowFollowup: false,
  };

  return {
    _meta: { id: "answer_style_policy" },
    config: { enabled: true },
    profiles: {
      micro: {
        name: "micro",
        budget: { ...budget, maxChars: 260 },
        behavior: {
          ...behavior,
          intro: "never" as const,
          conclusion: "never" as const,
        },
      },
      brief: { name: "brief", budget: { ...budget, maxChars: 520 }, behavior },
      concise: {
        name: "concise",
        budget: { ...budget, maxChars: 900 },
        behavior,
      },
      standard: { name: "standard", budget, behavior },
      detailed: {
        name: "detailed",
        budget: { ...budget, maxChars: 5000 },
        behavior,
      },
      deep: { name: "deep", budget: { ...budget, maxChars: 6000 }, behavior },
    },
    blockPlanner: {
      plansByProfile: {
        micro: { default: ["answer_direct"] },
        brief: { default: ["intro", "answer_direct", "conclusion"] },
        concise: { default: ["intro", "answer_direct", "conclusion"] },
        standard: { default: ["intro", "answer_direct", "conclusion"] },
        detailed: { default: ["intro", "answer_direct", "conclusion"] },
        deep: { default: ["intro", "answer_direct", "conclusion"] },
      },
    },
    profileSelection,
  };
}

describe("AnswerComposerService", () => {
  it("uses bank-driven profileSelection when rules match", () => {
    mockedGetBank.mockImplementation((id: string) => {
      if (id === "answer_style_policy") {
        return makeStyleBank({
          rulesOrder: ["custom", "default_standard"],
          rules: {
            custom: { whenAny: ["signals.justAnswer"], choose: "detailed" },
            default_standard: { whenAny: ["always"], choose: "standard" },
          },
        }) as any;
      }
      return undefined as any;
    });

    const service = new AnswerComposerService();
    const out = service.compose({
      ctx: {
        conversationId: "c1",
        turnId: "t1",
        regenCount: 0,
        answerMode: "doc_grounded_single",
        operator: "summarize",
        intentFamily: "documents",
        language: "en",
        originalQuery: "summarize",
        signals: { justAnswer: true },
      },
      draft: "This is a valid draft answer with enough length.",
    });

    expect(out.meta.profile).toBe("detailed");
  });

  it("falls back to built-in heuristics when profileSelection is missing", () => {
    mockedGetBank.mockImplementation((id: string) => {
      if (id === "answer_style_policy") return makeStyleBank() as any;
      return undefined as any;
    });

    const service = new AnswerComposerService();
    const out = service.compose({
      ctx: {
        conversationId: "c1",
        turnId: "t1",
        regenCount: 0,
        answerMode: "doc_grounded_single",
        operator: "compute",
        intentFamily: "documents",
        language: "en",
        originalQuery: "compute",
      },
      draft: "This is a valid draft answer with enough length.",
    });

    expect(out.meta.profile).toBe("concise");
  });

  it("strips inline Sources sections from model draft text", () => {
    mockedGetBank.mockImplementation((id: string) => {
      if (id === "answer_style_policy") return makeStyleBank() as any;
      return undefined as any;
    });

    const service = new AnswerComposerService();
    const out = service.compose({
      ctx: {
        conversationId: "c1",
        turnId: "t1",
        regenCount: 0,
        answerMode: "doc_grounded_single",
        operator: "summarize",
        intentFamily: "documents",
        language: "en",
        originalQuery: "summarize",
      },
      draft: "Answer body.\n\nSources:\n- file.pdf p.1",
    });

    expect(out.content).toContain("Answer body.");
    expect(out.content).not.toMatch(/Sources\s*:/i);
  });
});
