"""Pydantic models for the spreadsheet engine API.

These contracts MUST stay in sync with the TypeScript definitions at:
  backend/src/services/spreadsheetEngine/spreadsheetEngine.types.ts
"""

from __future__ import annotations

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Execute endpoint
# ---------------------------------------------------------------------------

class SpreadsheetOp(BaseModel):
    """A single spreadsheet operation.  ``kind`` selects the recipe;
    additional fields are forwarded as recipe-specific parameters."""

    kind: str
    model_config = {"extra": "allow"}


class ExecuteRequest(BaseModel):
    request_id: str
    document_id: str
    user_id: str
    correlation_id: str
    spreadsheet_id: str
    ops: list[SpreadsheetOp]
    context: dict | None = None
    options: dict | None = None


class OpProof(BaseModel):
    index: int
    kind: str
    status: str  # "applied" | "failed"
    message: str | None = None
    before_hash: str | None = None
    after_hash: str | None = None


class ExecuteResponse(BaseModel):
    status: str  # "ok" | "partial" | "failed"
    workbook: dict
    applied_ops: list[OpProof]
    artifacts: dict = {}
    answer_context: dict = {}
    proof: dict = {}
    warnings: list[str] = []


# ---------------------------------------------------------------------------
# Insight endpoint
# ---------------------------------------------------------------------------

class InsightRequest(BaseModel):
    request_id: str
    document_id: str
    user_id: str
    correlation_id: str
    spreadsheet_id: str
    ranges: list[str]
    language: str | None = None


class InsightResponse(BaseModel):
    status: str
    answer_context: dict = {}
    artifacts: dict = {}
    proof: dict = {}
    warnings: list[str] = []
