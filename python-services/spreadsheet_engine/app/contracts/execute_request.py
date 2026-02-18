from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SpreadsheetContext(BaseModel):
    active_sheet_name: str | None = None
    selection_range_a1: str | None = None
    language: str | None = None
    conversation_id: str | None = None


class SpreadsheetOperation(BaseModel):
    kind: str = Field(min_length=1)

    class Config:
        extra = "allow"


class ExecuteRequest(BaseModel):
    request_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    correlation_id: str = Field(min_length=1)
    spreadsheet_id: str = Field(min_length=1)
    ops: list[SpreadsheetOperation] = Field(default_factory=list)
    context: SpreadsheetContext | None = None
    options: dict[str, Any] = Field(default_factory=dict)
