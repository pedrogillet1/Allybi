/**
 * QueryVariantBuilder — v2 extraction from RetrievalEngineService
 *
 * Standalone functions for building query variants from expansions,
 * rewrites, and planner hints, plus doc-type boost plan construction.
 */

import { logger } from "../../../../utils/logger";
import type {
  DocumentIntelligenceBanksService,
  DocumentIntelligenceDomain,
} from "../../banks/documentIntelligenceBanks.service";
import type {
  MatchedBoostRule,
  QueryVariant,
} from "../../../retrieval/document_intelligence/ruleInterpreter";
import type {
  RetrievalQueryVariant,
  DocTypeBoostPlan,
} from "../retrieval.types";
import { safeNumber } from "../retrievalEngine.utils";
import { RETRIEVAL_CONFIG } from "./retrieval.config";
import { normalizeDocType } from "./DocumentClassification.service";

// ── Minimal banks interface ─────────────────────────────────────────

type DocumentIntelligenceBanksSubset = Pick<
  DocumentIntelligenceBanksService,
  "getDocTypeSections" | "getDocTypeTables"
>;

// ── Query Variant Construction ──────────────────────────────────────

/**
 * Build the final list of retrieval query variants by merging base query,
 * synonym expansions, rewrite-rule variants, and planner-provided variants.
 * Deduplicates by lowercased text and respects a runtime max cap.
 */
export function buildQueryVariants(opts: {
  baseQuery: string;
  expandedQueries: string[];
  rewriteVariants: QueryVariant[];
  plannerQueryVariants: string[];
  requiredTerms: string[];
  maxVariants: number;
}): RetrievalQueryVariant[] {
  const requestedMaxVariants = Math.max(
    1,
    Math.floor(Number(opts.maxVariants || 6)),
  );
  const runtimeMaxVariants = RETRIEVAL_CONFIG.maxQueryVariants;
  const maxVariants = Math.min(requestedMaxVariants, runtimeMaxVariants);
  const base: RetrievalQueryVariant = {
    text: opts.baseQuery,
    weight: 1,
    sourceRuleId: "base_query",
    reason: "normalized query",
  };

  const expansionVariants: RetrievalQueryVariant[] = opts.expandedQueries
    .map((query) =>
      String(query || "")
        .trim()
        .toLowerCase(),
    )
    .filter((query) => query && query !== opts.baseQuery)
    .map((query, index) => ({
      text: query,
      weight: 0.85,
      sourceRuleId: `synonym_expansion_${index + 1}`,
      reason: "synonym expansion",
    }));

  const rewriteVariants: RetrievalQueryVariant[] = (
    opts.rewriteVariants || []
  )
    .map((variant) => ({
      text: String(variant.text || "")
        .trim()
        .toLowerCase(),
      weight: Math.max(0.1, Math.min(safeNumber(variant.weight, 1), 3)),
      sourceRuleId: String(variant.sourceRuleId || "rewrite_rule"),
      reason: String(variant.reason || "rewrite rule"),
    }))
    .filter((variant) => variant.text && variant.text !== opts.baseQuery);

  const plannerVariants: RetrievalQueryVariant[] = (opts.plannerQueryVariants || [])
    .map((query, index) => ({
      text: String(query || "")
        .trim()
        .toLowerCase(),
      weight: 0.95,
      sourceRuleId: `planner_variant_${index + 1}`,
      reason: "retrieval planner variant",
    }))
    .filter((variant) => variant.text && variant.text !== opts.baseQuery);

  const requiredTermVariants: RetrievalQueryVariant[] = (
    opts.requiredTerms || []
  )
    .map((term, index) => ({
      text: String(term || "")
        .trim()
        .toLowerCase(),
      weight: 0.72,
      sourceRuleId: `planner_required_term_${index + 1}`,
      reason: "required term hint",
    }))
    .filter((variant) => variant.text && variant.text !== opts.baseQuery);

  const extras = [
    ...plannerVariants,
    ...rewriteVariants,
    ...requiredTermVariants,
    ...expansionVariants,
  ];
  extras.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.sourceRuleId !== b.sourceRuleId)
      return a.sourceRuleId.localeCompare(b.sourceRuleId);
    return a.text.localeCompare(b.text);
  });

  const out: RetrievalQueryVariant[] = [base];
  const seen = new Set<string>([opts.baseQuery.toLowerCase()]);
  for (const variant of extras) {
    const key = variant.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(variant);
    if (out.length >= maxVariants) break;
  }

  return out;
}

