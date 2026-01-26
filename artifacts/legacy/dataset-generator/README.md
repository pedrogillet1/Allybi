# KODA Dataset Generator

Generate structured datasets (intent patterns, tests, fallbacks) using Claude API to improve KODA's intent classification without modifying runtime code.

## Quick Start

```bash
# Install dependencies
npm install

# Set your Claude API key
export CLAUDE_API_KEY="sk-ant-..."
# or
export ANTHROPIC_API_KEY="sk-ant-..."

# Generate patterns
npm run gen:patterns

# Validate generated data
npm run validate

# Ingest into application
npm run ingest
```

## Project Structure

```
dataset-generator/
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── schemas/            # TypeScript + JSON schemas
│   │   ├── patterns.schema.ts
│   │   ├── tests.schema.ts
│   │   └── fallbacks.schema.ts
│   ├── prompts/            # Claude prompt templates
│   │   ├── patterns.prompt.ts
│   │   ├── tests.prompt.ts
│   │   └── fallbacks.prompt.ts
│   ├── generator/          # Claude API client + generation logic
│   │   ├── claude-client.ts
│   │   └── generator.ts
│   ├── validator/          # Schema validation + quality checks
│   │   └── validator.ts
│   └── ingest/             # Merge validated data into app
│       └── ingest.ts
├── seeds/                  # Human-authored seed examples
├── staging/                # Raw Claude outputs (pre-validation)
├── validated/              # Validated data (ready for ingest)
└── prompts/                # Optional: custom prompt overrides
```

## CLI Commands

### Generate

Generate datasets using Claude API:

```bash
# Generate patterns (default)
npm run generate

# Generate specific type
npm run generate -- -t patterns
npm run generate -- -t tests

# Limit languages/intents/categories
npm run generate -- -l en,pt -i DOC_SEARCH,DOC_QA -c TIME,TOPIC_SEMANTIC

# Adjust count per combination
npm run generate -- -n 20

# Use different Claude model
npm run generate -- -m claude-opus-4-20250514

# Dry run (no API calls)
npm run generate -- --dry-run
```

### Validate

Validate staged datasets:

```bash
# Validate all staged files
npm run validate

# Validate specific file
npm run validate -- -f patterns_batch_123.json

# Move valid files to validated/
npm run validate -- --move
```

### Ingest

Ingest validated data into application:

```bash
# Ingest all validated files
npm run ingest

# Dry run (show changes without writing)
npm run ingest -- --dry-run

# Skip backup creation
npm run ingest -- --no-backup
```

### Full Pipeline

Run the complete workflow:

```bash
npm run pipeline
```

### Statistics

View dataset statistics:

```bash
npx tsx src/cli.ts stats
```

## Dataset Types

### Patterns

Regex patterns for intent classification:

```json
{
  "pattern": "(documents|files) from (last|the past) (week|month)",
  "language": "en",
  "intent": "DOC_SEARCH",
  "category": "TIME"
}
```

**Categories:** TIME, TOPIC_SEMANTIC, FOLDER_TAG, TYPE_MIME, SIZE_PAGES, VERSION, FUZZY_FILENAME, RECENCY_BIAS, METADATA, STRUCTURED_TABLES, DISAMBIGUATION, SNIPPET_CITATIONS, ERROR_EMPTY_STATE

**Intents:** DOC_SEARCH, DOC_ANALYTICS, DOC_QA, DOC_SUMMARIZE

### Tests

Concrete test cases with expected classifications:

```json
{
  "query": "show me PDFs from last week",
  "language": "en",
  "expectedIntent": "DOC_SEARCH",
  "category": "TIME"
}
```

### Fallbacks

Fallback response variations for error states (see existing fallbacks.json for format).

## Validation Rules

The validator enforces:

1. **Schema compliance** - JSON structure matches TypeScript schemas
2. **Deduplication** - Removes duplicate patterns/queries
3. **Quality filters**:
   - Rejects PRODUCT_HELP patterns (app usage questions)
   - Rejects AMBIGUOUS patterns (too vague)
   - Enforces minimum length
   - Validates regex syntax for patterns
4. **Diversity scoring** - Reports distribution across languages/intents/categories

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_API_KEY` | Anthropic API key |
| `ANTHROPIC_API_KEY` | Alternative API key name |

### Default Settings

- Model: `claude-sonnet-4-20250514`
- Count per category: 10
- Languages: en, pt, es
- Max tokens: 8192
- Temperature: 0.7

## Workflow

1. **Seed** (optional): Add human-authored examples to `seeds/` to anchor tone
2. **Generate**: Run Claude API to produce raw datasets → `staging/`
3. **Validate**: Check schema compliance, dedupe, quality filter → `validated/`
4. **Ingest**: Merge into `backend/src/data/` files (with backup)

```
seeds/ ─────────────────────────────────────────────────────────┐
                                                                │
Claude API ──► staging/*.json ──► validator ──► validated/*.json│──► ingest ──► src/data/
                                                                │
                                                 archive/ ◄─────┘
```

## Constraints (Built-in)

- NO PRODUCT_HELP patterns (how to use Koda, upload instructions)
- NO AMBIGUOUS patterns (greetings, single words, vague requests)
- ALL patterns must be document-related
- Patterns use placeholders; tests use concrete values
- Output is JSON only; no extra text

## Development

```bash
# Build TypeScript
npm run build

# Clean staging/validated
npm run clean:staging
npm run clean:validated
```
