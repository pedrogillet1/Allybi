import { describe, expect, jest, test } from "@jest/globals";
import { ResponseContractEnforcerService } from "../../services/core/enforcement/responseContractEnforcer.service";
import { writeCertificationGateReport } from "./reporting";

function bankById(bankId: string): unknown {
  switch (bankId) {
    case "render_policy":
      return {
        config: {
          markdown: { allowCodeBlocks: false, maxConsecutiveNewlines: 2 },
          noJsonOutput: { enabled: true, detectJsonLike: true },
        },
        enforcementRules: {
          rules: [{ id: "RP6_MAX_ONE_QUESTION", then: { maxQuestions: 1 } }],
        },
      };
    case "ui_contracts":
      return { config: { enabled: true } };
    case "banned_phrases":
      return {
        config: { enabled: true, actionOnMatch: "strip_or_replace" },
        categories: {},
        patterns: [],
        sourceLeakage: { patterns: [] },
        robotic: { en: [], pt: [], es: [] },
      };
    case "truncation_and_limits":
      return {
        globalLimits: {
          maxResponseCharsHard: 12000,
          maxResponseTokensHard: 3500,
        },
      };
    case "bullet_rules":
    case "table_rules":
    case "quote_styles":
    case "citation_styles":
    case "list_styles":
    case "table_styles":
      return { config: { enabled: true } };
    case "answer_style_policy":
      return {
        config: {
          enabled: true,
          globalRules: {
            maxQuestionsPerAnswer: 1,
            forceDoubleNewlineBetweenBlocks: false,
          },
        },
        profiles: {},
      };
    default:
      return { config: { enabled: true } };
  }
}

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (bankId: string) => bankById(bankId),
  getOptionalBank: (bankId: string) => bankById(bankId),
}));

describe("Certification: composition analytical structure", () => {
  test("analytical responses include synthesis and follow-up structure markers", () => {
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      {
        content: "Awareness was highest in urban households.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [
              {
                documentId: "doc-1",
                title: "Acesso_ao_Cadastro_Unico_PNAD_2014.pdf",
                location: { type: "page", value: 14, label: "Page 14" },
                locationKey: "d:doc-1|p:14|c:3",
                snippet: "In 2014, urban households reported higher awareness rates.",
              },
            ],
          } as any,
        ],
      },
      {
        answerMode: "general_answer",
        language: "en",
        signals: { queryProfile: "analytical" },
      },
    );

    const failures: string[] = [];
    const content = String(out.content || "");

    if (!content.includes("Direct answer:")) failures.push("MISSING_DIRECT_ANSWER");
    if (!content.includes("Key evidence:")) failures.push("MISSING_KEY_EVIDENCE");
    if (!content.includes("Sources used:")) failures.push("MISSING_SOURCES_USED");
    if (!content.includes("In summary,")) failures.push("MISSING_SYNTHESIS_MARKER");
    if (!content.includes("If you'd like,")) failures.push("MISSING_FOLLOWUP_MARKER");
    if (!content.includes("Page 14")) failures.push("MISSING_LOCATION_RICHNESS");

    writeCertificationGateReport("composition-analytical-structure", {
      passed: failures.length === 0,
      metrics: {
        hasDirectAnswer: content.includes("Direct answer:") ? 1 : 0,
        hasSynthesisMarker: content.includes("In summary,") ? 1 : 0,
        hasFollowupMarker: content.includes("If you'd like,") ? 1 : 0,
      },
      thresholds: {
        hasDirectAnswer: 1,
        hasSynthesisMarker: 1,
        hasFollowupMarker: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
