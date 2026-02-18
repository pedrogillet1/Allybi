import { EditReceiptService } from "./editReceipt.service";
import { getOptionalBank } from "../core/banks/bankLoader.service";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

describe("EditReceiptService microcopy", () => {
  beforeEach(() => {
    (getOptionalBank as jest.Mock).mockImplementation((key: string) => {
      if (key !== "editing_microcopy") return null;
      return {
        config: { fallbackLanguage: "en" },
        copy: {
          byOperator: {
            preview: {
              EDIT_DOCX_BUNDLE: {
                en: { body: "Docx bundle preview copy." },
              },
            },
            applied: {
              ADD_PARAGRAPH: {
                pt: { body: "Paragrafo inserido com sucesso." },
              },
            },
          },
          preview: { en: { body: "Generic preview copy." } },
          applied: { pt: { body: "Generic applied copy." } },
        },
      };
    });
  });

  const svc = new EditReceiptService();

  test("uses operator-specific preview copy when available", () => {
    const out = svc.build({
      stage: "preview",
      language: "en",
      documentId: "doc-1",
      operator: "EDIT_DOCX_BUNDLE",
    });
    expect(String(out.note || "").toLowerCase()).toContain("bundle");
  });

  test("uses operator-specific applied copy when available (pt)", () => {
    const out = svc.build({
      stage: "applied",
      language: "pt",
      documentId: "doc-1",
      operator: "ADD_PARAGRAPH",
    });
    expect(String(out.note || "").toLowerCase()).toContain("paragrafo");
  });
});
