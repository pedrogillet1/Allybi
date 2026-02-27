import path from "node:path";
import { beforeAll, describe, expect, test } from "@jest/globals";
import {
  resolveDocumentReference,
  type DocumentReferenceDoc,
} from "./documentReferenceResolver.service";
import { initializeBanks } from "../banks/bankLoader.service";

const DOCS: DocumentReferenceDoc[] = [
  { docId: "doc-notes", filename: "Anotações_Aula_2__1_.pdf" },
  { docId: "doc-scrum", filename: "Capítulo_8__Framework_Scrum_.pdf" },
  { docId: "doc-project", filename: "Trabalho_projeto_.pdf" },
  { docId: "doc-marketing", filename: "OBA_marketing_servicos__1_.pdf" },
  { docId: "doc-image", filename: "TRABALHO_FINAL__1_.PNG" },
  { docId: "doc-deck", filename: "guarda_bens_self_storage.pptx" },
];

describe("DocumentReferenceResolver", () => {
  beforeAll(async () => {
    await initializeBanks({
      env: "dev",
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      enableHotReload: false,
      allowEmptyChecksumsInNonProd: true,
    });
  });

  test("resolves natural single-doc reference in Portuguese", () => {
    const result = resolveDocumentReference(
      "Beleza, vamos por etapas. Começa pelo capítulo de scrum.",
      DOCS,
    );
    expect(result.explicitDocRef).toBe(true);
    expect(result.resolvedDocId).toBe("doc-scrum");
    expect(result.matchedDocIds[0]).toBe("doc-scrum");
  });

  test("resolves notes reference without full filename", () => {
    const result = resolveDocumentReference(
      "Ótimo, agora conecta isso com as anotações da aula.",
      DOCS,
    );
    expect(result.explicitDocRef).toBe(true);
    expect(result.resolvedDocId).toBe("doc-notes");
  });

  test("returns multi-doc matches for compare style prompts", () => {
    const result = resolveDocumentReference(
      "Agora compara esse trabalho com o capítulo de scrum.",
      DOCS,
    );
    expect(result.explicitDocRef).toBe(true);
    expect(result.matchedDocIds).toContain("doc-project");
    expect(result.matchedDocIds).toContain("doc-scrum");
    expect(result.matchedDocIds.length).toBeGreaterThanOrEqual(2);
  });

  test("does not force document when query has no document hint", () => {
    const result = resolveDocumentReference(
      "Agora separa por tipo de conteúdo: acadêmico, comercial e apresentação.",
      DOCS,
    );
    expect(result.explicitDocRef).toBe(false);
    expect(result.resolvedDocId).toBeNull();
    expect(result.matchedDocIds).toEqual([]);
  });
});
