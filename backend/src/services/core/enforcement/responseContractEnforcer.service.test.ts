import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockGetBank = jest.fn();
const mockGetOptionalBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
}));

function bankById(bankId: string): unknown {
  switch (bankId) {
    case "render_policy":
      return {
        config: {
          markdown: { allowCodeBlocks: false, maxConsecutiveNewlines: 2 },
          noJsonOutput: { enabled: true, detectJsonLike: true },
        },
      };
    case "ui_contracts":
      return {
        _meta: { id: "ui_contracts", version: "1.0.0" },
        config: {
          enabled: true,
          contracts: {
            nav_pills: {
              maxIntroSentences: 1,
              maxIntroChars: 40,
              noSourcesHeader: true,
              disallowedTextPatterns: ["\\bSources?:\\b"],
              allowedAttachments: ["source_buttons"],
              disallowedAttachments: ["actions"],
              suppressActions: true,
            },
          },
          actionsContract: {
            thresholds: {
              maxIntroSentencesNavPills: 1,
              maxClarificationQuestions: 1,
            },
          },
        },
      };
    case "banned_phrases":
      return {
        config: { enabled: true, actionOnMatch: "strip_or_replace" },
        categories: {
          debug_leakage: { severity: "critical", action: "strip" },
          filler_phrases: { severity: "low", action: "strip" },
        },
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
      return { config: { enabled: true } };
    case "table_rules":
      return { config: { enabled: true, maxRowsHard: 3, maxCellCharsHard: 64 } };
    case "quote_styles":
      return { config: { enabled: true, maxLines: 8, requireAttribution: true } };
    case "citation_styles":
      return { config: { enabled: true } };
    case "list_styles":
      return { config: { enabled: true, marker: "-" } };
    case "table_styles":
      return { config: { enabled: true } };
    case "answer_style_policy":
      return {
        config: {
          enabled: true,
          globalRules: {
            maxQuestionsPerAnswer: 1,
            forceDoubleNewlineBetweenBlocks: true,
            paragraphRules: {
              maxSentencesPerParagraph: 2,
              maxCharsPerParagraph: 260,
            },
            answerModeOverrides: {
              scoped_not_found: {
                allowBullets: false,
                allowTables: false,
                allowQuotes: false,
                maxQuestions: 0,
              },
            },
          },
        },
        profiles: {
          brief: {
            budget: { maxChars: 120, maxQuestions: 1 },
          },
          standard: {
            budget: { maxChars: 900, maxQuestions: 1 },
          },
        },
      };
    case "bolding_rules":
      return {
        config: { enabled: true, defaultBoldingEnabled: true },
        densityControl: {
          maxBoldRatioSoft: 0.1,
          maxBoldRatioHard: 0.15,
          maxBoldSpansPerParagraph: 2,
          maxBoldSpansPerBullet: 1,
          maxBoldSpansTotal: 6,
          minCharsBetweenBoldSpans: 12,
        },
        spanLimits: {
          maxCharsPerSpanHard: 40,
          maxWordsPerSpanHard: 6,
          neverBoldEntireSentence: true,
          neverBoldEntireBullet: true,
        },
        modeSuppressions: {
          conversation: { boldingEnabled: false },
        },
      };
    case "operator_contracts":
      return {
        operators: [
          {
            id: "quote",
            preferredAnswerMode: "doc_grounded_quote",
            outputs: {
              primaryShape: "quote",
              allowedShapes: ["quote"],
            },
          },
          {
            id: "open",
            preferredAnswerMode: "nav_pills",
            outputs: {
              primaryShape: "button_only",
              allowedShapes: ["button_only"],
            },
          },
        ],
      };
    case "operator_output_shapes":
      return {
        mapping: {
          quote: {
            defaultShape: "quote",
            allowedShapes: ["quote"],
          },
          open: {
            defaultShape: "button_only",
            allowedShapes: ["button_only"],
          },
        },
      };
    case "ui_receipt_shapes":
      return { config: { enabled: true }, mappings: [] };
    default:
      return {};
  }
}

describe("ResponseContractEnforcerService nav_pills contract", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetOptionalBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => bankById(bankId));
    mockGetOptionalBank.mockImplementation((bankId: string) =>
      bankById(bankId),
    );
  });

  test("blocks nav_pills response when source_buttons attachment is missing", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "Sources: Contract.pdf\\n- Contract.pdf\\nOpen the file and jump to the clause now.",
        attachments: [],
      },
      {
        answerMode: "nav_pills",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("nav_pills_missing_buttons");
    expect(out.enforcement.warnings).toContain(
      "NAV_PILLS_MISSING_SOURCE_BUTTONS",
    );
  });

  test("strips inline sources text and passes when source buttons are present", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "Sources: Budget.xlsx\\n- Budget.xlsx\\nOpen the budget sheet and pick a section for me to jump to.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [{ id: "doc-1", label: "Budget.xlsx" }],
          } as any,
        ],
      },
      {
        answerMode: "nav_pills",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content.length).toBeLessThanOrEqual(40);
    expect(out.enforcement.repairs).toContain("NAV_PILLS_BODY_TRIMMED");
  });

  test("hard blocks when ui_contract rule with hard_block action matches", async () => {
    mockGetBank.mockImplementation((bankId: string) => {
      if (bankId !== "ui_contracts") return bankById(bankId);
      return {
        ...bankById("ui_contracts"),
        rules: [
          {
            id: "no_sources_header_anywhere_in_nav_pills",
            reasonCode: "nav_pills_sources_label",
            when: {
              all: [{ path: "answerMode", op: "eq", value: "nav_pills" }],
            },
            triggerPatterns: { en: ["\\bSources?:"] },
            action: { type: "hard_block" },
          },
        ],
      };
    });

    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Sources: Budget.xlsx",
        attachments: [],
      },
      {
        answerMode: "nav_pills",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("nav_pills_sources_label");
  });

  test("suppresses action confirmation language when ui_contract rule matches", async () => {
    mockGetBank.mockImplementation((bankId: string) => {
      if (bankId !== "ui_contracts") return bankById(bankId);
      return {
        ...bankById("ui_contracts"),
        rules: [
          {
            id: "no_action_hallucination_without_execution",
            reasonCode: "no_fake_action_confirmation",
            when: {
              all: [{ path: "signals.toolExecuted", op: "neq", value: true }],
            },
            triggerPatterns: { en: ["\\b(i (opened|deleted|moved|renamed)|done|completed)\\b"] },
            action: { type: "suppress_action_language" },
          },
        ],
      };
    });

    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Done. I opened the file. Next, choose the section.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
        signals: { toolExecuted: false },
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.enforcement.repairs).toContain("UI_ACTION_LANGUAGE_SUPPRESSED");
    expect(out.content.toLowerCase()).not.toContain("i opened");
    expect(out.enforcement.uiContracts?.appliedRuleIds).toContain(
      "no_action_hallucination_without_execution",
    );
  });

  test("hard blocks when multiple ui contract violations are configured as terminal", async () => {
    mockGetBank.mockImplementation((bankId: string) => {
      if (bankId !== "ui_contracts") return bankById(bankId);
      return {
        ...bankById("ui_contracts"),
        config: {
          ...(bankById("ui_contracts") as any).config,
          actionsContract: {
            combination: { multipleMatches: "apply_most_restrictive" },
            conflictResolution: { ifMultipleViolations: "hard_block" },
          },
        },
        rules: [
          {
            id: "R1",
            when: { all: [{ path: "answerMode", op: "eq", value: "general_answer" }] },
            triggerPatterns: { en: [".+"] },
            action: { type: "enforce_ui_contract", contract: "nav_pills" },
          },
          {
            id: "R2",
            when: { all: [{ path: "answerMode", op: "eq", value: "general_answer" }] },
            triggerPatterns: { en: [".+"] },
            action: { type: "suppress_action_language" },
          },
        ],
      };
    });

    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();
    const out = enforcer.enforce(
      {
        content: "Done. I opened the file.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("ui_contract_multiple_violations");
  });

  test("enforces ui_receipt_shapes when hard enforcement signal is enabled", async () => {
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId !== "ui_receipt_shapes") return bankById(bankId);
      return {
        _meta: { id: "ui_receipt_shapes", version: "1.0.0" },
        config: { enabled: true },
        mappings: [
          {
            id: "RS_OPEN_NAV",
            operator: "open",
            intent: "file_actions",
            mode: "navigation",
            contract: { requiredEnvelopeFields: ["receipts", "renderPlan"] },
          },
        ],
      };
    });
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Open this file.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [{ id: "doc-1", label: "A.pdf" }],
          } as any,
        ],
      },
      {
        answerMode: "nav_pills",
        language: "en",
        operator: "open",
        intentFamily: "file_actions",
        signals: { enforceReceiptContracts: true },
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("ui_receipt_contract_missing_fields");
    expect(out.enforcement.warnings.some((value) =>
      value.includes("UI_RECEIPT_MISSING_FIELDS"),
    )).toBe(true);
    expect(out.enforcement.uiReceiptContracts?.mappingId).toBe("RS_OPEN_NAV");
  });

  test("enforces extended ui_receipt required fields from contract", async () => {
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId !== "ui_receipt_shapes") return bankById(bankId);
      return {
        _meta: { id: "ui_receipt_shapes", version: "1.0.0" },
        config: { enabled: true },
        mappings: [
          {
            id: "RS_APPLY_EDITOR",
            operator: "apply",
            intent: "file_actions",
            mode: "analysis",
            contract: {
              requiredEnvelopeFields: [
                "receipts",
                "renderPlan",
                "editPlan",
                "undoToken",
              ],
            },
          },
        ],
      };
    });
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Applying the change.",
        attachments: [],
        receipts: [{ id: "r1" }] as any[],
        renderPlan: { mode: "editor" },
      },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        operator: "apply",
        intentFamily: "file_actions",
        signals: { enforceReceiptContracts: true },
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("ui_receipt_contract_missing_fields");
    expect(out.enforcement.warnings.some((value) =>
      value.includes("editplan") && value.includes("undotoken"),
    )).toBe(true);
  });

  test("filters disallowed action attachments from ui contract policy", async () => {
    mockGetBank.mockImplementation((bankId: string) => {
      if (bankId !== "ui_contracts") return bankById(bankId);
      return {
        ...bankById("ui_contracts"),
        rules: [
          {
            id: "nav_pills_terminal_contract",
            when: {
              all: [{ path: "answerMode", op: "eq", value: "nav_pills" }],
            },
            triggerPatterns: { en: [".+"] },
            action: {
              type: "enforce_ui_contract",
              contract: "nav_pills",
              suppressActions: true,
            },
          },
        ],
      };
    });
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Open the file.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [{ id: "doc-1", label: "A.pdf" }],
          } as any,
          {
            type: "actions",
            actions: [{ id: "apply", label: "Apply" }],
          } as any,
        ],
      },
      {
        answerMode: "nav_pills",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.enforcement.repairs).toContain("UI_CONTRACT_ATTACHMENTS_FILTERED");
    expect(out.attachments.some((entry) => (entry as any).type === "actions")).toBe(
      false,
    );
  });

  test("enforces quote output shape from operator contracts in non-nav mode", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "The contract states that payment is due in 15 days.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
        operator: "quote",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content.startsWith("> ")).toBe(true);
    expect(out.enforcement.repairs).toContain("QUOTE_SHAPE_ENFORCED");
  });

  test("enforces button_only shape from operator mapping in non-nav mode", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "Sources: A.pdf\n- A.pdf\nOpen A.pdf and then show all matching files in a list.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
        operator: "open",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content.length).toBeLessThanOrEqual(110);
    expect(out.enforcement.repairs).toContain(
      "BUTTON_ONLY_STRIPPED_INLINE_FILE_LIST",
    );
    expect(out.enforcement.warnings).toContain("ANSWER_MODE_CONTRACT_DRIFT");
  });

  test("enforces analytical template when queryProfile=analytical", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
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

    expect(out.enforcement.blocked).toBe(false);
    expect(out.enforcement.repairs).toContain("ANALYTICAL_STRUCTURE_ENFORCED");
    expect(out.content).toContain("Direct answer:");
    expect(out.content).toContain("Key evidence:");
    expect(out.content).toContain("Sources used:");
    expect(out.content).toContain("Page 14");
    expect(out.content).toContain("In summary,");
    expect(out.content).toContain("If you'd like,");
  });

  test("enforces analytical template when enforceStructuredAnswer=true", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Operating revenue increased.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
        signals: { enforceStructuredAnswer: true },
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.enforcement.repairs).toContain("ANALYTICAL_STRUCTURE_ENFORCED");
    expect(out.content).toContain("Direct answer:");
    expect(out.content).toContain("Sources used:");
    expect(out.content).toContain("In summary,");
    expect(out.content).toContain("If you'd like,");
  });

  test("applies banned phrase stripping from patterns schema", async () => {
    mockGetBank.mockImplementation((bankId: string) => {
      const base = bankById(bankId) as any;
      if (bankId !== "banned_phrases") return base;
      return {
        ...base,
        patterns: [
          {
            id: "BAN_FILLER",
            category: "filler_phrases",
            regex: "(?i)\\bplease note that\\b",
            action: "strip",
            languages: ["en"],
          },
        ],
      };
    });
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Please note that revenue grew 12%.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content.toLowerCase()).toBe("revenue grew 12%.");
    expect(out.enforcement.repairs).toContain("BANNED_PHRASES_APPLIED");
  });

  test("normalizes bullet markers and trims overflow bullets", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "* One.\n+ Two.\n- Three.\n- Four.\n- Five.\n- Six.\n- Seven.\n- Eight.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content).not.toContain("* ");
    expect(out.content).not.toContain("+ ");
    expect(out.enforcement.repairs).toContain("BULLET_MARKER_NORMALIZED");
    expect(out.enforcement.repairs).toContain("BULLET_COUNT_TRIMMED");
  });

  test("truncates table rows to hard max and appends tail note", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n| 7 | 8 |",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.enforcement.repairs).toContain("TABLE_ROWS_TRUNCATED");
    expect(out.content).toContain("more rows");
  });

  test("enforces answer style mode overrides for scoped_not_found", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "- First scope.\n- Second scope.\n| A | B |\n| --- | --- |\n| 1 | 2 |\nShould I keep asking?",
        attachments: [],
      },
      {
        answerMode: "scoped_not_found",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content).not.toContain("- ");
    expect(out.content).not.toContain("|");
    expect(out.content).not.toContain("?");
    expect(out.enforcement.repairs).toContain("STYLE_BULLETS_DISABLED_FOR_MODE");
    expect(out.enforcement.repairs).toContain("MAX_QUESTIONS_ENFORCED");
  });

  test("suppresses bolding for conversation operator family", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "**Thanks** for your message.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
        signals: { operatorFamily: "conversation" },
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content).toBe("Thanks for your message.");
    expect(out.enforcement.repairs).toContain("BOLDING_SUPPRESSED_FOR_MODE");
  });

  test("blocks missing provenance even when fail-open flag is enabled", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Grounded answer text.",
        attachments: [],
      },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        provenanceFailOpenWithEvidence: true,
        provenance: {
          mode: "hidden_map",
          required: true,
          validated: false,
          failureCode: "missing_provenance",
          evidenceIdsUsed: [],
          sourceDocumentIds: ["doc-1"],
          snippetRefs: [],
          coverageScore: 0,
        } as any,
        evidenceMap: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "hash-1",
          },
        ],
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.provenance).toEqual({
      action: "block",
      reasonCode: "missing_provenance",
      severity: "error",
    });
    expect(out.enforcement.warnings).not.toContain("PROVENANCE_FAILOPEN_WITH_EVIDENCE");
  });

  test("keeps strict block for missing provenance when fail-open is disabled", async () => {
    const { ResponseContractEnforcerService } =
      await import("./responseContractEnforcer.service");
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Grounded answer text.",
        attachments: [],
      },
      {
        answerMode: "doc_grounded_single",
        language: "en",
        evidenceRequired: true,
        allowedDocumentIds: ["doc-1"],
        provenanceFailOpenWithEvidence: false,
        provenance: {
          mode: "hidden_map",
          required: true,
          validated: false,
          failureCode: "missing_provenance",
          evidenceIdsUsed: [],
          sourceDocumentIds: ["doc-1"],
          snippetRefs: [],
          coverageScore: 0,
        } as any,
        evidenceMap: [
          {
            evidenceId: "doc-1:loc-1",
            documentId: "doc-1",
            locationKey: "loc-1",
            snippetHash: "hash-1",
          },
        ],
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("missing_provenance");
    expect(out.enforcement.provenance).toEqual({
      action: "block",
      reasonCode: "missing_provenance",
      severity: "error",
    });
  });
});