// ── Doc-Type Boost Plan ─────────────────────────────────────────────

/**
 * Build a boost plan for a resolved doc type within a domain.
 * Extracts section anchors and table anchors from the document intelligence
 * banks to inform structural retrieval and boost scoring.
 */
export function buildDocTypeBoostPlan(
  domain: DocumentIntelligenceDomain,
  docTypeId: string,
  banks: Partial<DocumentIntelligenceBanksSubset>,
): DocTypeBoostPlan | null {
  const normalizedDocType = normalizeDocType(docTypeId);
  if (!normalizedDocType) return null;

  const provider = banks as Record<string, any>;
  const sectionsBank =
    typeof provider.getDocTypeSections === "function"
      ? provider.getDocTypeSections(domain, normalizedDocType)
      : null;
  const tablesBank =
    typeof provider.getDocTypeTables === "function"
      ? provider.getDocTypeTables(domain, normalizedDocType)
      : null;
  const sections = Array.isArray(sectionsBank?.sections)
    ? sectionsBank.sections
    : [];
  const tableMappings = Array.isArray(tablesBank?.tableHeaderMappings)
    ? tablesBank.tableHeaderMappings
    : [];
  const tables = Array.isArray(tablesBank?.tables) ? tablesBank.tables : [];

  const sectionAnchors: string[] = sections
    .map((section: unknown): { order: number; values: string[] } => {
      const sec = section as Record<string, any>;
      const order = safeNumber(sec?.order, 9999);
      const sectionId = String(sec?.id || "")
        .trim()
        .toLowerCase();
      const nameRecord = sec?.name as Record<string, any> | undefined;
      const en = String(nameRecord?.en || "")
        .trim()
        .toLowerCase();
      const pt = String(nameRecord?.pt || "")
        .trim()
        .toLowerCase();
      return {
        order,
        values: [sectionId, en, pt].filter(Boolean),
      };
    })
    .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
    .flatMap((entry: { values: string[] }) => entry.values);

  const tableAnchors: string[] = [
    ...tableMappings.flatMap((mapping: unknown) => {
      const m = mapping as Record<string, any>;
      return [
        String(m?.canonicalHeader || "")
          .trim()
          .toLowerCase(),
        ...(Array.isArray(m?.synonyms)
          ? (m.synonyms as unknown[]).map((value: unknown) =>
              String(value || "")
                .trim()
                .toLowerCase(),
            )
          : []),
      ];
    }),
    ...tables.flatMap((table: any) => [
      String(table?.id || "")
        .trim()
        .toLowerCase(),
      String(table?.name?.en || "")
        .trim()
        .toLowerCase(),
      String(table?.name?.pt || "")
        .trim()
        .toLowerCase(),
      ...(Array.isArray(table?.expectedColumns)
        ? table.expectedColumns.map((value: unknown) =>
            String(value || "")
              .trim()
              .toLowerCase(),
          )
        : []),
    ]),
  ].filter((value): value is string => Boolean(value));

  const normalizedSectionAnchors = Array.from(new Set(sectionAnchors)).slice(
    0,
    16,
  );
  const normalizedTableAnchors = Array.from(new Set(tableAnchors)).slice(
    0,
    16,
  );

  return {
    domain,
    docTypeId: normalizedDocType,
    sectionAnchors: normalizedSectionAnchors,
    tableAnchors: normalizedTableAnchors,
    reasons: [
      `doc_type_sections:${normalizedSectionAnchors.length}`,
      `doc_type_tables:${normalizedTableAnchors.length}`,
    ],
  };
}

/**
 * Synthesize a MatchedBoostRule from a DocTypeBoostPlan so that
 * document-intelligence boost scoring can weight sections by type.
 */
export function buildDocTypeMatchedRule(
  plan: DocTypeBoostPlan,
): MatchedBoostRule | null {
  const docType = normalizeDocType(plan.docTypeId);
  if (!docType) return null;
  const sectionWeights: Record<string, number> = {};
  for (let i = 0; i < plan.sectionAnchors.length; i += 1) {
    const section = normalizeDocType(plan.sectionAnchors[i]);
    if (!section) continue;
    sectionWeights[section] = Math.max(1, 3 - i * 0.08);
  }
  return {
    id: `doc_type_pack_${docType}`,
    priority: 999,
    weight: 1,
    docTypeWeights: {
      [docType]: 3,
    },
    sectionWeights,
  };
}
