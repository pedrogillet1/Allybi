# Koda Paragraph Editing Quality and Semantic Precision Report

## 1) Executive Summary

You can make Koda edit full paragraphs with high quality and high semantic precision if you treat editing as a **controlled transformation pipeline**, not a single LLM call.

The core model:

1. Resolve exactly **what** to edit (target locator confidence).
2. Constrain exactly **how** to edit (instruction + style lock + terminology lock).
3. Generate rewrite with the same quality profile used in normal answers.
4. Validate rewrite through deterministic and model-based quality gates.
5. Require user confirmation on low-confidence or high-impact edits.
6. Save as a new version and re-index.

This preserves text quality, semantic intent, and auditability.

---

## 2) What You Asked For

You asked:

- How Koda can edit entire paragraphs.
- How to keep writing quality equal to normal answer quality.
- How to preserve semantic understanding of **where** and **what** is being edited.

This report is a full implementation blueprint aligned with your current architecture:

- Databank-driven file actions (`backend/src/data_banks/operators/file_action_operators.any.json`)
- File action execution (`backend/src/services/core/execution/fileActionExecutor.service.ts`)
- Prompt quality controls (`backend/src/services/llm/prompts/composePrompt.builder.ts`)
- Existing extraction anchors (PDF page, DOCX headings, XLSX cells in `backend/src/types/extraction.types.ts`)

---

## 3) Current Baseline and Gaps

## 3.1 Existing strengths

1. Strong operator framework exists (`file_move`, `file_rename`, etc.) via databank + executor.
2. Existing extraction stack already produces structured anchors:
   - PDF per-page
   - DOCX heading-aware
   - XLSX cell-aware
3. Prompt composer already enforces high output quality policies.
4. Document pipeline already supports upload, process, and reprocess.

## 3.2 Gaps blocking paragraph editing quality

1. No `file_edit_paragraph` operator yet.
2. No target resolver service for paragraph-level localization.
3. No rewrite quality gate pipeline (existing quality gate runner is TODO).
4. No revision/version model for edit audit trail.
5. No confidence-based confirmation flow for ambiguous edits.

---

## 4) Quality Definition (Must-Haves)

Editing quality must be measured on 5 dimensions:

1. **Semantic fidelity**: rewritten paragraph preserves original meaning unless user asked to change meaning.
2. **Instruction compliance**: rewrite exactly follows user intent (tone, brevity, legal strictness, etc.).
3. **Style parity**: rewrite stays consistent with document voice/register.
4. **Localization precision**: right paragraph is edited (not adjacent/related paragraph).
5. **Document integrity**: structure and non-target content remain intact.

Acceptance thresholds (recommended):

1. Target locator confidence >= `0.90` for silent execute; else confirm.
2. Semantic similarity (embedding) >= `0.85` when instruction is style-only.
3. Contradiction score = `0` for safety/critical docs.
4. Length delta within configured budget (e.g. +/- 30%) unless user explicitly requests expansion/compression.

---

## 5) End-to-End Editing Architecture

```text
User request
  -> Intent/operator detect (file_edit_paragraph)
  -> Entity extraction (filename, locator, instruction)
  -> Target resolver (paragraph candidates + confidence)
  -> Context packer (neighbor paragraphs + heading path + doc style profile)
  -> Rewrite generator (writer model)
  -> Quality gates (deterministic + critic model)
  -> Confirmation if confidence/gates below threshold
  -> Save new revision + queue re-index
  -> Return receipt + diff preview
```

---

## 6) Semantic Understanding: “What and Where”

## 6.1 Locator contract

Support multiple locator types:

1. Explicit:
   - `paragraph 4 in section "Termination"`
   - `paragraph starting with "Payment terms are..."`
2. Implicit:
   - `the second paragraph under Risk Factors`
   - `the paragraph about cancellation penalties`

Resolve to canonical target:

```json
{
  "documentId": "...",
  "sectionPath": ["Termination"],
  "paragraphIndex": 3,
  "paragraphId": "docx:p:00123",
  "confidence": 0.93
}
```

