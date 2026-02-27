"""validate_formulas — static analysis of Excel formula strings.

Checks for:
  - balanced parentheses
  - known Excel function names
  - valid cell references (A1-style)
"""

from __future__ import annotations

import re
from typing import Any

# A set of commonly used Excel function names (upper-cased).
# This is not exhaustive but covers the most frequent functions.
_KNOWN_FUNCTIONS: frozenset[str] = frozenset(
    {
        "ABS", "ACOS", "ACOSH", "ADDRESS", "AND", "ASIN", "ASINH", "ATAN",
        "ATAN2", "ATANH", "AVERAGE", "AVERAGEIF", "AVERAGEIFS",
        "CEILING", "CHAR", "CHOOSE", "CLEAN", "CODE", "COLUMN", "COLUMNS",
        "CONCAT", "CONCATENATE", "COS", "COSH", "COUNT", "COUNTA",
        "COUNTBLANK", "COUNTIF", "COUNTIFS",
        "DATE", "DATEVALUE", "DAY", "DAYS", "DGET", "DSUM",
        "EDATE", "EOMONTH", "ERROR.TYPE", "EXACT", "EXP",
        "FACT", "FALSE", "FIND", "FLOOR", "FV",
        "HLOOKUP", "HOUR", "HYPERLINK",
        "IF", "IFERROR", "IFNA", "IFS", "INDEX", "INDIRECT", "INT",
        "ISBLANK", "ISERR", "ISERROR", "ISLOGICAL", "ISNA", "ISNONTEXT",
        "ISNUMBER", "ISTEXT",
        "LARGE", "LEFT", "LEN", "LN", "LOG", "LOG10", "LOOKUP", "LOWER",
        "MATCH", "MAX", "MAXIFS", "MID", "MIN", "MINIFS", "MINUTE",
        "MOD", "MONTH", "MROUND",
        "N", "NA", "NOT", "NOW", "NPER", "NPV",
        "OFFSET", "OR",
        "PERCENTILE", "PERCENTRANK", "PI", "PMT", "POWER", "PRODUCT",
        "PROPER", "PV",
        "QUOTIENT",
        "RAND", "RANDBETWEEN", "RANK", "RATE", "REPLACE", "REPT",
        "RIGHT", "ROUND", "ROUNDDOWN", "ROUNDUP", "ROW", "ROWS",
        "SEARCH", "SECOND", "SEQUENCE", "SHEET", "SIGN", "SIN", "SINH",
        "SMALL", "SORT", "SORTBY", "SQRT", "STDEV", "STDEVP",
        "SUBSTITUTE", "SUBTOTAL", "SUM", "SUMIF", "SUMIFS", "SUMPRODUCT",
        "SWITCH",
        "TAN", "TANH", "TEXT", "TEXTJOIN", "TIME", "TIMEVALUE", "TODAY",
        "TRANSPOSE", "TRIM", "TRUE", "TRUNC", "TYPE",
        "UNIQUE", "UPPER",
        "VALUE", "VAR", "VARP", "VLOOKUP",
        "WEEKDAY", "WEEKNUM", "WORKDAY",
        "XLOOKUP", "XMATCH",
        "YEAR", "YEARFRAC",
        # Lambda / dynamic-array era
        "LAMBDA", "LET", "MAP", "FILTER", "REDUCE", "SCAN",
        "BYROW", "BYCOL", "MAKEARRAY", "HSTACK", "VSTACK",
        "WRAPCOLS", "WRAPROWS", "TAKE", "DROP", "EXPAND",
        "CHOOSECOLS", "CHOOSEROWS", "TOCOL", "TOROW",
        "TEXTSPLIT", "TEXTBEFORE", "TEXTAFTER",
    }
)

# Regex matching an Excel-style cell reference (absolute or relative).
_RE_CELL_REF = re.compile(
    r"\$?[A-Z]{1,3}\$?\d+",
    re.IGNORECASE,
)

# Regex to extract function-name tokens preceding an open parenthesis.
_RE_FUNC_CALL = re.compile(r"([A-Z][A-Z0-9_.]*)\s*\(", re.IGNORECASE)


def _check_balanced_parens(formula: str) -> str | None:
    depth = 0
    for ch in formula:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if depth < 0:
            return "Unbalanced parentheses: unexpected ')'"
    if depth != 0:
        return f"Unbalanced parentheses: {depth} unclosed '('"
    return None


def _check_functions(formula: str) -> list[str]:
    errors: list[str] = []
    for m in _RE_FUNC_CALL.finditer(formula):
        name = m.group(1).upper()
        if name not in _KNOWN_FUNCTIONS:
            errors.append(f"Unknown function: {m.group(1)}")
    return errors


def _check_cell_refs(formula: str) -> list[str]:
    """Very light check: flag references with column beyond XFD or row > 1048576."""
    errors: list[str] = []
    for m in _RE_CELL_REF.finditer(formula):
        ref = m.group(0).replace("$", "")
        col_str = ""
        row_str = ""
        for ch in ref:
            if ch.isalpha():
                col_str += ch
            else:
                row_str += ch
        # Column bounds
        col_num = 0
        for ch in col_str.upper():
            col_num = col_num * 26 + (ord(ch) - ord("A") + 1)
        if col_num > 16384:  # XFD
            errors.append(f"Column out of range in reference: {m.group(0)}")
        # Row bounds
        try:
            row_num = int(row_str)
            if row_num < 1 or row_num > 1048576:
                errors.append(f"Row out of range in reference: {m.group(0)}")
        except ValueError:
            errors.append(f"Invalid row in reference: {m.group(0)}")
    return errors


def validate_one(cell: str, formula: str) -> dict | None:
    """Validate a single formula string.

    Returns ``None`` if valid, or a dict ``{"cell", "formula", "error"}``
    describing the first error found.
    """
    # Strip leading '=' if present
    body = formula.lstrip("=").strip()

    paren_err = _check_balanced_parens(body)
    if paren_err:
        return {"cell": cell, "formula": formula, "error": paren_err}

    func_errors = _check_functions(body)
    if func_errors:
        return {"cell": cell, "formula": formula, "error": "; ".join(func_errors)}

    ref_errors = _check_cell_refs(body)
    if ref_errors:
        return {"cell": cell, "formula": formula, "error": "; ".join(ref_errors)}

    return None


def run(
    *,
    formulas: list[dict[str, str]] | None = None,
    **_kwargs: Any,
) -> dict:
    """Entry-point for the validate_formulas recipe.

    Parameters
    ----------
    formulas:
        List of ``{"cell": "<ref>", "formula": "<string>"}`` dicts.

    Returns
    -------
    dict with ``errors`` (list of invalid formulas) and ``valid_count``.
    """
    if not formulas:
        return {"errors": [], "valid_count": 0}

    errors: list[dict] = []
    valid = 0

    for entry in formulas:
        cell = entry.get("cell", "?")
        formula = entry.get("formula", "")
        result = validate_one(cell, formula)
        if result is not None:
            errors.append(result)
        else:
            valid += 1

    return {"errors": errors, "valid_count": valid}
