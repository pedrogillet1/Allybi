import docTypes from "./ontology/v1/doc_types.json";
import sectionTypes from "./ontology/v1/section_types.json";
import tableTypes from "./ontology/v1/table_types.json";
import aliases from "./ontology/v1/aliases.json";
import type { AliasCatalog, CanonicalOntology, OntologyCatalog } from "./types";

function normalizeAlias(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, " ");
}

function addAlias(aliasMap: Map<string, string>, alias: string, canonical: string): void {
  const key = normalizeAlias(alias);
  if (!key) return;
  aliasMap.set(key, canonical);
}

function buildAliasMap(
  catalog: OntologyCatalog,
  explicitAliases: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const label of catalog.labels) {
    addAlias(map, label.id, label.id);
    addAlias(map, label.display_name, label.id);
    for (const alias of label.aliases || []) {
      addAlias(map, alias, label.id);
    }
  }

  for (const [alias, canonical] of Object.entries(explicitAliases || {})) {
    addAlias(map, alias, canonical);
  }

  return map;
}

function assertRequiredFallbacks(catalog: OntologyCatalog, catalogName: string): void {
  const ids = new Set(catalog.labels.map((label) => label.id));
  for (const required of ["other", "unknown"]) {
    if (!ids.has(required)) {
      throw new Error(`${catalogName} missing required fallback label "${required}"`);
    }
  }
}

function buildMajorLabels(catalog: OntologyCatalog): string[] {
  const major = catalog.labels
    .filter((label) => label.major)
    .map((label) => label.id)
    .filter((id) => id !== "unknown" && id !== "other");

  if (major.length > 0) return major;

  return catalog.labels
    .map((label) => label.id)
    .filter((id) => id !== "unknown" && id !== "other");
}

function asCatalog(raw: unknown, name: string): OntologyCatalog {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid ontology payload: ${name}`);
  }
  const catalog = raw as OntologyCatalog;
  if (!Array.isArray(catalog.labels)) {
    throw new Error(`Ontology ${name} missing labels array`);
  }
  assertRequiredFallbacks(catalog, name);
  return catalog;
}

function asAliasCatalog(raw: unknown): AliasCatalog {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid alias catalog payload");
  }
  const aliasCatalog = raw as AliasCatalog;
  if (!aliasCatalog.doc_type || !aliasCatalog.section_type || !aliasCatalog.table_type) {
    throw new Error("Alias catalog is missing one or more alias maps");
  }
  return aliasCatalog;
}

const docTypeCatalog = asCatalog(docTypes, "doc_types");
const sectionCatalog = asCatalog(sectionTypes, "section_types");
const tableCatalog = asCatalog(tableTypes, "table_types");
const aliasCatalog = asAliasCatalog(aliases);

export const DOCUMENT_UNDERSTANDING_ONTOLOGY: CanonicalOntology = {
  version: docTypeCatalog.version,
  docTypes: docTypeCatalog,
  sectionTypes: sectionCatalog,
  tableTypes: tableCatalog,
  aliases: aliasCatalog,
  docTypeAliasMap: buildAliasMap(docTypeCatalog, aliasCatalog.doc_type),
  sectionAliasMap: buildAliasMap(sectionCatalog, aliasCatalog.section_type),
  tableAliasMap: buildAliasMap(tableCatalog, aliasCatalog.table_type),
  majorDocTypeLabels: buildMajorLabels(docTypeCatalog),
};

export function normalizeAliasKey(value: string): string {
  return normalizeAlias(value);
}
