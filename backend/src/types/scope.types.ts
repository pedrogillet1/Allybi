// src/types/scope.types.ts
/**
 * SCOPE TYPES
 *
 * Scope is the guardrail layer that prevents wrong-doc answers.
 * It carries:
 * - Explicit doc refs (filename/docId) from user text
 * - Active doc locking (soft/hard)
 * - Hard/soft allowlists + denylists
 * - Candidate filtering output + reasons
 */

import type { DocType, DocumentRef } from "./rag.types";

// ----------------------------------------------------------------------------
// Primitive IDs
// ----------------------------------------------------------------------------

export type DocId = string; // e.g. "doc:abc123"
export type LockType = "none" | "soft" | "hard";

// Explicit reference the user gave (filename/docId)
export interface ExplicitDocRef {
  present: boolean;
  kind?: "docId" | "filename";
  value?: string; // docId or filename
  normalizedValue?: string; // normalized filename
  confidence?: number; // 0..1
}

// ----------------------------------------------------------------------------
// Scope resolution inputs/outputs
// ----------------------------------------------------------------------------

export interface ScopeHard {
  docIdAllowlist?: DocId[]; // keep only these docs
  filenameMustContain?: string[]; // filename tokens must match (fallback when docId not resolved)
  docTypeAllowlist?: DocType[]; // keep only these types
  docIdDenylist?: DocId[]; // remove these docs
}

export interface ScopeSoft {
  docIdAllowlist?: DocId[]; // preferred doc(s) (tag for ranking)
  docTypePreference?: DocType[]; // preferred types
  timeHint?: string; // FY2025 / Q1 etc.
  metricHint?: string; // revenue / NOI etc.
  entityHint?: string; // property / borrower / client name
}

export interface ScopeContext {
  explicitDocRef?: ExplicitDocRef;

  hard: ScopeHard;
  soft?: ScopeSoft;

  // active doc state injected from conversation state
  activeDocRef?: ActiveDocRef;

  // computed flags for downstream logic
  flags?: {
    hasHardConstraints: boolean;
    hasSoftPreferences: boolean;
    hasExplicitDocRef: boolean;
    hardLockedToSingleDoc: boolean;
  };
}

// ----------------------------------------------------------------------------
// Active doc state (conversation persistence)
// ----------------------------------------------------------------------------

export interface ActiveDocRef {
  present: boolean;
  docId?: DocId;
  fileName?: string;
  lockType: LockType; // none/soft/hard
  setBy?: "user" | "system";
  setAt?: string; // ISO
}

// ----------------------------------------------------------------------------
// Candidate docs passed between scope → retrieval
// ----------------------------------------------------------------------------

export interface CandidateDoc {
  docId: DocId;
  fileName: string;
  docTitle?: string;
  docType: DocType;

  uploadedAt?: string; // ISO
  folderPath?: string;

  // tags used for ranking/boosts
  tags?: string[];

  // reasons / traceability
  reasons?: string[];
}

// ----------------------------------------------------------------------------
// Candidate filter output contract
// ----------------------------------------------------------------------------

export interface CandidateFilterOutput {
  candidates: CandidateDoc[];

  filterNotes: string[];

  hardConstraintApplied: boolean;
  hardConstraintEmpty: boolean;
  hardConstraintReason?:
    | "empty_due_to_hard_constraints"
    | "scope_hard_constraints_empty";

  // Useful counts for routing
  stats?: {
    inputCandidates: number;
    keptAfterHard: number;
    keptAfterSoft: number;
    finalKept: number;
  };
}

// ----------------------------------------------------------------------------
// Helper: scope states used by fallbacks
// ----------------------------------------------------------------------------

export type ScopeFailureReason =
  | "no_docs_indexed"
  | "indexing_in_progress"
  | "extraction_failed"
  | "scope_hard_constraints_empty"
  | "no_relevant_chunks_in_scoped_docs"
  | "unknown";

export interface ScopeFailureContext {
  reason: ScopeFailureReason;
  explicitDocRef?: ExplicitDocRef;
  activeDocRef?: ActiveDocRef;

  // optional hint for UI messaging
  expectedDocTypes?: DocType[];
  uploadLimit?: string;
  reasonShort?: string;
}
