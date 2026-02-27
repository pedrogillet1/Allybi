"""remove_duplicates — deduplicate rows in a worksheet.

Loads the target sheet (or provided DataFrame) into pandas, removes
duplicate rows based on the specified key columns, and returns counts.
"""

from __future__ import annotations

import io
from typing import Any

import pandas as pd


def run(
    *,
    file_bytes: bytes | None = None,
    dataframe: Any | None = None,
    sheet_name: str | None = None,
    key_columns: list[str] | None = None,
    keep: str = "first",
    **_kwargs: Any,
) -> dict:
    """Entry-point for the remove_duplicates recipe.

    Parameters
    ----------
    file_bytes:
        Raw Excel file bytes.  Mutually exclusive with *dataframe*.
    dataframe:
        A pre-built ``pandas.DataFrame`` (used in tests).
    sheet_name:
        Which sheet to load (default: first sheet).
    key_columns:
        Column names to consider for deduplication.  ``None`` means all columns.
    keep:
        Which duplicate to keep: ``"first"`` (default), ``"last"``, or ``False``
        (drop all duplicates).

    Returns
    -------
    dict with ``removed_count``, ``remaining_count``, and ``total_count``.
    """
    df: pd.DataFrame

    if dataframe is not None:
        df = dataframe if isinstance(dataframe, pd.DataFrame) else pd.DataFrame(dataframe)
    elif file_bytes is not None:
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=sheet_name or 0)
    else:
        return {"removed_count": 0, "remaining_count": 0, "total_count": 0}

    total = len(df)

    # Normalise keep argument (JSON may send boolean false as string)
    if keep is False or keep == "false" or keep == "False":
        keep_arg: str | bool = False
    else:
        keep_arg = keep  # "first" or "last"

    subset = key_columns if key_columns else None
    deduped = df.drop_duplicates(subset=subset, keep=keep_arg)

    remaining = len(deduped)
    removed = total - remaining

    return {
        "removed_count": removed,
        "remaining_count": remaining,
        "total_count": total,
    }
