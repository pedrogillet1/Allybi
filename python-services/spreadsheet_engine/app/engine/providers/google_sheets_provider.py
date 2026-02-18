from __future__ import annotations

import re
from typing import Any

import google.auth
from googleapiclient.discovery import build

from app.config import settings
from app.engine.artifacts.answer_context import summarize_ranges
from app.engine.artifacts.chart_metrics import metrics_from_series_points
from app.engine.providers.base import SpreadsheetProvider


_A1_CELL_RE = re.compile(r"^\$?([A-Za-z]{1,3})\$?(\d{1,7})$")


def _col_to_index(col: str) -> int:
    out = 0
    for ch in col.upper():
        out = out * 26 + (ord(ch) - 64)
    return out - 1


def _index_to_col(idx: int) -> str:
    n = idx + 1
    out = ""
    while n > 0:
        rem = (n - 1) % 26
        out = chr(65 + rem) + out
        n = (n - 1) // 26
    return out or "A"


def _parse_cell_ref(cell: str) -> tuple[int, int]:
    m = _A1_CELL_RE.match(cell.strip())
    if not m:
        raise ValueError(f"Invalid A1 cell: {cell}")
    return _col_to_index(m.group(1)), int(m.group(2)) - 1


def _unquote_sheet(name: str) -> str:
    t = str(name or "").strip()
    if t.startswith("'") and t.endswith("'") and len(t) >= 2:
        return t[1:-1].replace("''", "'")
    return t


def _split_range_a1(range_a1: str) -> tuple[str | None, str]:
    raw = str(range_a1 or "").strip()
    if "!" not in raw:
        return None, raw
    left, right = raw.split("!", 1)
    return _unquote_sheet(left), right.strip()


def _normalize_range_for_sheet(sheet_name: str, a1: str) -> str:
    escaped_sheet_name = str(sheet_name or "").replace("'", "''")
    safe_sheet = (
        sheet_name
        if re.match(r"^[A-Za-z0-9_]+$", sheet_name or "")
        else f"'{escaped_sheet_name}'"
    )
    return f"{safe_sheet}!{a1}"


def _parse_a1_rect(a1: str) -> tuple[int, int, int, int]:
    part = str(a1 or "").strip()
    if not part:
        raise ValueError("A1 range is required")
    if ":" in part:
        start, end = part.split(":", 1)
    else:
        start = end = part
    c1, r1 = _parse_cell_ref(start)
    c2, r2 = _parse_cell_ref(end)
    return min(c1, c2), min(r1, r2), max(c1, c2), max(r1, r2)


