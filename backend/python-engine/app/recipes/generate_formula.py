"""generate_formula — template-based Excel formula generation.

Given an *intent* string and an optional *schema* dict, produces a
formula string and a human-readable explanation.

Supported patterns:
  SUMIFS, COUNTIFS, XLOOKUP, basic arithmetic (sum, average, min, max)
"""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Intent normalisation helpers
# ---------------------------------------------------------------------------

_INTENT_ALIASES: dict[str, str] = {
    "sum": "sum",
    "total": "sum",
    "add": "sum",
    "average": "average",
    "avg": "average",
    "mean": "average",
    "count": "countifs",
    "countif": "countifs",
    "countifs": "countifs",
    "sumif": "sumifs",
    "sumifs": "sumifs",
    "lookup": "xlookup",
    "vlookup": "xlookup",
    "xlookup": "xlookup",
    "find": "xlookup",
    "search": "xlookup",
    "min": "min",
    "minimum": "min",
    "max": "max",
    "maximum": "max",
}


def _normalise_intent(raw: str) -> str:
    key = raw.strip().lower().replace("_", "").replace("-", "").replace(" ", "")
    return _INTENT_ALIASES.get(key, key)


def _col_range(col: str, start_row: int = 2, end_row: int = 1000) -> str:
    return f"{col}{start_row}:{col}{end_row}"


# ---------------------------------------------------------------------------
# Template generators
# ---------------------------------------------------------------------------


def _gen_sum(schema: dict) -> tuple[str, str]:
    value_col = schema.get("value_column", "B")
    rng = _col_range(value_col)
    return f"=SUM({rng})", f"Sums all values in column {value_col}."


def _gen_average(schema: dict) -> tuple[str, str]:
    value_col = schema.get("value_column", "B")
    rng = _col_range(value_col)
    return f"=AVERAGE({rng})", f"Calculates the average of column {value_col}."


def _gen_min(schema: dict) -> tuple[str, str]:
    value_col = schema.get("value_column", "B")
    rng = _col_range(value_col)
    return f"=MIN({rng})", f"Finds the minimum value in column {value_col}."


def _gen_max(schema: dict) -> tuple[str, str]:
    value_col = schema.get("value_column", "B")
    rng = _col_range(value_col)
    return f"=MAX({rng})", f"Finds the maximum value in column {value_col}."


def _gen_sumifs(schema: dict) -> tuple[str, str]:
    sum_col = schema.get("sum_column", "C")
    criteria_col = schema.get("criteria_column", "A")
    criteria_value = schema.get("criteria_value", '"value"')
    sum_rng = _col_range(sum_col)
    crit_rng = _col_range(criteria_col)
    formula = f"=SUMIFS({sum_rng},{crit_rng},{criteria_value})"
    explanation = (
        f"Sums column {sum_col} where column {criteria_col} "
        f"equals {criteria_value}."
    )
    return formula, explanation


def _gen_countifs(schema: dict) -> tuple[str, str]:
    criteria_col = schema.get("criteria_column", "A")
    criteria_value = schema.get("criteria_value", '"value"')
    crit_rng = _col_range(criteria_col)
    formula = f"=COUNTIFS({crit_rng},{criteria_value})"
    explanation = (
        f"Counts rows where column {criteria_col} equals {criteria_value}."
    )
    return formula, explanation


def _gen_xlookup(schema: dict) -> tuple[str, str]:
    lookup_value = schema.get("lookup_value", "A2")
    lookup_col = schema.get("lookup_column", "A")
    return_col = schema.get("return_column", "B")
    lookup_rng = _col_range(lookup_col)
    return_rng = _col_range(return_col)
    formula = f'=XLOOKUP({lookup_value},{lookup_rng},{return_rng},"Not found")'
    explanation = (
        f"Looks up {lookup_value} in column {lookup_col} and returns "
        f"the corresponding value from column {return_col}."
    )
    return formula, explanation


_GENERATORS: dict[str, Any] = {
    "sum": _gen_sum,
    "average": _gen_average,
    "min": _gen_min,
    "max": _gen_max,
    "sumifs": _gen_sumifs,
    "countifs": _gen_countifs,
    "xlookup": _gen_xlookup,
}


def run(
    *,
    intent: str = "",
    schema: dict | None = None,
    **_kwargs: Any,
) -> dict:
    """Entry-point for the generate_formula recipe.

    Parameters
    ----------
    intent:
        A short string describing the desired formula (e.g. ``"sumifs"``).
    schema:
        Dict with column/range hints consumed by the template generator.

    Returns
    -------
    dict with ``formula`` and ``explanation``.
    """
    normalised = _normalise_intent(intent)
    generator = _GENERATORS.get(normalised)

    if generator is None:
        return {
            "formula": "",
            "explanation": f"Unsupported formula intent: '{intent}'.",
            "supported_intents": sorted(_GENERATORS.keys()),
        }

    formula, explanation = generator(schema or {})
    return {"formula": formula, "explanation": explanation}
