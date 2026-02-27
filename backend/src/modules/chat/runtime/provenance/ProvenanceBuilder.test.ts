import { buildChatProvenance } from "./ProvenanceBuilder";

describe("buildChatProvenance fallback refs", () => {
  const retrievalPack = {
    evidence: [
      {
        docId: "doc-1",
        locationKey: "p1#c1",
        snippet: "Definition of Done means all acceptance criteria are met.",
      },
      {
        docId: "doc-1",
        locationKey: "p2#c3",
        snippet: "Sprint Backlog is owned by the developers.",
      },
    ],
  } as any;

  test("seeds provenance refs when required and lexical overlap is too weak", () => {
    const provenance = buildChatProvenance({
      answerText: "Tabela comparativa consolidada por prioridade.",
      answerMode: "doc_grounded_table" as any,
      answerClass: "DOCUMENT" as any,
      retrievalPack,
    });

    expect(provenance.required).toBe(true);
    expect(provenance.snippetRefs.length).toBeGreaterThan(0);
    expect(provenance.sourceDocumentIds).toContain("doc-1");
  });

  test("keeps non-required provenance empty when answer is general", () => {
    const provenance = buildChatProvenance({
      answerText: "Resposta geral sem grounding em documento.",
      answerMode: "general_answer" as any,
      answerClass: "GENERAL" as any,
      retrievalPack,
    });

    expect(provenance.required).toBe(false);
    expect(provenance.snippetRefs).toHaveLength(0);
  });
});
