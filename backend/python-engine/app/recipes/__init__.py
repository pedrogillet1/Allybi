"""Spreadsheet processing recipes.

Each recipe module exposes a ``run(**kwargs)`` function that performs
a single, well-defined spreadsheet operation and returns a dict of results.
"""

from . import (
    detect_tables,
    generate_formula,
    infer_schema,
    remove_duplicates,
    simulate_apply,
    trim_whitespace,
    validate_formulas,
)

__all__ = [
    "detect_tables",
    "generate_formula",
    "infer_schema",
    "remove_duplicates",
    "simulate_apply",
    "trim_whitespace",
    "validate_formulas",
]
