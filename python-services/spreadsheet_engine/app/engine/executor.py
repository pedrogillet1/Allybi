from __future__ import annotations

import time
import uuid
from typing import Any

from app.config import settings
from app.contracts.execute_request import ExecuteRequest
from app.contracts.execute_response import AppliedOpStatus, ExecuteResponse, ProofBlock, WorkbookResult
from app.contracts.insight_request import InsightRequest
from app.contracts.insight_response import InsightResponse
from app.engine.providers.google_sheets_provider import GoogleSheetsProvider


class SpreadsheetExecutor:
    def __init__(self) -> None:
        self._provider = GoogleSheetsProvider()

    @staticmethod
    def _trace_id(prefix: str, correlation_id: str) -> str:
        corr = str(correlation_id or "").strip() or "nocorr"
        return f"{prefix}:{corr}:{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _summarize_status(statuses: list[dict[str, Any]]) -> str:
        if not statuses:
            return "ok"
        failed = [s for s in statuses if str(s.get("status") or "").lower() == "failed"]
        if not failed:
            return "ok"
        if len(failed) == len(statuses):
            return "failed"
        return "partial"

    def execute(self, req: ExecuteRequest) -> ExecuteResponse:
        started = time.monotonic()

        raw_ops = [op.model_dump(exclude_none=True) for op in req.ops]
        statuses, warnings, artifacts = self._provider.execute_ops(req.spreadsheet_id, raw_ops)

        affected_ranges = artifacts.get("affectedRanges") if isinstance(artifacts, dict) else []
        ranges = [str(r).strip() for r in (affected_ranges or []) if str(r).strip()]
        answer_context = self._provider.build_insight(req.spreadsheet_id, ranges)

        status = self._summarize_status(statuses)
        elapsed_ms = int((time.monotonic() - started) * 1000)

        applied_ops = [AppliedOpStatus(**item) for item in statuses]
        proof = ProofBlock(
            engine_version=settings.app_version,
            provider="google_sheets",
            timings_ms=elapsed_ms,
            trace_id=self._trace_id("execute", req.correlation_id),
        )

        return ExecuteResponse(
            status=status,
            workbook=WorkbookResult(spreadsheet_id=req.spreadsheet_id),
            applied_ops=applied_ops,
            artifacts=artifacts if isinstance(artifacts, dict) else {},
            answer_context=answer_context if isinstance(answer_context, dict) else {},
            proof=proof,
            warnings=[str(w) for w in warnings],
        )

    def insight(self, req: InsightRequest) -> InsightResponse:
        started = time.monotonic()
        answer_context = self._provider.build_insight(req.spreadsheet_id, req.ranges)
        elapsed_ms = int((time.monotonic() - started) * 1000)

        return InsightResponse(
            status="ok",
            answer_context=answer_context if isinstance(answer_context, dict) else {},
            artifacts={},
            proof={
                "engine_version": settings.app_version,
                "provider": "google_sheets",
                "timings_ms": elapsed_ms,
                "trace_id": self._trace_id("insight", req.correlation_id),
            },
            warnings=[],
        )
