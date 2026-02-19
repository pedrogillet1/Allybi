/**
 * retrievalPrompt.builder.ts
 *
 * Deterministic retrieval prompt builder for Allybi’s RAG pipeline.
 *
 * Purpose:
 * - Build internal prompt blocks that instruct an LLM (Gemini fast worker / GPT finisher)
 *   how to plan retrieval and how to use evidence.
 * - Keep output deterministic (stable ordering, stable schema rendering)
 * - No user-facing microcopy (fallback copy stays in banks)
 *
 * Where this is used:
 * - Retrieval planning step (Gemini 3 Flash typically)
 * - Evidence refinement step (Gemini / GPT depending on trust gates)
 *
 * Non-responsibilities:
 * - Execute retrieval
 * - Decide safety/policy
 * - Render final UX copy
 */

import crypto from "crypto";

export type RetrievalStrategy = "semantic" | "lexical" | "hybrid";

export interface RetrievalPromptBuilderConfig {
  /**
   * Which model tier this prompt targets, to tune verbosity:
   * - 'flash': concise, fast planning instructions
   * - 'precision': more explicit, strict instructions (GPT finisher / validators)
   */
  tier: "flash" | "precision";

  /** Max number of documents to request (planning stage). */
  maxDocs: number;

  /** Max number of chunks per document to request. */
  maxChunksPerDoc: number;

  /** Whether to encourage iterative refinement when evidence is weak. */
  allowRefineLoop: boolean;

  /** If true, require strict doc-lock compliance language in the prompt. */
  enforceDocLock: boolean;

  /** Retrieval strategy guidance. */
  strategy: RetrievalStrategy;

  /** If true, include an output JSON schema the model must follow. */
  includePlanSchema: boolean;

  /** Hard cap on block size (chars). Truncates deterministically if exceeded. */
  maxChars: number;

  /** Hash salt for deterministic block ids. */
  salt?: string;
}

export interface RetrievalPlanningContext {
  /** The user’s question */
  query: string;

  /** Optional: known language */
  language?: string;

  /** Optional: active doc lock */
  docLock?: {
    enabled: boolean;
    docId?: string;
    filename?: string;
  };

  /** Optional: list of available docs metadata (titles only; no content) */
  availableDocs?: Array<{
    docId: string;
    filename: string;
    title?: string;
    mimeType?: string;
    updatedAtMs?: number;
  }>;

  /** Optional: prior attempt signals (from previous retrieval pass) */
  prior?: {
    hadEvidence?: boolean;
    evidenceStrength?: number; // 0..1
    retrievalStrategyUsed?: RetrievalStrategy;
    notes?: string;
  };
}

/**
 * Deterministic retrieval plan returned by the model (planning output).
 * This is an internal contract used by retrieval orchestrator.
 */
export interface RetrievalPlan {
  version: "v1";

  /** short name for the plan purpose */
  mode: "answer" | "compare" | "discover" | "locate" | "open" | "other";

  /** strategy recommendation */
  strategy: RetrievalStrategy;

  /**
   * Document selection:
   * - If docLock is enabled, the plan MUST keep candidates limited to the locked doc
   *   unless operator is discovery and your system allows discovery exception.
   */
  docCandidates: Array<{
    docId?: string;
    filename?: string;
    /** optional rationale for selection (internal only) */
    why?: string;
    /** optional priority ordering 1..N (1 = highest) */
    priority?: number;
  }>;

  /** Chunking parameters */
  retrieval: {
    maxDocs: number;
    maxChunksPerDoc: number;
    /**
     * Whether to diversify chunks across doc structure (headers/tables/sections)
     * This is a hint; executor decides.
     */
    diversifyByStructure?: boolean;
  };

  /** Query rewrite(s) / decomposition */
  queries: Array<{
    q: string;
    /** optional sub-intent: definition, comparison, lookup, etc. */
    intent?: string;
    /** optional: doc lock or filename constraint applied to this query */
    docConstraint?: { docId?: string; filename?: string };
  }>;

  /** If true, planner believes one refinement loop may be needed if evidence is weak */
  allowRefineLoop: boolean;

  /** Deterministic "ask one question" suggestion for low evidence situations (internal only) */
  clarify?: {
    needed: boolean;
    question?: string;
    reasonCode?:
      | "WEAK_EVIDENCE"
      | "AMBIGUOUS_DOC"
      | "AMBIGUOUS_ENTITY"
      | "MISSING_DETAIL"
      | "OTHER";
  };
}

export interface RetrievalPromptBlock {
  text: string;
  blockId: string;
}

/**
 * Build the retrieval planning prompt block.
 * This returns a single markdown string to insert into system/developer prompt.
 */
