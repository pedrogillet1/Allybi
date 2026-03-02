import { z } from "zod";

const MAX_QUERY_VARIANTS = 6;
const MAX_REQUIRED_TERMS = 10;
const MAX_EXCLUDED_TERMS = 10;
const MAX_ENTITIES = 8;
const MAX_METRICS = 8;
const MAX_TIME_HINTS = 3;
const MAX_DOC_TYPE_PREFERENCES = 4;
const MAX_LOCATION_TARGETS = 8;
const MAX_CONFIDENCE_NOTES = 4;

const LOCATION_TARGET_TYPES = [
  "page",
  "section",
  "sheet",
  "cell",
  "range",
  "slide",
  "table",
  "other",
] as const;

type LocationTargetType = (typeof LOCATION_TARGET_TYPES)[number];

const locationTargetSchema = z
  .object({
    type: z.enum(LOCATION_TARGET_TYPES),
    value: z.string().trim().min(1).max(120),
  })
  .strict();

const locationTargetInputSchema = z.union([
  locationTargetSchema,
  z.string().trim().min(3).max(160),
]);

const retrievalPlanInputSchema = z
  .object({
    schemaVersion: z.literal("koda_retrieval_plan_v1"),
    queryVariants: z.array(z.string()).max(MAX_QUERY_VARIANTS).default([]),
    requiredTerms: z.array(z.string()).max(MAX_REQUIRED_TERMS).default([]),
    excludedTerms: z.array(z.string()).max(MAX_EXCLUDED_TERMS).default([]),
    entities: z.array(z.string()).max(MAX_ENTITIES).default([]),
    metrics: z.array(z.string()).max(MAX_METRICS).default([]),
    timeHints: z.array(z.string()).max(MAX_TIME_HINTS).default([]),
    docTypePreferences: z
      .array(z.string())
      .max(MAX_DOC_TYPE_PREFERENCES)
      .default([]),
    locationTargets: z
      .array(locationTargetInputSchema)
      .max(MAX_LOCATION_TARGETS)
      .default([]),
    confidenceNotes: z
      .array(z.string())
      .max(MAX_CONFIDENCE_NOTES)
      .default([]),
  })
  .strict();

export interface RetrievalPlan {
  schemaVersion: "koda_retrieval_plan_v1";
  queryVariants: string[];
  requiredTerms: string[];
  excludedTerms: string[];
  entities: string[];
  metrics: string[];
  timeHints: string[];
  docTypePreferences: string[];
  locationTargets: Array<{ type: LocationTargetType; value: string }>;
  confidenceNotes: string[];
}

function normalizeStringList(params: {
  values: string[];
  maxItems: number;
  maxChars: number;
  lowercase?: boolean;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of params.values) {
    const base = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!base) continue;
    const clipped = base.slice(0, params.maxChars);
    const normalized = params.lowercase ? clipped.toLowerCase() : clipped;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= params.maxItems) break;
  }

  return out;
}

function normalizeLocationTarget(
  input: z.infer<typeof locationTargetInputSchema>,
): { type: LocationTargetType; value: string } | null {
  if (typeof input === "string") {
    const sepIdx = input.indexOf("|");
    if (sepIdx <= 0) return null;
    const rawType = input.slice(0, sepIdx).trim().toLowerCase();
    const value = input.slice(sepIdx + 1).trim().slice(0, 120);
    if (!rawType || !value) return null;
    const type = LOCATION_TARGET_TYPES.includes(rawType as LocationTargetType)
      ? (rawType as LocationTargetType)
      : "other";
    return { type, value };
  }

  const rawType = String(input.type || "")
    .trim()
    .toLowerCase();
  const type = LOCATION_TARGET_TYPES.includes(rawType as LocationTargetType)
    ? (rawType as LocationTargetType)
    : "other";
  const value = String(input.value || "").trim().slice(0, 120);
  if (!value) return null;
  return { type, value };
}

function normalizeLocationTargets(
  values: Array<z.infer<typeof locationTargetInputSchema>>,
): Array<{ type: LocationTargetType; value: string }> {
  const out: Array<{ type: LocationTargetType; value: string }> = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeLocationTarget(value);
    if (!normalized) continue;
    const key = `${normalized.type}|${normalized.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= MAX_LOCATION_TARGETS) break;
  }

  return out;
}

function stripOuterCodeFence(input: string): string {
  const trimmed = String(input || "").trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutStart = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "");
  return withoutStart.replace(/\n?```$/, "").trim();
}

function parseStrictJsonObject(input: string): Record<string, unknown> {
  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("retrieval plan must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export class RetrievalPlanParserService {
  parse(raw: string): RetrievalPlan {
    const text = stripOuterCodeFence(raw);
    if (!text) throw new Error("retrieval plan is empty");

    const parsed = parseStrictJsonObject(text);
    const validated = retrievalPlanInputSchema.parse(parsed);

    return {
      schemaVersion: "koda_retrieval_plan_v1",
      queryVariants: normalizeStringList({
        values: validated.queryVariants,
        maxItems: MAX_QUERY_VARIANTS,
        maxChars: 180,
        lowercase: true,
      }),
      requiredTerms: normalizeStringList({
        values: validated.requiredTerms,
        maxItems: MAX_REQUIRED_TERMS,
        maxChars: 80,
        lowercase: true,
      }),
      excludedTerms: normalizeStringList({
        values: validated.excludedTerms,
        maxItems: MAX_EXCLUDED_TERMS,
        maxChars: 80,
        lowercase: true,
      }),
      entities: normalizeStringList({
        values: validated.entities,
        maxItems: MAX_ENTITIES,
        maxChars: 80,
      }),
      metrics: normalizeStringList({
        values: validated.metrics,
        maxItems: MAX_METRICS,
        maxChars: 80,
      }),
      timeHints: normalizeStringList({
        values: validated.timeHints,
        maxItems: MAX_TIME_HINTS,
        maxChars: 80,
      }),
      docTypePreferences: normalizeStringList({
        values: validated.docTypePreferences,
        maxItems: MAX_DOC_TYPE_PREFERENCES,
        maxChars: 60,
        lowercase: true,
      }),
      locationTargets: normalizeLocationTargets(validated.locationTargets),
      confidenceNotes: normalizeStringList({
        values: validated.confidenceNotes,
        maxItems: MAX_CONFIDENCE_NOTES,
        maxChars: 120,
      }),
    };
  }

  tryParse(raw: string): RetrievalPlan | null {
    try {
      return this.parse(raw);
    } catch {
      return null;
    }
  }
}

let singleton: RetrievalPlanParserService | null = null;

export function getRetrievalPlanParser(): RetrievalPlanParserService {
  if (!singleton) singleton = new RetrievalPlanParserService();
  return singleton;
}
