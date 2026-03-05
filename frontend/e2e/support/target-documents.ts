export interface TargetDocument {
  id: string;
  name: string;
  type: string;
}

export const TARGET_DOCUMENTS: TargetDocument[] = [
  {
    id: "7d55ead0-4840-4537-94ee-913e2feb5bce",
    name: "Anotações_Aula_2__1_.pdf",
    type: "application/pdf",
  },
  {
    id: "8938fa6a-730f-4d12-8d6a-4416ea9a6438",
    name: "Capítulo_8__Framework_Scrum_.pdf",
    type: "application/pdf",
  },
  {
    id: "ee91764d-304d-4162-8c0b-826662ee70a3",
    name: "Trabalho_projeto_.pdf",
    type: "application/pdf",
  },
  {
    id: "5471856b-b93f-4aae-b450-35b121cad140",
    name: "OBA_marketing_servicos__1_.pdf",
    type: "application/pdf",
  },
  {
    id: "5708e5f5-42d4-45e7-803b-ae490c45a766",
    name: "TRABALHO_FINAL__1_.PNG",
    type: "image/png",
  },
  {
    id: "ce276bc4-bed3-41c2-b965-05ceb9ea0913",
    name: "guarda_bens_self_storage.pptx",
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
];

export const TARGET_DOC_IDS = new Set(TARGET_DOCUMENTS.map((doc) => doc.id));
export const ALL_DOC_IDS = TARGET_DOCUMENTS.map((doc) => doc.id);

export const DOC_IDS = {
  notes: TARGET_DOCUMENTS[0].id,
  scrum: TARGET_DOCUMENTS[1].id,
  project: TARGET_DOCUMENTS[2].id,
  marketing: TARGET_DOCUMENTS[3].id,
  image: TARGET_DOCUMENTS[4].id,
  deck: TARGET_DOCUMENTS[5].id,
} as const;

export const QUERY_SCOPE_RULES: Array<{ start: number; end: number; docIds: string[] }> = [
  { start: 1, end: 9, docIds: ALL_DOC_IDS },
  { start: 10, end: 24, docIds: [DOC_IDS.scrum] },
  { start: 25, end: 34, docIds: [DOC_IDS.notes] },
  { start: 35, end: 46, docIds: [DOC_IDS.project] },
  { start: 47, end: 48, docIds: [DOC_IDS.project, DOC_IDS.scrum] },
  { start: 49, end: 58, docIds: [DOC_IDS.marketing] },
  { start: 59, end: 66, docIds: [DOC_IDS.image] },
  { start: 67, end: 68, docIds: [DOC_IDS.image, DOC_IDS.project] },
  { start: 69, end: 80, docIds: [DOC_IDS.deck] },
  { start: 81, end: 100, docIds: ALL_DOC_IDS },
];

function dedupeDocsById(docs: TargetDocument[]): TargetDocument[] {
  const byId = new Map<string, TargetDocument>();
  for (const doc of docs) {
    const id = String(doc?.id || "").trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, doc);
  }
  return Array.from(byId.values());
}

export function resolveScopedDocsForQueryIndex(queryIndex: number): TargetDocument[] {
  const idx = Number.isFinite(queryIndex) ? Math.trunc(queryIndex) : 0;
  const rule = QUERY_SCOPE_RULES.find((entry) => idx >= entry.start && idx <= entry.end);
  const docIds =
    Array.isArray(rule?.docIds) && rule.docIds.length > 0 ? rule.docIds : ALL_DOC_IDS;
  return dedupeDocsById(
    TARGET_DOCUMENTS.filter((doc) => docIds.includes(String(doc.id))),
  );
}
