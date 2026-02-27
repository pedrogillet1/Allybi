"""Tests for the remove_duplicates recipe."""

from __future__ import annotations

import pandas as pd
import pytest

from app.recipes.remove_duplicates import run


class TestRemoveDuplicates:
    def test_removes_exact_duplicates(self):
        df = pd.DataFrame(
            {
                "name": ["Alice", "Bob", "Alice", "Charlie", "Bob"],
                "age": [30, 25, 30, 35, 25],
            }
        )
        result = run(dataframe=df)
        assert result["total_count"] == 5
        assert result["removed_count"] == 2
        assert result["remaining_count"] == 3

    def test_removes_duplicates_by_key_column(self):
        df = pd.DataFrame(
            {
                "name": ["Alice", "Bob", "Alice", "Alice"],
                "score": [100, 90, 95, 100],
            }
        )
        result = run(dataframe=df, key_columns=["name"])
        assert result["total_count"] == 4
        assert result["removed_count"] == 2  # keep first Alice only
        assert result["remaining_count"] == 2

    def test_no_duplicates(self):
        df = pd.DataFrame(
            {
                "id": [1, 2, 3],
                "value": ["a", "b", "c"],
            }
        )
        result = run(dataframe=df)
        assert result["removed_count"] == 0
        assert result["remaining_count"] == 3

    def test_keep_last(self):
        df = pd.DataFrame(
            {
                "name": ["Alice", "Bob", "Alice"],
                "age": [30, 25, 31],
            }
        )
        result = run(dataframe=df, key_columns=["name"], keep="last")
        assert result["removed_count"] == 1
        assert result["remaining_count"] == 2

    def test_empty_dataframe(self):
        df = pd.DataFrame({"a": [], "b": []})
        result = run(dataframe=df)
        assert result["removed_count"] == 0
        assert result["remaining_count"] == 0
        assert result["total_count"] == 0

    def test_no_input_returns_zeros(self):
        result = run()
        assert result == {"removed_count": 0, "remaining_count": 0, "total_count": 0}

    def test_all_duplicates(self):
        df = pd.DataFrame(
            {
                "x": [1, 1, 1, 1],
                "y": [2, 2, 2, 2],
            }
        )
        result = run(dataframe=df)
        assert result["removed_count"] == 3
        assert result["remaining_count"] == 1
