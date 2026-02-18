from __future__ import annotations

from typing import Any


def _to_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def metrics_from_series_points(points: list[Any]) -> dict[str, Any]:
    nums = [n for n in (_to_number(v) for v in points) if n is not None]
    if not nums:
        return {
            "count": 0,
            "sum": 0.0,
            "avg": None,
            "min": None,
            "max": None,
        }
    return {
        "count": len(nums),
        "sum": float(sum(nums)),
        "avg": float(sum(nums) / len(nums)),
        "min": float(min(nums)),
        "max": float(max(nums)),
    }
