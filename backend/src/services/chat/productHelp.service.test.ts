import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ProductHelpService } from "./productHelp.service";
import { getOptionalBank } from "../core/banks/bankLoader.service";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("ProductHelpService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
    mockedGetOptionalBank.mockReturnValue(null);
  });

  test("resolves explicit topic from bank with localized snippet", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: { enabled: true, defaultLanguage: "en", maxSnippetChars: 220 },
      topics: [
        {
          id: "docx_editing",
          snippets: {
            en: "Edit by selecting the exact paragraph first.",
            pt: "Edite selecionando o paragrafo exato primeiro.",
          },
        },
      ],
    } as any);

    const service = new ProductHelpService();
    const result = service.resolve({
      queryText: "how do i edit this docx",
      language: "pt",
      explicitTopic: "docx_editing",
      answerMode: "help_steps",
    });

    expect(result).toEqual({
      topic: "docx_editing",
      snippet: "Edite selecionando o paragrafo exato primeiro.",
    });
  });

  test("falls back to built-in scope help when reason code is scoped empty", () => {
    const service = new ProductHelpService();
    const result = service.resolve({
      queryText: "where is my document",
      language: "en",
      answerMode: "general_answer",
      fallbackReasonCode: "scope_hard_constraints_empty",
      intentFamily: "documents",
    });

    expect(result?.topic).toBe("limitations_memory_scope");
    expect(result?.snippet).toContain("indexed documents");
  });

  test("returns null when no rule matches", () => {
    const service = new ProductHelpService();
    const result = service.resolve({
      queryText: "hello",
      language: "en",
      answerMode: "general_answer",
      fallbackReasonCode: "",
    });

    expect(result).toBeNull();
  });
});
