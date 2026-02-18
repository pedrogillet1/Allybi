# Python Spreadsheet Engine: One Source of Truth

## Goal
All spreadsheet mutations and calculation-derived insights run through Python first, with a single canonical execution path.

## Added Components
- `python-services/spreadsheet_engine/app/main.py`
  - FastAPI endpoints:
    - `GET /health`
    - `POST /v1/spreadsheet/execute`
    - `POST /v1/spreadsheet/insight`
- `python-services/spreadsheet_engine/app/engine/executor.py`
  - Deterministic execution orchestration + proof block.
- `python-services/spreadsheet_engine/app/engine/providers/google_sheets_provider.py`
  - Structured ops executor for rows/cols, formulas, sort/filter, formatting, tables, charts.
  - Range summaries + chart metrics for answer context.
- `backend/src/services/spreadsheetEngine/spreadsheetEngine.types.ts`
- `backend/src/services/spreadsheetEngine/spreadsheetEngine.client.ts`
- `backend/src/services/spreadsheetEngine/spreadsheetEngine.service.ts`
- `backend/src/services/spreadsheetEngine/index.ts`
- `backend/src/services/editing/documentRevisionStore.service.ts`
  - Python-first routing in `applyXlsxEdit`.

## Activation
Set backend env vars:
- `SPREADSHEET_ENGINE_MODE=shadow` during migration.
- `SPREADSHEET_ENGINE_MODE=enforced` for strict one-source-of-truth.
- `SPREADSHEET_ENGINE_URL=http://127.0.0.1:8011`
- `SPREADSHEET_ENGINE_TIMEOUT_MS=12000` (optional)

Run Python engine (from repo root):
- `cd python-services/spreadsheet_engine`
- Install dependencies from `pyproject.toml`
- `uvicorn app.main:app --host 0.0.0.0 --port 8011`

## Execution Flow
1. Backend ensures spreadsheet bridge exists (`ensureSheetsSpreadsheetForDocument`).
2. Backend maps operator input to canonical compute ops.
3. Backend calls Python `/v1/spreadsheet/execute`.
4. Python applies ops in Google Sheets API, computes artifacts + answer context.
5. Backend stores artifacts in metadata (`__pythonSpreadsheetArtifacts`) and merges chart/table entries.
6. Backend exports updated workbook back to XLSX bytes.

## Mode Semantics
- `off`: legacy Node path only.
- `shadow`: Python-first, fallback to legacy only if Python fails before applying ops.
- `enforced`: Python is mandatory; failures are surfaced and legacy path is blocked.

## Source-of-Truth Controls
- Canonical op shape enforced at backend handoff to Python.
- Python response includes:
  - `applied_ops`
  - `artifacts` (`affectedRanges`, `chartEntries`, `tableEntries`)
  - `answer_context` (`rangeSummaries`, `chartMetrics`, `rangeValues`)
  - `proof` (`engine_version`, `provider`, `timings_ms`, `trace_id`)
- In `enforced` mode, errors stop execution to prevent divergent state.

## Migration Checklist
1. Deploy Python service.
2. Set backend to `SPREADSHEET_ENGINE_MODE=shadow`.
3. Validate editing ops + chart/table generation outputs.
4. Compare metadata artifacts and frontend rendering behavior.
5. Switch to `SPREADSHEET_ENGINE_MODE=enforced`.
6. Remove legacy execution branches only after successful burn-in.

## Optional Next Hardening
- Add contract tests from backend op payloads to Python endpoint.
- Add replay tests for historical compute prompts.
- Add SLO metrics on Python proof timings and failure codes.
