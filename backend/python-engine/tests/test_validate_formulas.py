"""Tests for the validate_formulas recipe."""

from __future__ import annotations

import pytest

from app.recipes.validate_formulas import run, validate_one


class TestValidateOne:
    def test_valid_sum(self):
        assert validate_one("A1", "=SUM(B1:B10)") is None

    def test_valid_nested(self):
        assert validate_one("C2", "=IF(A1>0,SUM(B1:B10),0)") is None

    def test_valid_xlookup(self):
        assert validate_one("D1", '=XLOOKUP(A2,A1:A100,B1:B100,"N/A")') is None

    def test_unbalanced_parens_open(self):
        result = validate_one("A1", "=SUM(B1:B10")
        assert result is not None
        assert "Unbalanced" in result["error"]

    def test_unbalanced_parens_close(self):
        result = validate_one("A1", "=SUM(B1:B10))")
        assert result is not None
        assert "Unbalanced" in result["error"]

    def test_unknown_function(self):
        result = validate_one("A1", "=NOTAFUNCTION(B1)")
        assert result is not None
        assert "Unknown function" in result["error"]
        assert "NOTAFUNCTION" in result["error"]

    def test_valid_cell_references(self):
        assert validate_one("Z1", "=A1+B2+$C$3+AA100") is None

    def test_out_of_range_column(self):
        # XFE is beyond XFD (16384 columns)
        result = validate_one("A1", "=XFE1+A1")
        assert result is not None
        assert "out of range" in result["error"].lower()

    def test_out_of_range_row(self):
        result = validate_one("A1", "=A1048577")
        assert result is not None
        assert "out of range" in result["error"].lower()


class TestRunRecipe:
    def test_all_valid(self):
        formulas = [
            {"cell": "A1", "formula": "=SUM(B1:B10)"},
            {"cell": "A2", "formula": "=AVERAGE(C1:C10)"},
            {"cell": "A3", "formula": "=VLOOKUP(A1,D1:E10,2,FALSE)"},
        ]
        result = run(formulas=formulas)
        assert result["valid_count"] == 3
        assert result["errors"] == []

    def test_mixed_valid_and_invalid(self):
        formulas = [
            {"cell": "A1", "formula": "=SUM(B1:B10)"},
            {"cell": "A2", "formula": "=BADFUNCTION(C1)"},
            {"cell": "A3", "formula": "=SUM(B1:B10"},
        ]
        result = run(formulas=formulas)
        assert result["valid_count"] == 1
        assert len(result["errors"]) == 2

    def test_empty_input(self):
        result = run(formulas=[])
        assert result["valid_count"] == 0
        assert result["errors"] == []

    def test_no_input(self):
        result = run()
        assert result["valid_count"] == 0
        assert result["errors"] == []

    def test_multiple_unknown_functions(self):
        formulas = [
            {"cell": "B1", "formula": "=FOO(BAR(A1))"},
        ]
        result = run(formulas=formulas)
        assert len(result["errors"]) == 1
        error_msg = result["errors"][0]["error"]
        assert "FOO" in error_msg
        assert "BAR" in error_msg
