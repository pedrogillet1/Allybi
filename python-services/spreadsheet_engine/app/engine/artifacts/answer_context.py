from __future__ import annotations

from typing import Any


def _to_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def summarize_ranges(range_values: dict[str, list[list[Any]]]) -> dict[str, Any]:
    summaries: dict[str, Any] = {}
    for range_a1, rows in range_values.items():
        numeric: list[float] = []
        non_empty = 0
        for row in rows:
            for cell in row:
                if cell not in (None, ""):
                    non_empty += 1
                n = _to_number(cell)
                if n is not None:
                    numeric.append(n)
        summaries[range_a1] = {
            "rows": len(rows),
            "cols": max((len(r) for r in rows), default=0),
            "nonEmptyCells": non_empty,
            "numericCells": len(numeric),
            "sum": sum(numeric) if numeric else 0.0,
            "avg": (sum(numeric) / len(numeric)) if numeric else None,
            "min": min(numeric) if numeric else None,
            "max": max(numeric) if numeric else None,
        }
    return summaries
