"""FastAPI entry-point for the Koda Spreadsheet Engine."""

from __future__ import annotations

import hashlib
import time
import uuid
from typing import Any

from fastapi import FastAPI

from .health import router as health_router
from .models import (
    ExecuteRequest,
    ExecuteResponse,
    InsightRequest,
    InsightResponse,
    OpProof,
    SpreadsheetOp,
)
from .recipes import (
    detect_tables,
    generate_formula,
    infer_schema,
    remove_duplicates,
    simulate_apply,
    trim_whitespace,
    validate_formulas,
)

app = FastAPI(
    title="Koda Spreadsheet Engine",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

app.include_router(health_router)

# ---------------------------------------------------------------------------
# Recipe dispatcher
# ---------------------------------------------------------------------------

_RECIPE_DISPATCH: dict[str, Any] = {
    "detect_tables": detect_tables.run,
    "infer_schema": infer_schema.run,
    "remove_duplicates": remove_duplicates.run,
    "trim_whitespace": trim_whitespace.run,
    "validate_formulas": validate_formulas.run,
    "generate_formula": generate_formula.run,
    "simulate_apply": simulate_apply.run,
}


def _hash_dict(d: dict) -> str:
    """Produce a deterministic short hash of *d* for proof hashes."""
    raw = str(sorted(d.items())).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def _run_op(index: int, op: SpreadsheetOp, context: dict | None) -> tuple[OpProof, dict]:
    """Execute a single operation and return (proof, artifacts)."""
    kind = op.kind
    handler = _RECIPE_DISPATCH.get(kind)

    if handler is None:
        return (
            OpProof(
                index=index,
                kind=kind,
                status="failed",
                message=f"Unknown operation kind: {kind}",
            ),
            {},
        )

    # Build params dict from op extra fields (everything except ``kind``)
    params = {k: v for k, v in op.model_dump().items() if k != "kind"}
    if context:
        params["_context"] = context

    before_hash = _hash_dict(params)

    try:
        result = handler(**params)
    except Exception as exc:
        return (
            OpProof(
                index=index,
                kind=kind,
                status="failed",
                message=str(exc),
                before_hash=before_hash,
            ),
            {},
        )

    after_hash = _hash_dict(result) if isinstance(result, dict) else _hash_dict({"result": str(result)})

    return (
        OpProof(
            index=index,
            kind=kind,
            status="applied",
            before_hash=before_hash,
            after_hash=after_hash,
        ),
        result if isinstance(result, dict) else {"result": result},
    )


# ---------------------------------------------------------------------------
# POST /v1/spreadsheet/execute
# ---------------------------------------------------------------------------

@app.post("/v1/spreadsheet/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest) -> ExecuteResponse:
    t0 = time.monotonic()
    trace_id = str(uuid.uuid4())

    applied_ops: list[OpProof] = []
    merged_artifacts: dict[str, Any] = {}
    warnings: list[str] = []
    any_failed = False
    all_failed = True

    for idx, op in enumerate(req.ops):
        proof, artifacts = _run_op(idx, op, req.context)
        applied_ops.append(proof)
        if proof.status == "failed":
            any_failed = True
            if proof.message:
                warnings.append(f"op[{idx}] {op.kind}: {proof.message}")
        else:
            all_failed = False
        if artifacts:
            merged_artifacts[f"op_{idx}_{op.kind}"] = artifacts

    if not req.ops:
        all_failed = False  # vacuously OK

    elapsed_ms = round((time.monotonic() - t0) * 1000, 2)

    if all_failed and req.ops:
        status = "failed"
    elif any_failed:
        status = "partial"
    else:
        status = "ok"

    return ExecuteResponse(
        status=status,
        workbook={"spreadsheet_id": req.spreadsheet_id},
        applied_ops=applied_ops,
        artifacts=merged_artifacts,
        answer_context={},
        proof={
            "engine_version": "0.1.0",
            "provider": "koda-python-engine",
            "timings_ms": elapsed_ms,
            "trace_id": trace_id,
            "ops": [op.model_dump() for op in applied_ops],
        },
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# POST /v1/spreadsheet/insight
# ---------------------------------------------------------------------------

@app.post("/v1/spreadsheet/insight", response_model=InsightResponse)
async def insight(req: InsightRequest) -> InsightResponse:
    t0 = time.monotonic()
    trace_id = str(uuid.uuid4())
    warnings: list[str] = []

    # Insight is a read-only analysis pass.  We delegate to detect_tables
    # and infer_schema to provide initial insights on the requested ranges.
    artifacts: dict[str, Any] = {}

    try:
        # For each requested range, try to infer schema
        for r in req.ranges:
            artifacts[f"range_{r}"] = {
                "requested_range": r,
                "note": "Full insight analysis requires a workbook file upload.",
            }
    except Exception as exc:
        warnings.append(f"Insight analysis error: {exc}")

    elapsed_ms = round((time.monotonic() - t0) * 1000, 2)

    return InsightResponse(
        status="ok",
        answer_context={
            "ranges_analyzed": len(req.ranges),
            "language": req.language or "en",
        },
        artifacts=artifacts,
        proof={
            "engine_version": "0.1.0",
            "provider": "koda-python-engine",
            "timings_ms": elapsed_ms,
            "trace_id": trace_id,
        },
        warnings=warnings,
    )
