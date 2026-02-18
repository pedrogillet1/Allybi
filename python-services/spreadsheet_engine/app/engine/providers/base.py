from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class SpreadsheetProvider(ABC):
    @abstractmethod
    def execute_ops(
        self,
        spreadsheet_id: str,
        ops: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
        """Execute operations and return (applied_op_statuses, warnings, artifacts)."""

    @abstractmethod
    def build_insight(self, spreadsheet_id: str, ranges: list[str]) -> dict[str, Any]:
        """Return deterministic insight payload for the provided ranges."""
