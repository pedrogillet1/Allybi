#!/usr/bin/env python3
"""E2E test script for Python-backed Excel system validation."""
import json
import os
import sys
import time
import urllib.request
import urllib.error
import ssl

# Disable SSL verification for local HTTPS
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

BACKEND = "https://127.0.0.1:5000"
PYTHON_ENGINE = "http://127.0.0.1:8011"


def api(method, path, body=None, token=None, base=BACKEND):
    url = f"{base}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, context=ssl_ctx, timeout=30)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return json.loads(body_text)
        except Exception:
            return {"error": body_text, "status": e.code}
    except Exception as e:
        return {"error": str(e)}


def login():
    resp = api("POST", "/api/auth/login", {"email": "test@koda.com", "password": "test123"})
    return resp.get("accessToken")


def find_xlsx_docs(token):
    resp = api("GET", "/api/documents", token=token)
    items = resp.get("data", {}).get("items", [])
    xlsx_mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return [d for d in items if d.get("mimeType") == xlsx_mime and d.get("status") == "ready"]


def find_sheet_names(token, doc_id):
    """Try common sheet names by sending set_values and checking error messages."""
    candidates = [
        "Sheet1", "Sheet 1", "Planilha1", "Planilha 1", "Folha1", "Feuil1",
        "Summary", "SUMMARY", "SUMMARY1", "Data", "Report", "Budget",
        "P&L", "PL", "Fund", "Rosewood", "LMR", "Improvement",
        "Gabarito", "Financas", "Aula 12",
    ]
    for name in candidates:
        resp = api("POST", f"/api/documents/{doc_id}/studio/sheets/compute", {
            "ops": [{"kind": "set_values", "rangeA1": f"{name}!Z99", "values": [["probe"]]}]
        }, token=token)
        err = resp.get("error", "")
        if "Sheet not found" not in err:
            return name
    return None


def test_compute_op(token, doc_id, sheet_name, op_payload, op_name):
    """Test a single compute op and return result summary."""
    resp = api("POST", f"/api/documents/{doc_id}/studio/sheets/compute", {
        "ops": [op_payload]
    }, token=token)
    ok = resp.get("ok", False)
    error = resp.get("error", "")
    data = resp.get("data", {})
    revision_id = data.get("revisionId") if isinstance(data, dict) else None
    return {
        "op": op_name,
        "ok": ok,
        "error": error[:120] if error else "",
        "revisionId": revision_id,
        "acceptedOps": len(data.get("acceptedOps", [])) if isinstance(data, dict) else 0,
        "rejectedOps": len(data.get("rejectedOps", [])) if isinstance(data, dict) else 0,
        "warning": data.get("warning", "") if isinstance(data, dict) else "",
    }


def build_ops(sheet_name):
    """Build test ops for a given sheet name."""
    s = sheet_name
    return [
        ("set_values", {"kind": "set_values", "rangeA1": f"{s}!Z99", "values": [["PyTest"]]}),
        ("set_formula", {"kind": "set_formula", "a1": f"{s}!Z98", "formula": "=1+1"}),
        ("insert_rows", {"kind": "insert_rows", "sheetName": s, "startIndex": 999, "count": 1}),
        ("insert_columns", {"kind": "insert_columns", "sheetName": s, "startIndex": 25, "count": 1}),
        ("sort_range", {"kind": "sort_range", "rangeA1": f"{s}!A1:B10", "sortSpecs": [{"column": 0}]}),
        ("filter_range", {"kind": "filter_range", "rangeA1": f"{s}!A1:C10"}),
        ("create_table", {"kind": "create_table", "rangeA1": f"{s}!A1:C5", "hasHeader": True}),
        ("create_chart", {"kind": "create_chart", "spec": {"range": f"{s}!A1:B5", "type": "BAR", "title": "Test"}}),
    ]


def main():
    print("=" * 70)
    print("STEP 3: LOGIN & FIND TEST DOCUMENT")
    print("=" * 70)

    token = login()
    if not token:
        print("FATAL: Login failed")
        sys.exit(1)
    print(f"Token: {token[:30]}...")

    xlsx_docs = find_xlsx_docs(token)
    print(f"\nFound {len(xlsx_docs)} ready XLSX docs:")
    for d in xlsx_docs:
        print(f"  {d['id']} | {d.get('title', '?')}")

    # Try each doc until we find one with a discoverable sheet name
    doc_id = None
    sheet_name = None
    for d in xlsx_docs:
        print(f"\nProbing sheet names for: {d.get('title')}...")
        name = find_sheet_names(token, d["id"])
        if name:
            doc_id = d["id"]
            sheet_name = name
            print(f"  Found sheet: '{name}'")
            break
        else:
            print(f"  No standard sheet name found")

    if not doc_id or not sheet_name:
        print("\nWARNING: Could not find a sheet name automatically.")
        print("Trying first XLSX doc with default 'Sheet1' anyway...")
        doc_id = xlsx_docs[0]["id"] if xlsx_docs else None
        sheet_name = "Sheet1"

    print(f"\nTest doc: {doc_id}")
    print(f"Sheet: {sheet_name}")

    print("\n" + "=" * 70)
    print("STEP 4: MODE MATRIX TESTS")
    print("=" * 70)

    ops = build_ops(sheet_name)

    # Test current mode (off - default)
    print("\n--- MODE: off (current default) ---")
    for op_name, payload in ops:
        result = test_compute_op(token, doc_id, sheet_name, payload, op_name)
        status = "PASS" if result["ok"] else "FAIL"
        print(f"  {status} | {op_name:20s} | err={result['error'][:60]} | rev={result['revisionId']}")

    print("\n" + "=" * 70)
    print("PYTHON ENGINE DIRECT TESTS")
    print("=" * 70)

    # Test Python engine health
    health = api("GET", "/health", base=PYTHON_ENGINE)
    print(f"\nHealth: {health}")

    # Test execute endpoint
    exec_resp = api("POST", "/v1/spreadsheet/execute", {
        "request_id": "test-001",
        "document_id": "doc-test",
        "user_id": "user-test",
        "correlation_id": "corr-test",
        "spreadsheet_id": "fake-id",
        "ops": [{"kind": "set_values", "rangeA1": "Sheet1!A1", "values": [["test"]]}],
    }, base=PYTHON_ENGINE)
    print(f"\nExecute status: {exec_resp.get('status', exec_resp.get('error', '?')[:80])}")
    print(f"  applied_ops: {len(exec_resp.get('applied_ops', []))}")
    print(f"  warnings: {len(exec_resp.get('warnings', []))}")
    if exec_resp.get("proof"):
        print(f"  proof.provider: {exec_resp['proof'].get('provider')}")
        print(f"  proof.trace_id: {exec_resp['proof'].get('trace_id', '')[:40]}")

    # Test insight endpoint
    insight_resp = api("POST", "/v1/spreadsheet/insight", {
        "request_id": "test-002",
        "document_id": "doc-test",
        "user_id": "user-test",
        "correlation_id": "corr-test",
        "spreadsheet_id": "fake-id",
        "ranges": ["Sheet1!A1:C10"],
    }, base=PYTHON_ENGINE)
    print(f"\nInsight: {json.dumps(insight_resp)[:120]}")

    print("\n" + "=" * 70)
    print("DONE - Results summary above")
    print("=" * 70)


if __name__ == "__main__":
    main()