class GoogleSheetsProvider(SpreadsheetProvider):
    def __init__(self) -> None:
        creds, _ = google.auth.default(scopes=list(settings.google_scopes))
        self._sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
        self._sheet_map_cache: dict[str, dict[str, int]] = {}
        self._sheet_order_cache: dict[str, list[str]] = {}

    def _load_sheet_map(self, spreadsheet_id: str) -> dict[str, int]:
        cached = self._sheet_map_cache.get(spreadsheet_id)
        if cached is not None:
            return cached
        resp = (
            self._sheets.spreadsheets()
            .get(
                spreadsheetId=spreadsheet_id,
                fields="sheets(properties(sheetId,title))",
            )
            .execute()
        )
        mapping: dict[str, int] = {}
        order: list[str] = []
        for sheet in resp.get("sheets", []) or []:
            props = sheet.get("properties", {})
            title = str(props.get("title") or "").strip()
            sheet_id = props.get("sheetId")
            if not title or not isinstance(sheet_id, int):
                continue
            mapping[title] = sheet_id
            order.append(title)
        self._sheet_map_cache[spreadsheet_id] = mapping
        self._sheet_order_cache[spreadsheet_id] = order
        return mapping

    def _first_sheet_name(self, spreadsheet_id: str) -> str:
        self._load_sheet_map(spreadsheet_id)
        order = self._sheet_order_cache.get(spreadsheet_id, [])
        if not order:
            raise ValueError("Spreadsheet has no sheets")
        return order[0]

    def _resolve_sheet(self, spreadsheet_id: str, sheet_name: str | None) -> tuple[str, int]:
        mapping = self._load_sheet_map(spreadsheet_id)
        if sheet_name and sheet_name in mapping:
            return sheet_name, mapping[sheet_name]
        if sheet_name and sheet_name not in mapping:
            raise ValueError(f"Sheet not found: {sheet_name}")
        first = self._first_sheet_name(spreadsheet_id)
        return first, mapping[first]

    def _range_to_grid(self, spreadsheet_id: str, range_a1: str, sheet_hint: str | None = None) -> tuple[str, dict[str, Any], str]:
        sheet_name_from_a1, pure_a1 = _split_range_a1(range_a1)
        sheet_name, sheet_id = self._resolve_sheet(spreadsheet_id, sheet_name_from_a1 or sheet_hint)
        c1, r1, c2, r2 = _parse_a1_rect(pure_a1)
        grid = {
            "sheetId": sheet_id,
            "startRowIndex": r1,
            "endRowIndex": r2 + 1,
            "startColumnIndex": c1,
            "endColumnIndex": c2 + 1,
        }
        return sheet_name, grid, pure_a1

    def _batch_update(self, spreadsheet_id: str, requests: list[dict[str, Any]]) -> dict[str, Any]:
        if not requests:
            return {}
        return (
            self._sheets.spreadsheets()
            .batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests})
            .execute()
        )

    def _set_values(self, spreadsheet_id: str, range_a1: str, values: list[list[Any]], sheet_hint: str | None = None) -> None:
        sheet_name_from_a1, pure_a1 = _split_range_a1(range_a1)
        sheet_name, _ = self._resolve_sheet(spreadsheet_id, sheet_name_from_a1 or sheet_hint)
        full_a1 = _normalize_range_for_sheet(sheet_name, pure_a1)
        (
            self._sheets.spreadsheets()
            .values()
            .update(
                spreadsheetId=spreadsheet_id,
                range=full_a1,
                valueInputOption="USER_ENTERED",
                body={"values": values},
            )
            .execute()
        )

    def _apply_create_chart(self, spreadsheet_id: str, op: dict[str, Any]) -> tuple[int | None, dict[str, Any] | None]:
        spec = op.get("spec") if isinstance(op.get("spec"), dict) else {}
        range_a1 = str(spec.get("range") or op.get("rangeA1") or op.get("range") or "").strip()
        if not range_a1:
            raise ValueError("create_chart requires spec.range or rangeA1")
        chart_type = str(spec.get("type") or "LINE").strip().upper()
        title = str(spec.get("title") or "").strip()
        header_count = int(spec.get("headerCount") or 1)

        sheet_name, grid, pure_a1 = self._range_to_grid(spreadsheet_id, range_a1)
        c1, r1, c2, r2 = _parse_a1_rect(pure_a1)
        rows = max(1, r2 - r1 + 1)
        cols = max(1, c2 - c1 + 1)

        domain = {
            "domain": {
                "sourceRange": {
                    "sources": [
                        {
                            "sheetId": grid["sheetId"],
                            "startRowIndex": r1 + header_count,
                            "endRowIndex": r2 + 1,
                            "startColumnIndex": c1,
                            "endColumnIndex": c1 + 1,
                        }
                    ]
                }
            }
        }

        series = []
        for col in range(c1 + 1, c2 + 1):
            series.append(
                {
                    "series": {
                        "sourceRange": {
                            "sources": [
                                {
                                    "sheetId": grid["sheetId"],
                                    "startRowIndex": r1 + header_count,
                                    "endRowIndex": r2 + 1,
                                    "startColumnIndex": col,
                                    "endColumnIndex": col + 1,
                                }
                            ]
                        }
                    },
                    "targetAxis": "LEFT_AXIS",
                }
            )

        basic_type_map = {
            "LINE": "LINE",
            "BAR": "BAR",
            "COLUMN": "COLUMN",
            "AREA": "AREA",
            "SCATTER": "SCATTER",
        }

        chart_spec: dict[str, Any]
        if chart_type == "PIE":
            value_col = c1 + 1 if cols > 1 else c1
            chart_spec = {
                "title": title or "Chart",
                "pieChart": {
                    "legendPosition": "RIGHT_LEGEND",
                    "domain": {
                        "sourceRange": {
                            "sources": [
                                {
                                    "sheetId": grid["sheetId"],
                                    "startRowIndex": r1 + header_count,
                                    "endRowIndex": r2 + 1,
                                    "startColumnIndex": c1,
                                    "endColumnIndex": c1 + 1,
                                }
                            ]
                        }
                    },
                    "series": {
                        "sourceRange": {
                            "sources": [
                                {
                                    "sheetId": grid["sheetId"],
                                    "startRowIndex": r1 + header_count,
                                    "endRowIndex": r2 + 1,
                                    "startColumnIndex": value_col,
                                    "endColumnIndex": value_col + 1,
                                }
                            ]
                        }
                    },
                },
            }
        else:
            chart_spec = {
                "title": title or "Chart",
                "basicChart": {
                    "chartType": basic_type_map.get(chart_type, "LINE"),
                    "legendPosition": "BOTTOM_LEGEND",
                    "axis": [
                        {"position": "BOTTOM_AXIS", "title": "Category"},
                        {"position": "LEFT_AXIS", "title": "Value"},
                    ],
                    "domains": [domain],
                    "series": series,
                    "headerCount": header_count,
                },
            }

        response = self._batch_update(
            spreadsheet_id,
            [
                {
                    "addChart": {
                        "chart": {
                            "spec": chart_spec,
                            "position": {
                                "overlayPosition": {
                                    "anchorCell": {
                                        "sheetId": grid["sheetId"],
                                        "rowIndex": max(0, r1),
                                        "columnIndex": c2 + 2,
                                    },
                                    "offsetXPixels": 8,
                                    "offsetYPixels": 8,
                                    "widthPixels": 720,
                                    "heightPixels": max(280, min(720, rows * 24)),
                                }
                            },
                        }
                    }
                }
            ],
        )

        chart_id = None
        for reply in response.get("replies", []) or []:
            chart = (reply.get("addChart") or {}).get("chart") or {}
            chart_id = chart.get("chartId")
            if isinstance(chart_id, int):
                break

        chart_entry = {
            "chartId": chart_id if isinstance(chart_id, int) else None,
            "type": chart_type,
            "range": _normalize_range_for_sheet(sheet_name, pure_a1),
            "title": title or None,
            "settings": {
                "type": chart_type,
                "headerCount": header_count,
            },
        }
        return chart_id if isinstance(chart_id, int) else None, chart_entry

    def _apply_update_chart(self, spreadsheet_id: str, op: dict[str, Any]) -> dict[str, Any] | None:
        chart_id = op.get("chartId")
        if not isinstance(chart_id, int):
            raise ValueError("update_chart requires chartId")
        spec = op.get("spec") if isinstance(op.get("spec"), dict) else None
        if not isinstance(spec, dict):
            raise ValueError("update_chart requires spec")
        self._batch_update(
            spreadsheet_id,
            [
                {
                    "updateChartSpec": {
                        "chartId": chart_id,
                        "spec": spec,
                    }
                }
            ],
        )
        range_a1 = str(spec.get("range") or op.get("rangeA1") or op.get("range") or "").strip()
        return {
            "chartId": chart_id,
            "type": str(spec.get("type") or "").upper() or None,
            "range": range_a1 or None,
            "title": str(spec.get("title") or "").strip() or None,
            "settings": {
                "type": str(spec.get("type") or "").upper() or None,
            },
        }

    def execute_ops(self, spreadsheet_id: str, ops: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
        statuses: list[dict[str, Any]] = []
        warnings: list[str] = []
        affected_ranges: list[str] = []
        chart_entries: list[dict[str, Any]] = []
        table_entries: list[dict[str, Any]] = []

        for idx, op in enumerate(ops):
            kind = str(op.get("kind") or "").strip()
            try:
                if kind == "set_values":
                    range_a1 = str(op.get("rangeA1") or "").strip()
                    values = op.get("values")
                    if not range_a1 or not isinstance(values, list):
                        raise ValueError("set_values requires rangeA1 and values")
                    self._set_values(spreadsheet_id, range_a1, values)
                    affected_ranges.append(range_a1)

                elif kind == "set_formula":
                    a1 = str(op.get("a1") or "").strip()
                    formula = str(op.get("formula") or "").strip()
                    if not a1 or not formula:
                        raise ValueError("set_formula requires a1 and formula")
                    self._set_values(spreadsheet_id, a1, [[f"={formula}"]])
                    affected_ranges.append(a1)

                elif kind == "insert_rows":
                    sheet_name = str(op.get("sheetName") or op.get("sheet") or "").strip() or None
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, sheet_name)
                    start = int(op.get("startIndex") or 0)
                    count = max(1, int(op.get("count") or 1))
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "insertDimension": {
                                "range": {
                                    "sheetId": sheet_id,
                                    "dimension": "ROWS",
                                    "startIndex": start,
                                    "endIndex": start + count,
                                },
                                "inheritFromBefore": False,
                            }
                        }],
                    )

                elif kind == "delete_rows":
                    sheet_name = str(op.get("sheetName") or op.get("sheet") or "").strip() or None
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, sheet_name)
                    start = int(op.get("startIndex") or 0)
                    count = max(1, int(op.get("count") or 1))
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "deleteDimension": {
                                "range": {
                                    "sheetId": sheet_id,
                                    "dimension": "ROWS",
                                    "startIndex": start,
                                    "endIndex": start + count,
                                }
                            }
                        }],
                    )

                elif kind == "insert_columns":
                    sheet_name = str(op.get("sheetName") or op.get("sheet") or "").strip() or None
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, sheet_name)
                    start = int(op.get("startIndex") or 0)
                    count = max(1, int(op.get("count") or 1))
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "insertDimension": {
                                "range": {
                                    "sheetId": sheet_id,
                                    "dimension": "COLUMNS",
                                    "startIndex": start,
                                    "endIndex": start + count,
                                },
                                "inheritFromBefore": False,
                            }
                        }],
                    )

                elif kind == "delete_columns":
                    sheet_name = str(op.get("sheetName") or op.get("sheet") or "").strip() or None
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, sheet_name)
                    start = int(op.get("startIndex") or 0)
                    count = max(1, int(op.get("count") or 1))
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "deleteDimension": {
                                "range": {
                                    "sheetId": sheet_id,
                                    "dimension": "COLUMNS",
                                    "startIndex": start,
                                    "endIndex": start + count,
                                }
                            }
                        }],
                    )

                elif kind == "add_sheet":
                    title = str(op.get("title") or op.get("sheetName") or op.get("name") or "").strip()
                    if not title:
                        raise ValueError("add_sheet requires title")
                    self._batch_update(spreadsheet_id, [{"addSheet": {"properties": {"title": title}}}])
                    self._sheet_map_cache.pop(spreadsheet_id, None)
                    self._sheet_order_cache.pop(spreadsheet_id, None)

                elif kind == "rename_sheet":
                    from_name = str(op.get("fromName") or op.get("from") or "").strip()
                    to_name = str(op.get("toName") or op.get("to") or op.get("sheetName") or "").strip()
                    if not from_name or not to_name:
                        raise ValueError("rename_sheet requires fromName and toName")
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, from_name)
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "updateSheetProperties": {
                                "properties": {"sheetId": sheet_id, "title": to_name},
                                "fields": "title",
                            }
                        }],
                    )
                    self._sheet_map_cache.pop(spreadsheet_id, None)
                    self._sheet_order_cache.pop(spreadsheet_id, None)

                elif kind == "delete_sheet":
                    name = str(op.get("sheetName") or op.get("name") or "").strip()
                    if not name:
                        raise ValueError("delete_sheet requires sheetName")
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, name)
                    self._batch_update(spreadsheet_id, [{"deleteSheet": {"sheetId": sheet_id}}])
                    self._sheet_map_cache.pop(spreadsheet_id, None)
                    self._sheet_order_cache.pop(spreadsheet_id, None)

                elif kind == "sort_range":
                    range_a1 = str(op.get("rangeA1") or op.get("range") or "").strip()
                    if not range_a1:
                        raise ValueError("sort_range requires rangeA1")
                    _, grid, _ = self._range_to_grid(spreadsheet_id, range_a1)
                    specs = op.get("sortSpecs")
                    if not isinstance(specs, list) or not specs:
                        specs = [{"dimensionIndex": grid["startColumnIndex"], "sortOrder": "ASCENDING"}]
                    normalized_specs = []
                    for spec in specs:
                        if not isinstance(spec, dict):
                            continue
                        dim = int(spec.get("dimensionIndex") or 0)
                        order = str(spec.get("sortOrder") or spec.get("order") or "ASCENDING").upper()
                        normalized_specs.append(
                            {
                                "dimensionIndex": dim,
                                "sortOrder": "DESCENDING" if order.startswith("DESC") else "ASCENDING",
                            }
                        )
                    if not normalized_specs:
                        raise ValueError("sort_range requires valid sortSpecs")
                    self._batch_update(
                        spreadsheet_id,
                        [{"sortRange": {"range": grid, "sortSpecs": normalized_specs}}],
                    )
                    affected_ranges.append(range_a1)

                elif kind == "filter_range":
                    range_a1 = str(op.get("rangeA1") or op.get("range") or "").strip()
                    if not range_a1:
                        raise ValueError("filter_range requires rangeA1")
                    _, grid, _ = self._range_to_grid(spreadsheet_id, range_a1)
                    self._batch_update(spreadsheet_id, [{"setBasicFilter": {"filter": {"range": grid}}}])
                    affected_ranges.append(range_a1)

                elif kind == "clear_filter":
                    sheet_name = str(op.get("sheetName") or "").strip() or None
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, sheet_name)
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "clearBasicFilter": {"sheetId": sheet_id}
                        }],
                    )

                elif kind == "set_number_format":
                    range_a1 = str(op.get("rangeA1") or op.get("range") or "").strip()
                    pattern = str(op.get("pattern") or op.get("format") or "").strip()
                    if not range_a1 or not pattern:
                        raise ValueError("set_number_format requires rangeA1 and pattern")
                    _, grid, _ = self._range_to_grid(spreadsheet_id, range_a1)
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "repeatCell": {
                                "range": grid,
                                "cell": {
                                    "userEnteredFormat": {
                                        "numberFormat": {
                                            "type": "NUMBER",
                                            "pattern": pattern,
                                        }
                                    }
                                },
                                "fields": "userEnteredFormat.numberFormat",
                            }
                        }],
                    )
                    affected_ranges.append(range_a1)

                elif kind == "set_freeze_panes":
                    sheet_name = str(op.get("sheetName") or "").strip() or None
                    _, sheet_id = self._resolve_sheet(spreadsheet_id, sheet_name)
                    frozen_rows = max(0, int(op.get("frozenRowCount") or op.get("rows") or 0))
                    frozen_cols = max(0, int(op.get("frozenColumnCount") or op.get("columns") or 0))
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "updateSheetProperties": {
                                "properties": {
                                    "sheetId": sheet_id,
                                    "gridProperties": {
                                        "frozenRowCount": frozen_rows,
                                        "frozenColumnCount": frozen_cols,
                                    },
                                },
                                "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
                            }
                        }],
                    )

                elif kind == "create_table":
                    range_a1 = str(op.get("rangeA1") or op.get("range") or "").strip()
                    if not range_a1:
                        raise ValueError("create_table requires rangeA1")
                    sheet_name, grid, pure = self._range_to_grid(spreadsheet_id, range_a1)
                    self._batch_update(
                        spreadsheet_id,
                        [{
                            "addBanding": {
                                "bandedRange": {
                                    "range": grid,
                                }
                            }
                        }],
                    )
                    table_entries.append(
                        {
                            "range": _normalize_range_for_sheet(sheet_name, pure),
                            "sheetName": sheet_name,
                            "hasHeader": op.get("hasHeader") is not False,
                            "style": str(op.get("style") or "light_gray"),
                            "colors": op.get("colors") if isinstance(op.get("colors"), dict) else None,
                        }
                    )
                    affected_ranges.append(range_a1)

                elif kind == "create_chart":
                    _, entry = self._apply_create_chart(spreadsheet_id, op)
                    if entry:
                        chart_entries.append(entry)
                        if entry.get("range"):
                            affected_ranges.append(str(entry["range"]))

                elif kind == "update_chart":
                    entry = self._apply_update_chart(spreadsheet_id, op)
                    if entry:
                        chart_entries.append(entry)
                        if entry.get("range"):
                            affected_ranges.append(str(entry["range"]))

                else:
                    raise ValueError(f"Unsupported compute op: {kind}")

                statuses.append({"index": idx, "kind": kind, "status": "applied"})

            except Exception as exc:  # noqa: BLE001
                statuses.append({"index": idx, "kind": kind or "unknown", "status": "failed", "message": str(exc)})
                warnings.append(f"op[{idx}] {kind or 'unknown'} failed: {exc}")

        unique_ranges = []
        seen = set()
        for item in affected_ranges:
            key = str(item).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            unique_ranges.append(key)

        artifacts = {
            "affectedRanges": unique_ranges,
            "chartEntries": [entry for entry in chart_entries if entry],
            "tableEntries": [entry for entry in table_entries if entry],
        }
        return statuses, warnings, artifacts

    def _read_ranges(self, spreadsheet_id: str, ranges: list[str]) -> dict[str, list[list[Any]]]:
        cleaned = [str(r).strip() for r in ranges if str(r).strip()]
        if not cleaned:
            return {}
        response = (
            self._sheets.spreadsheets()
            .values()
            .batchGet(
                spreadsheetId=spreadsheet_id,
                ranges=cleaned,
                valueRenderOption="UNFORMATTED_VALUE",
                dateTimeRenderOption="SERIAL_NUMBER",
            )
            .execute()
        )
        out: dict[str, list[list[Any]]] = {}
        for item in response.get("valueRanges", []) or []:
            rng = str(item.get("range") or "").strip()
            vals = item.get("values") or []
            out[rng] = vals
        return out

    def build_insight(self, spreadsheet_id: str, ranges: list[str]) -> dict[str, Any]:
        values_by_range = self._read_ranges(spreadsheet_id, ranges)
        summaries = summarize_ranges(values_by_range)
        chart_metrics = {}
        for rng, rows in values_by_range.items():
            flattened = [cell for row in rows for cell in row]
            chart_metrics[rng] = metrics_from_series_points(flattened)
        return {
            "rangeSummaries": summaries,
            "chartMetrics": chart_metrics,
            "rangeValues": values_by_range,
        }