export function buildRetrievalPromptBlock(
  cfg: RetrievalPromptBuilderConfig,
  ctx: RetrievalPlanningContext,
): RetrievalPromptBlock {
  const lines: string[] = [];

  // Header
  lines.push("## Retrieval Planning (Internal)");
  lines.push(
    "You are planning document retrieval for a doc-grounded assistant.",
  );
  lines.push("Your output must be deterministic and evidence-driven.");
  lines.push("");

  // Core directives
  lines.push("### Objectives");
  lines.push(
    "- Select the minimal set of documents and chunks needed to answer.",
  );
  lines.push(
    "- Prefer precision over breadth unless discovery is explicitly required.",
  );
  lines.push(
    "- If evidence is likely weak, suggest one crisp clarification question.",
  );
  lines.push("");

  // Doc lock rules
  if (cfg.enforceDocLock) {
    lines.push("### Scope / Doc Lock Rules");
    if (ctx.docLock?.enabled) {
      const lockDesc = ctx.docLock.filename
        ? `filename="${ctx.docLock.filename}"`
        : ctx.docLock.docId
          ? `docId="${ctx.docLock.docId}"`
          : "enabled=true";
      lines.push(
        `- Doc lock is ACTIVE (${lockDesc}). Do not select other documents.`,
      );
      lines.push(
        "- Discovery is only permitted if the operator is discovery and the system explicitly allows it.",
      );
    } else {
      lines.push(
        "- Doc lock is NOT active. You may select across the available corpus.",
      );
    }
    lines.push("");
  }

  // Strategy guidance
  lines.push("### Retrieval Strategy Guidance");
  lines.push(`- Strategy: ${cfg.strategy}`);
  lines.push(`- Max docs: ${cfg.maxDocs}`);
  lines.push(`- Max chunks/doc: ${cfg.maxChunksPerDoc}`);
  lines.push(
    `- Refine loop allowed: ${cfg.allowRefineLoop ? "true" : "false"}`,
  );
  lines.push("");

  // Context snapshot (no content)
  lines.push("### Request Context");
  lines.push(`- Query: ${jsonInline(ctx.query)}`);
  if (ctx.language) lines.push(`- Language: ${jsonInline(ctx.language)}`);
  if (ctx.prior) {
    lines.push("- Prior attempt:");
    if (typeof ctx.prior.hadEvidence === "boolean")
      lines.push(`  - hadEvidence: ${ctx.prior.hadEvidence}`);
    if (typeof ctx.prior.evidenceStrength === "number")
      lines.push(
        `  - evidenceStrength: ${clamp01(ctx.prior.evidenceStrength).toFixed(2)}`,
      );
    if (ctx.prior.retrievalStrategyUsed)
      lines.push(`  - strategyUsed: ${ctx.prior.retrievalStrategyUsed}`);
    if (ctx.prior.notes)
      lines.push(`  - notes: ${jsonInline(ctx.prior.notes)}`);
  }
  lines.push("");

  // Available docs list (titles only; deterministic ordering)
  if (ctx.availableDocs?.length) {
    lines.push("### Available Documents (metadata only)");
    const docs = [...ctx.availableDocs].sort((a, b) => {
      // deterministic: by filename, then docId
      const f = a.filename.localeCompare(b.filename);
      if (f !== 0) return f;
      return a.docId.localeCompare(b.docId);
    });

    // Show only up to cfg.maxDocs * 5 metadata rows (planner doesn’t need full corpus dump)
    const cap = Math.max(cfg.maxDocs * 5, 20);
    for (const d of docs.slice(0, cap)) {
      const title = d.title ? `, title=${jsonInline(d.title)}` : "";
      const mt = d.mimeType ? `, mime=${jsonInline(d.mimeType)}` : "";
      lines.push(
        `- docId=${jsonInline(d.docId)}, file=${jsonInline(d.filename)}${title}${mt}`,
      );
    }
    if (docs.length > cap)
      lines.push(`- ... (${docs.length - cap} more not listed)`);
    lines.push("");
  }

  // Output contract
  lines.push("### Output Contract");
  lines.push("- Output MUST be valid JSON, matching the schema below.");
  lines.push("- Do not include markdown in the JSON output.");
  lines.push("- Do not include any user-facing explanations.");
  lines.push("");

  if (cfg.includePlanSchema) {
    lines.push("### Plan Schema (JSON)");
    lines.push("```json");
    lines.push(JSON.stringify(planSchema(cfg), null, 2));
    lines.push("```");
    lines.push("");
  }

  // Examples (tier-based)
  lines.push("### Guidance Notes");
  if (cfg.tier === "flash") {
    lines.push("- Keep the plan concise. Prefer 1–3 query rewrites.");
    lines.push(
      "- Prefer selecting <= maxDocs documents and <= maxChunksPerDoc chunks each.",
    );
  } else {
    lines.push(
      "- Be strict: justify docCandidates and query rewrites briefly in `why`.",
    );
    lines.push(
      "- If ambiguity exists, set clarify.needed=true and propose exactly one question.",
    );
    lines.push("- Ensure docCandidates respect doc lock if enabled.");
  }
  lines.push("");

  const rawText = lines.join("\n");
  const text = truncateDeterministically(rawText, cfg.maxChars);

  const blockId = sha256(
    (cfg.salt ?? "") +
      "|" +
      stableStringify({
        cfg: {
          tier: cfg.tier,
          maxDocs: cfg.maxDocs,
          maxChunksPerDoc: cfg.maxChunksPerDoc,
          allowRefineLoop: cfg.allowRefineLoop,
          enforceDocLock: cfg.enforceDocLock,
          strategy: cfg.strategy,
          includePlanSchema: cfg.includePlanSchema,
          maxChars: cfg.maxChars,
        },
        ctx: {
          queryLen: ctx.query.length,
          language: ctx.language ?? null,
          docLock: ctx.docLock?.enabled
            ? {
                docId: ctx.docLock.docId ?? null,
                filename: ctx.docLock.filename ?? null,
              }
            : { enabled: false },
          availableDocsCount: ctx.availableDocs?.length ?? 0,
          prior: ctx.prior ?? null,
        },
      }),
  ).slice(0, 24);

  return { text, blockId };
}