## 6.2 Candidate ranking strategy

Score each paragraph candidate by weighted features:

1. Heading/path match (`sectionPath` exact > fuzzy).
2. Start-text overlap.
3. Keyword semantic similarity.
4. Positional cues (`first`, `second`, `last`).
5. Recent conversational focus signals.

If top2 margin is small (`< 0.12`), force disambiguation UI.

## 6.3 Grounding context window

For stable rewrites, always include:

1. Target paragraph.
2. Previous + next paragraph.
3. Heading breadcrumb.
4. Document metadata (doc type, domain, language).
5. Terminology glossary extracted from doc.

This avoids local coherence breaks.

---

## 7) Matching “Normal Answer” Quality

Use the **same style/quality contract** as normal answer generation:

1. Reuse current compose policy constraints from `composePrompt.builder.ts`.
2. Add edit-specific constraints:
   - do not invent new facts.
   - preserve named entities/numbers unless instructed.
   - preserve legal/financial terms exactly unless explicitly changed.
3. Add “style lock” fields derived from source paragraph:
   - reading level estimate
   - sentence length profile
   - formality register
   - punctuation/capitalization conventions

Writer prompt should contain:

1. Original paragraph
2. Edit instruction
3. Allowed change budget
4. Forbidden modifications
5. Required preserved tokens list

---

## 8) Quality Gate Pipeline (Hard Requirement)

Create a real gate runner (existing runner is placeholder):

- `backend/src/services/core/enforcement/qualityGateRunner.service.ts`

Gate order:

1. **Schema gate**: non-empty, valid utf-8, max length.
2. **Instruction gate**: check requested transformation achieved.
3. **Preservation gate**: required entities/tokens preserved.
4. **Semantic gate**: cosine similarity and contradiction check.
5. **Style gate**: register/readability drift within budget.
6. **Safety gate**: policy/compliance checks.

Decision:

1. All pass -> auto-ready.
2. Soft fail -> ask for user confirmation with diff.
3. Hard fail -> reject and ask clarification.

---

## 9) File-Type Strategy

## 9.1 DOCX (primary paragraph editing path)

Approach:

1. Parse OOXML paragraphs.
2. Map locator -> paragraph node.
3. Replace target paragraph text only.
4. Repack DOCX.
5. Save as new version.

This is best for paragraph-level edits.

## 9.2 XLSX

For spreadsheet editing, do not force paragraph semantics.
Use separate operators:

1. `file_edit_cell`
2. `file_edit_formula`
3. `file_edit_range`

Paragraph-like requests on XLSX should map to note/comment or cell text blocks only.

## 9.3 PDF

Do not promise true in-place paragraph editing in PDF.
Use one of:

1. Convert-to-docx -> edit -> export new PDF.
2. Annotation overlay (visual mark-up).

Return explicit UX message: “Created revised copy”.

---

## 10) Data Model and Versioning

Add revision support (recommended):

1. `DocumentRevision`
   - `id`
   - `documentId` (parent)
   - `revisionNumber`
   - `storageKey`
   - `changeType` (`paragraph_edit`, `cell_edit`, etc.)
   - `changeSummary`
   - `createdBy` (`user`, `assistant`)
   - `createdAt`
2. `EditOperationLog`
   - locator payload
   - instruction
   - confidence scores
   - gate outputs
   - diff snapshot hashes

Never overwrite original file bytes.

---

## 11) API and Operator Design

## 11.1 New operators (databank)

Add to `file_action_operators.any.json`:

1. `file_edit_paragraph`
2. `file_edit_cell`
3. `file_edit_formula`

For `file_edit_paragraph` entities:

1. `filename` (required)
2. `locator` (required)
3. `instruction` or `newText` (required)

## 11.2 Executor route

In `fileActionExecutor.service.ts`, add document methods:

1. `editParagraph`
2. `editCell`
3. `editFormula`

