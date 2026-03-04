# Document Understanding v1

This module implements production-facing contracts and scoring for:

- Document type detection
- Section mapping
- Table type detection

## Location

- Contract schema: `src/document_understanding/document_understanding.schema.json`
- Ontology v1: `src/document_understanding/ontology/v1/`
- Runtime modules: `src/document_understanding/`
- Evaluation CLI: `scripts/eval/document_understanding_eval.ts`

## Output Contract

`DocumentUnderstandingOutput` requires:

- `schema_version`
- `document_id`
- `doc_type` with `label`, `confidence`, `evidence[]`
- `sections[]` with span/page range + hierarchy (`parent_id`)
- `tables[]` with `bbox`, page, confidence, evidence
- `meta` with language/OCR/runtime metadata

All labels are normalized to canonical ontology IDs and confidence is clamped to `[0, 1]`.
Low-confidence predictions can be routed to `unknown` via abstention threshold.

## Evaluation

Run:

```bash
npm run eval:document-understanding -- \
  --gold src/document_understanding/eval/fixtures/gold.jsonl \
  --pred src/document_understanding/eval/fixtures/predicted.jsonl
```

Strict gate mode:

```bash
npm run eval:document-understanding:strict -- \
  --gold src/document_understanding/eval/fixtures/gold.jsonl \
  --pred src/document_understanding/eval/fixtures/predicted.jsonl
```

Supported flags:

- `--threshold-profile default|strict|relaxed`
- `--table-iou <number>` (default `0.5`)
- `--calibration-bins <number>` (default `10`)
- `--output <path>` (write JSON report)
- `--strict` (non-zero exit on gate failure)

## Metrics + Gates

Default gates:

- doc type macro-F1 >= 0.92
- doc type per-major F1 >= 0.85
- section span-F1 >= 0.88
- section IoU >= 0.75
- table type accuracy >= 0.90
- table recall >= 0.93
- abstention precision >= 0.90
- robustness track ratio >= 0.90 vs overall
