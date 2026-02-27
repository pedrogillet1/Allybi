# Koda Spreadsheet Engine

Python sidecar service for spreadsheet processing. Provides openpyxl/pandas-based
recipes that complement the TypeScript model layer.

## Quick start

```bash
pip install -e ".[dev]"
uvicorn app.main:app --host 0.0.0.0 --port 8011 --reload
```

## Docker

```bash
docker build -t koda-spreadsheet-engine .
docker run -p 8011:8011 koda-spreadsheet-engine
```

## Endpoints

| Method | Path                        | Description                     |
|--------|-----------------------------|---------------------------------|
| GET    | /health                     | Health check                    |
| POST   | /v1/spreadsheet/execute     | Execute spreadsheet operations  |
| POST   | /v1/spreadsheet/insight     | Generate insights for ranges    |

## Running tests

```bash
pytest tests/ -v
```
