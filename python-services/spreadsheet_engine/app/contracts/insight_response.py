from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class InsightResponse(BaseModel):
    status: str
    answer_context: dict[str, Any] = Field(default_factory=dict)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    proof: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
