from __future__ import annotations

from pydantic import BaseModel, Field


class InsightRequest(BaseModel):
    request_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    correlation_id: str = Field(min_length=1)
    spreadsheet_id: str = Field(min_length=1)
    ranges: list[str] = Field(default_factory=list)
    language: str | None = None
