from __future__ import annotations

from fastapi import FastAPI, HTTPException

from app.config import settings
from app.contracts.execute_request import ExecuteRequest
from app.contracts.execute_response import ExecuteResponse
from app.contracts.insight_request import InsightRequest
from app.contracts.insight_response import InsightResponse
from app.engine.executor import SpreadsheetExecutor

app = FastAPI(title=settings.app_name, version=settings.app_version)
_executor = SpreadsheetExecutor()


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
    }


@app.post("/v1/spreadsheet/execute", response_model=ExecuteResponse)
def execute(req: ExecuteRequest) -> ExecuteResponse:
    try:
        return _executor.execute(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"execute_failed: {exc}") from exc


@app.post("/v1/spreadsheet/insight", response_model=InsightResponse)
def insight(req: InsightRequest) -> InsightResponse:
    try:
        return _executor.insight(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"insight_failed: {exc}") from exc
