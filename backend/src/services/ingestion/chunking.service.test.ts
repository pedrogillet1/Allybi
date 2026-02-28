import { describe, expect, test } from "@jest/globals";

import {
  deduplicateChunkRecords,
  splitTextIntoChunks,
} from "./chunking.service";

describe("chunking.service", () => {
  test("splitTextIntoChunks is deterministic for the same input", () => {
    const text = [
      "Section A.",
      "This is a long paragraph with repeated structure to force chunk splitting.",
      "Section B.",
      "Another long paragraph for deterministic chunk boundaries.",
    ].join("\n\n");

    const opts = { targetChars: 80, overlapChars: 12 };
    const first = splitTextIntoChunks(text, opts);
    const second = splitTextIntoChunks(text, opts);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
  });

  test("splitTextIntoChunks avoids infinite loops with very high overlap", () => {
    const text = "x".repeat(300);
    const chunks = splitTextIntoChunks(text, {
      targetChars: 120,
      overlapChars: 119,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
  });

  test("splitTextIntoChunks respects multilingual sentence punctuation boundaries", () => {
    const text = [
      "Resumo financeiro: receita cresceu 18%; margem estável!",
      "Pergunta-chave? Onde reduzir churn sem comprometer NPS.",
      "Conclusão final: manter investimento em suporte.",
    ].join(" ");
    const chunks = splitTextIntoChunks(text, {
      targetChars: 70,
      overlapChars: 8,
      minBoundaryRatio: 0.4,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].includes(";") || chunks[0].includes("!")).toBe(true);
  });

  test("deduplicateChunkRecords removes near-duplicate content", () => {
    const rows = [
      { id: "a", content: "alpha beta gamma delta epsilon zeta eta theta" },
      { id: "b", content: "alpha beta gamma delta epsilon zeta eta theta" },
      { id: "c", content: "invoice amount due date vendor account status" },
    ];

    const deduped = deduplicateChunkRecords(rows, {
      dedupeSimilarityThreshold: 0.8,
      dedupeMinWordLength: 3,
    });

    expect(deduped.map((row) => row.id)).toEqual(["a", "c"]);
  });

  test("deduplicateChunkRecords keeps distinct chunks", () => {
    const rows = [
      { id: "a", content: "contract indemnity liability cap renewal clause" },
      { id: "b", content: "blood test leukocytes reference range platelet count" },
      { id: "c", content: "bank statement ending balance payment received fees" },
    ];

    const deduped = deduplicateChunkRecords(rows);
    expect(deduped.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  test("deduplicateChunkRecords normalizes accents and punctuation before similarity", () => {
    const rows = [
      { id: "a", content: "Fatura número 123: valor total R$ 1.250,00." },
      { id: "b", content: "FATURA numero 123 valor total R$ 1 250 00" },
      { id: "c", content: "Resultado hemograma leucócitos 7.200 /mm3." },
    ];

    const deduped = deduplicateChunkRecords(rows, {
      dedupeSimilarityThreshold: 0.75,
      dedupeMinWordLength: 3,
    });

    expect(deduped.map((row) => row.id)).toEqual(["a", "c"]);
  });
});