/* ------------------------- schema builder ------------------------- */

function planSchema(
  cfg: RetrievalPromptBuilderConfig,
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "version",
      "mode",
      "strategy",
      "docCandidates",
      "retrieval",
      "queries",
      "allowRefineLoop",
    ],
    properties: {
      version: { type: "string", enum: ["v1"] },
      mode: {
        type: "string",
        enum: ["answer", "compare", "discover", "locate", "open", "other"],
      },
      strategy: { type: "string", enum: ["semantic", "lexical", "hybrid"] },
      docCandidates: {
        type: "array",
        minItems: 0,
        maxItems: cfg.maxDocs,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            docId: { type: "string" },
            filename: { type: "string" },
            why: { type: "string" },
            priority: { type: "number" },
          },
        },
      },
      retrieval: {
        type: "object",
        additionalProperties: false,
        required: ["maxDocs", "maxChunksPerDoc"],
        properties: {
          maxDocs: { type: "number" },
          maxChunksPerDoc: { type: "number" },
          diversifyByStructure: { type: "boolean" },
        },
      },
      queries: {
        type: "array",
        minItems: 1,
        maxItems: Math.max(3, cfg.maxDocs * 2),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["q"],
          properties: {
            q: { type: "string" },
            intent: { type: "string" },
            docConstraint: {
              type: "object",
              additionalProperties: false,
              properties: {
                docId: { type: "string" },
                filename: { type: "string" },
              },
            },
          },
        },
      },
      allowRefineLoop: { type: "boolean" },
      clarify: {
        type: "object",
        additionalProperties: false,
        required: ["needed"],
        properties: {
          needed: { type: "boolean" },
          question: { type: "string" },
          reasonCode: {
            type: "string",
            enum: [
              "WEAK_EVIDENCE",
              "AMBIGUOUS_DOC",
              "AMBIGUOUS_ENTITY",
              "MISSING_DETAIL",
              "OTHER",
            ],
          },
        },
      },
    },
  };
}

/* ------------------------- deterministic utilities ------------------------- */

function truncateDeterministically(s: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (s.length <= maxChars) return s;
  // Do not append ellipses. LLMs tend to copy them into downstream artifacts
  // (e.g., slide copy), which then shows up as literal "…" in exported PPTX.
  // Deterministic hard-cut is preferable here.
  return s.slice(0, maxChars);
}

function jsonInline(s: string): string {
  // deterministic quoting for embedding in markdown
  return JSON.stringify(s);
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function stableStringify(input: unknown): string {
  return JSON.stringify(sortKeysDeep(normalizeJson(input)));
}

function normalizeJson(x: unknown): unknown {
  if (x === null) return null;

  const t = typeof x;
  if (t === "string" || t === "number" || t === "boolean") return x;
  if (t === "bigint") return x.toString();
  if (t === "undefined" || t === "function" || t === "symbol") return null;

  if (Array.isArray(x)) return x.map(normalizeJson);

  if (t === "object") {
    const obj = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "undefined") continue;
      out[k] = normalizeJson(v);
    }
    return out;
  }

  return null;
}

function sortKeysDeep(x: unknown): unknown {
  if (x === null) return null;
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  if (typeof x !== "object") return x;

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeysDeep(obj[k]);
  return out;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
