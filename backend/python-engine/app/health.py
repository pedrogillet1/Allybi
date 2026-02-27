"""Health-check route."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

VERSION = "0.1.0"


@router.get("/health")
async def health():
    return {"status": "ok", "version": VERSION}
