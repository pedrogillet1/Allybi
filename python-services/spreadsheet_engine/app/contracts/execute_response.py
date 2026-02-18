from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AppliedOpStatus(BaseModel):
    index: int
    kind: str
    status: str
    message: str | None = None


class WorkbookResult(BaseModel):
    spreadsheet_id: str


class ProofBlock(BaseModel):
    engine_version: str
    provider: str
    timings_ms: int
    trace_id: str


class ExecuteResponse(BaseModel):
    status: str
    workbook: WorkbookResult
    applied_ops: list[AppliedOpStatus] = Field(default_factory=list)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    answer_context: dict[str, Any] = Field(default_factory=dict)
    proof: ProofBlock
    warnings: list[str] = Field(default_factory=list)