Use same response/confirmation patterns already implemented for destructive actions.

---

## 12) UX Patterns That Protect Quality

1. Always show target preview before commit:
   - section name
   - paragraph excerpt
2. Show inline diff (old vs new).
3. Show confidence label:
   - High confidence: auto-save
   - Medium/low: require click confirmation
4. Allow “tighten”, “more formal”, “shorter by 20%” iterative edits before save.

---

## 13) Testing and Evaluation Framework

Build an edit eval suite with gold targets:

1. Locator accuracy dataset (explicit + implicit references).
2. Rewrite quality dataset by domain (legal, finance, marketing).
3. Regression tests for protected entities/numbers.
4. Structure integrity tests (DOCX opens, no XML corruption).

Primary KPIs:

1. Paragraph target precision >= 98%.
2. User-confirmed acceptable rewrite >= 92%.
3. Hallucinated fact insertion <= 1%.
4. Failed edit commit rate < 0.5%.

---

## 14) Telemetry You Should Capture

Per edit request:

1. operator
2. locator confidence
3. gate scores
4. confirm required (yes/no)
5. user approved/rejected
6. rollback within 24h

Use these to tune thresholds and prompts continuously.

---

## 15) Security and Compliance Controls

1. Block edits on protected docs/folders by policy.
2. Add redaction/PII guard before sending text to rewrite model.
3. Keep immutable audit logs for enterprise/legal environments.
4. Support “no-AI rewrite” mode (deterministic template edits only) for regulated workloads.

---

## 16) Implementation Plan (Practical Order)

Phase 1 (fast, high value):

1. Add `file_edit_cell` for XLSX.
2. Add `file_edit_paragraph` for DOCX with explicit locator only.
3. Add save-as-new-version flow.

Phase 2:

1. Add implicit locator resolution.
2. Add quality gate runner implementation.
3. Add diff preview + confirmation.

Phase 3:

1. Add PDF derived editing path.
2. Add full telemetry dashboards.
3. Add offline eval harness and automated quality scoring.

---

## 17) Concrete File-Level Worklist

1. `backend/src/data_banks/operators/file_action_operators.any.json`
   - add new edit operators, patterns, entity extraction rules, microcopy.
2. `backend/src/services/core/execution/fileActionExecutor.service.ts`
   - implement `editParagraph`/`editCell` methods and response flow.
3. `backend/src/services/core/extraction/entityExtractor.service.ts`
   - add locator + instruction extraction helpers.
4. `backend/src/services/core/enforcement/qualityGateRunner.service.ts`
   - implement gate pipeline and scoring.
5. `backend/src/services/editing/docxEditor.service.ts` (new)
   - OOXML paragraph update engine.
6. `backend/src/services/editing/xlsxEditor.service.ts` (new)
   - cell/range/formula edit engine.
7. `backend/src/routes/document.routes.ts`
   - optional explicit edit endpoints if you want direct API besides chat operator path.
8. Prisma schema/migrations
   - revision + edit log tables.

---

## 18) Recommended Product Behavior for Your Example

User: “Edit X in file S. Change the cell number to Q.”

Routing:

1. If file is `.xlsx` -> `file_edit_cell`.
2. If file is `.docx` and user asks paragraph rewrite -> `file_edit_paragraph`.
3. If file is `.pdf` -> offer derived-copy flow.

Koda response pattern:

1. “I found `Sheet1!B12` in `S.xlsx`. I’ll change it from `X` to `Q`.”
2. Show preview diff.
3. Commit as `S (edited).xlsx`.
4. Confirm saved + indexed.

---

## 19) Final Recommendation

If your top goal is quality parity with normal answers, the non-negotiables are:

1. **Target resolution confidence + disambiguation**
2. **Rewrite constraints + style lock**
3. **Quality gates before commit**
4. **Versioned save with audit trail**

Without those four, paragraph editing will feel random and unsafe.

With them, Koda can deliver reliable, enterprise-grade editing behavior.
