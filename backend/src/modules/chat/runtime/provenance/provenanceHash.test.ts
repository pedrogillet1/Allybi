import {
  hashSnippetForProvenance,
  normalizeSnippetForProvenanceHash,
} from "./provenanceHash";

describe("provenanceHash", () => {
  test("normalizes whitespace, accents, punctuation and thousand separators", () => {
    const input = "Receita Líquida: 1,234.00   BRL\n(ajustada)";
    const normalized = normalizeSnippetForProvenanceHash(input);
    expect(normalized).toBe("receita liquida 1234 00 brl ajustada");
  });

  test("produces stable hashes for semantically equivalent snippets", () => {
    const a = "EBITDA margin was 12.5% in 2024.";
    const b = "EBITDA   margin was 12,5% in 2024";
    expect(hashSnippetForProvenance(a)).toBe(hashSnippetForProvenance(b));
  });
});
