#!/usr/bin/env python3
"""
XLSX Editing QA — Direct API Tests via compute endpoint.

Tests the sheets compute pipeline by POSTing structured ops to:
  POST https://localhost:5000/api/documents/:id/studio/sheets/compute

Sections:
  A: Single-cell values (6 tests)
  B: Formulas (5 tests)
  C: Range paste (1 test)
  D: Sheet operations (2 tests) — SKIPPED, not supported by compute endpoint
  E: Compute API stress tests (2 tests)

Usage:
  python3 frontend/e2e/xlsx-editing-qa-api.py
"""

import json
import ssl
import sys
import urllib.request
import urllib.error
import urllib.parse

BASE = "https://localhost:5000"
EMAIL = "test@koda.com"
PASSWORD = "test123"

# Disable SSL verification for local mkcert
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# ── Helpers ──────────────────────────────────────────────────────────────

def api(method, path, body=None, token=None):
    """Make an API request, return parsed JSON."""
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=CTX) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(raw)
        except Exception:
            return {"ok": False, "error": f"HTTP {e.code}: {raw[:500]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def login():
    """Authenticate and return access token."""
    result = api("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    token = result.get("accessToken")
    if not token:
        print(f"  FATAL: Login failed: {result}")
        sys.exit(1)
    return token


def find_xlsx(token):
    """Find first XLSX document for the test account."""
    result = api("GET", "/api/documents?limit=100", token=token)
    if not result.get("ok"):
        print(f"  FATAL: Documents list failed: {result}")
        sys.exit(1)
    items = result.get("data", {}).get("items", [])
    xlsx_mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    for doc in items:
        if doc.get("mimeType") == xlsx_mime:
            return doc["id"], doc.get("filename", "?")
    print("  FATAL: No XLSX document found")
    sys.exit(1)


def compute(token, doc_id, instruction, ops):
    """Call the compute endpoint."""
    return api("POST", f"/api/documents/{doc_id}/studio/sheets/compute",
               {"instruction": instruction, "ops": ops}, token=token)


# ── Test runner ──────────────────────────────────────────────────────────

PASS = 0
FAIL = 0
SKIP = 0

def check(test_id, description, result):
    """Check a compute result and print pass/fail."""
    global PASS, FAIL
    ok = result.get("ok", False)
    rev = result.get("data", {}).get("revisionId") if ok else None
    if ok and rev:
        PASS += 1
        print(f"  ✅ {test_id}: {description}  →  revisionId={rev}")
    else:
        FAIL += 1
        err = result.get("error", "unknown")
        print(f"  ❌ {test_id}: {description}  →  {err}")


def skip(test_id, description, reason):
    """Mark a test as skipped."""
    global SKIP
    SKIP += 1
    print(f"  ⏭️  {test_id}: {description}  →  SKIPPED ({reason})")


# The first sheet in the test XLSX is "Exercício 1" (with í = U+00ED)
SHEET = "Exercício 1"


# ── Main ─────────────────────────────────────────────────────────────────

def main():
    global PASS, FAIL, SKIP

    print("=" * 60)
    print("XLSX Editing QA — Compute API Tests")
    print("=" * 60)

    # ── Setup ──
    print("\n🔑 Logging in...")
    token = login()
    print(f"  Token: {token[:20]}...")

    print("\n📄 Finding XLSX document...")
    doc_id, filename = find_xlsx(token)
    print(f"  Found: {filename} ({doc_id})")

    # ── Section A: Single-cell values ──
    print(f"\n── Section A: Single-cell Values ──")

    r = compute(token, doc_id, "QA A01: Set A1 to Month", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!A1", "values": [["Month"]]}
    ])
    check("A01", "Set A1 to Month", r)

    r = compute(token, doc_id, "QA A02: Set B1 to Revenue", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!B1", "values": [["Revenue"]]}
    ])
    check("A02", "Set B1 to Revenue", r)

    r = compute(token, doc_id, "QA A03: Set A2 to Jan", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!A2", "values": [["Jan"]]}
    ])
    check("A03", "Set A2 to Jan", r)

    r = compute(token, doc_id, "QA A04: Set B2 to 120000", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!B2", "values": [[120000]]}
    ])
    check("A04", "Set B2 to 120000", r)

    r = compute(token, doc_id, "QA A05: Set A3 to Feb", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!A3", "values": [["Feb"]]}
    ])
    check("A05", "Set A3 to Feb", r)

    r = compute(token, doc_id, "QA A06: Set B3 to 90000", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!B3", "values": [[90000]]}
    ])
    check("A06", "Set B3 to 90000", r)

    # ── Section B: Formulas ──
    print(f"\n── Section B: Formulas ──")

    r = compute(token, doc_id, "QA B01: Set C1 to Total", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!C1", "values": [["Total"]]}
    ])
    check("B01", "Set C1 to Total", r)

    r = compute(token, doc_id, "QA B02: Set C2 to =B2*1.1", [
        {"kind": "set_formula", "a1": f"{SHEET}!C2", "formula": "=B2*1.1"}
    ])
    check("B02", "Set C2 formula =B2*1.1", r)

    r = compute(token, doc_id, "QA B03: Set C3 to =B3*1.1", [
        {"kind": "set_formula", "a1": f"{SHEET}!C3", "formula": "=B3*1.1"}
    ])
    check("B03", "Set C3 formula =B3*1.1", r)

    r = compute(token, doc_id, "QA B04a: Set B4 to 0", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!B4", "values": [[0]]}
    ])
    check("B04a", "Set B4 to 0", r)

    r = compute(token, doc_id, "QA B04b: Set C4 to =SUM(C2:C3)", [
        {"kind": "set_formula", "a1": f"{SHEET}!C4", "formula": "=SUM(C2:C3)"}
    ])
    check("B04b", "Set C4 formula =SUM(C2:C3)", r)

    # ── Section C: Range paste ──
    print(f"\n── Section C: Range Paste ──")

    r = compute(token, doc_id, "QA C01: Paste A6:B9", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!A6:B9", "values": [
            ["Mar", 100000],
            ["Apr", 80000],
            ["May", 110000],
            ["Jun", 95000],
        ]}
    ])
    check("C01", "Paste 4x2 range into A6:B9", r)

    # ── Section D: Sheet operations ──
    print(f"\n── Section D: Sheet Operations ──")

    skip("D01", "Add sheet named Summary",
         "add_sheet is not a compute op kind")
    skip("D02", "Rename sheet to Data",
         "rename_sheet is not a compute op kind")

    # ── Section E: Compute API stress tests ──
    print(f"\n── Section E: Compute API Stress ──")

    r = compute(token, doc_id, "QA E01: create pie chart", [
        {"kind": "set_values", "rangeA1": f"{SHEET}!A1:B5", "values": [
            ["Month", "Revenue"],
            ["Jan", 120000],
            ["Feb", 90000],
            ["Mar", 100000],
            ["Apr", 80000],
        ]},
        {"kind": "create_chart", "spec": {
            "type": "PIE",
            "range": f"{SHEET}!A1:B5",
            "title": "Revenue Share",
        }},
    ])
    check("E01", "Set values + pie chart", r)

    r = compute(token, doc_id, "QA E02: structural + formulas + chart", [
        {"kind": "insert_rows", "sheetName": SHEET, "startIndex": 1, "count": 2},
        {"kind": "insert_columns", "sheetName": SHEET, "startIndex": 2, "count": 1},
        {"kind": "set_values", "rangeA1": f"{SHEET}!A1:C6", "values": [
            ["Month", "Revenue", "Revenue+10%"],
            ["Jan", 120000, ""],
            ["Feb", 90000, ""],
            ["Mar", 100000, ""],
            ["Apr", 80000, ""],
            ["May", 110000, ""],
        ]},
        {"kind": "set_formula", "a1": f"{SHEET}!C2", "formula": "=B2*1.1"},
        {"kind": "set_formula", "a1": f"{SHEET}!C3", "formula": "=B3*1.1"},
        {"kind": "set_formula", "a1": f"{SHEET}!C4", "formula": "=B4*1.1"},
        {"kind": "set_formula", "a1": f"{SHEET}!C5", "formula": "=B5*1.1"},
        {"kind": "set_formula", "a1": f"{SHEET}!C6", "formula": "=B6*1.1"},
        {"kind": "create_chart", "spec": {
            "type": "COLUMN",
            "range": f"{SHEET}!A1:C6",
            "title": "Revenue vs Adjusted",
        }},
    ])
    check("E02", "Insert rows/cols + values + formulas + chart", r)

    # ── Summary ──
    total = PASS + FAIL + SKIP
    print(f"\n{'=' * 60}")
    print(f"Results: {PASS} passed, {FAIL} failed, {SKIP} skipped  ({total} total)")
    print(f"{'=' * 60}")

    sys.exit(1 if FAIL > 0 else 0)


if __name__ == "__main__":
    main()
