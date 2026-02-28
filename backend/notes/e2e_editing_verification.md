# E2E Editing Verification Harness

## What "PASS" Guarantees

When all tests in the e2e editing harness pass, the following properties are proven:

### DOCX (`docx-structural.e2e.test.ts`)

| Property | Guarantee |
|----------|-----------|
| **Fixture validity** | The test fixture is a structurally valid DOCX with known paragraphs, headings, and mixed formatting. |
| **Paragraph anchoring** | `DocxAnchorsService.extractParagraphNodes()` extracts stable, unique IDs for every paragraph. IDs survive editing. |
| **Text edit correctness** | `DocxEditorService.applyParagraphEdit()` modifies only the targeted paragraph. All other paragraphs retain their text, styles, and structural position. |
| **Run-style formatting** | `DocxEditorService.applyRunStyle()` sets w:rPr properties (bold, italic, color, fontFamily) without altering text content. |
| **Structural deletion** | `DocxEditorService.deleteParagraph()` removes exactly one paragraph and preserves the rest of the document. |
| **Numbering/lists** | Paragraph-to-list conversion applies w:numPr or bullet glyphs correctly. |
| **Chained operations** | Sequencing text edit → format produces a valid DOCX where both mutations are present. |
| **Bitwise proof** | SHA-256 hash of the output buffer differs from the input for every mutation, proving bytes actually changed. |
| **UI highlight targets** | Paragraph IDs remain extractable after any edit operation, enabling the frontend to highlight changed paragraphs. |

### XLSX (`xlsx-format-and-value.e2e.test.ts`)

| Property | Guarantee |
|----------|-----------|
| **Fixture validity** | The test fixture is a valid `SpreadsheetModel` with headers, numeric data, and formulas. |
| **Value mutation** | `SET_VALUE` patches change exactly the targeted cells. Unchanged cells are preserved. |
| **Formula mutation** | `SET_FORMULA` patches replace formulas without touching other cells. |
| **Number format** | `SET_NUMBER_FORMAT` applies format codes (e.g., `$#,##0.00`) to cell ranges. Values are preserved. |
| **Style application** | `SET_STYLE` registers styles and links cells to style refs. Cell values and formulas are preserved. |
| **Structural row ops** | `INSERT_ROWS` and `DELETE_ROWS` shift cell data correctly and update grid bounds. |
| **Sorting** | `SORT_RANGE` reorders data rows by column, respects header exclusion, and preserves all cell values. |
| **Sheet management** | `ADD_SHEET`, `RENAME_SHEET`, `DELETE_SHEET` correctly mutate the sheet list. |
| **Chained ops** | Multiple patch ops in a single apply all take effect. The diff counts accumulate correctly. |
| **Diff accuracy** | `diffSpreadsheetModels()` reports `changedCellsCount`, `changedStructuresCount`, `affectedRanges`, and `changedSamples` accurately. |
| **UI highlight targets** | `touchedRanges` and `diff.locateRange` provide A1-notation ranges for the frontend to scroll to and highlight. |
| **Matrix write** | `SET_VALUE` with `mode: "matrix"` writes a 2D array of values into a contiguous range. |

## Architecture

```
backend/src/tests/e2e/editing/
├── docx-structural.e2e.test.ts   — DOCX plan→apply→verify (8 describe blocks)
└── xlsx-format-and-value.e2e.test.ts — XLSX plan→apply→verify (11 describe blocks)
```

### DOCX pipeline under test

```
buildMinimalDocx()            → in-memory DOCX fixture (AdmZip + OOXML)
DocxAnchorsService            → extract paragraph IDs + metadata
DocxEditorService             → applyParagraphEdit / applyRunStyle / deleteParagraph
Verification functions        → parse OOXML, extract texts, check run properties
Hash comparison               → SHA-256 before vs after
```

### XLSX pipeline under test

```
buildFixtureModel()                     → in-memory SpreadsheetModel
applyPatchOpsToSpreadsheetModel()       → apply PatchOp[] to model
diffSpreadsheetModels()                 → compute cell diff + affected ranges
Direct model inspection                 → verify cell values, formats, styles
```

## Design Decisions

1. **No stubs**: All tests use real services and real data structures. DOCX fixtures are built programmatically as valid OOXML archives. XLSX fixtures are native `SpreadsheetModel` objects.

2. **Deterministic fixtures**: Fixture content is hardcoded (no random data). This makes tests fully reproducible.

3. **Sub-second execution**: No I/O beyond in-memory buffer manipulation. The entire suite runs in under 5 seconds.

4. **Independent of database/server**: Tests import service classes directly. No HTTP calls, no Prisma, no BullMQ.

5. **Verification at the OOXML level**: DOCX tests parse the output ZIP and inspect XML elements (w:t, w:b, w:rPr, w:pStyle) directly. This proves changes are in the file, not just in memory.

6. **Diff-based verification for XLSX**: Uses the production `diffSpreadsheetModels()` function to validate mutations, ensuring the same diff logic used by the UI gets tested.

## Running

```bash
cd backend
node_modules/.bin/jest --testPathPattern="tests/e2e/editing" --no-coverage
```
