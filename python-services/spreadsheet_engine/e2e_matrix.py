#!/usr/bin/env python3
"""Mode matrix test — tests compute ops across off/shadow/enforced modes."""
import json
import sys
import time
import subprocess
import urllib.request
import urllib.error
import ssl

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

BACKEND = "https://127.0.0.1:5000"
PYTHON_ENGINE = "http://127.0.0.1:8011"
DOC_ID = "13369af1-d1fd-4703-bee6-a3652a38c2bc"  # Financas XLSX
SHEET = "Rosewood"


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
            return {"_error": body_text[:200], "_status": e.code}
    except Exception as e:
        return {"_error": str(e)[:200], "_status": 0}


def login():
    resp = api("POST", "/api/auth/login", {"email": "test@koda.com", "password": "test123"})
    return resp.get("accessToken")


def check_backend():
    """Check if backend is alive."""
    try:
        resp = api("GET", "/api/health")
        return resp.get("status") == "ok" or resp.get("ok") is True
    except Exception:
        return False


def build_ops():
    s = SHEET
    return [
        ("set_values",      {"kind": "set_values", "rangeA1": f"{s}!Z99", "values": [["PyTest"]]}),
        ("set_formula",     {"kind": "set_formula", "a1": f"{s}!Z98", "formula": "=1+1"}),
        ("insert_rows",     {"kind": "insert_rows", "sheetName": s, "startIndex": 999, "count": 1}),
        ("insert_columns",  {"kind": "insert_columns", "sheetName": s, "startIndex": 25, "count": 1}),
        ("sort_range",      {"kind": "sort_range", "rangeA1": f"{s}!A1:B10", "sortSpecs": [{"column": 0}]}),
        ("filter_range",    {"kind": "filter_range", "rangeA1": f"{s}!A1:C10"}),
        ("create_table",    {"kind": "create_table", "rangeA1": f"{s}!A1:C5", "hasHeader": True}),
        ("create_chart",    {"kind": "create_chart", "spec": {"range": f"{s}!A1:B5", "type": "BAR", "title": "Test"}}),
    ]


def test_op(token, op_name, payload):
    """Test a single compute op."""
    # First check backend is alive
    if not check_backend():
        return {"op": op_name, "ok": False, "error": "BACKEND_DOWN", "revisionId": None, "metadata": {}}

    resp = api("POST", f"/api/documents/{DOC_ID}/studio/sheets/compute", {"ops": [payload]}, token=token)
    ok = resp.get("ok", False)
    error = resp.get("error", resp.get("_error", ""))
    data = resp.get("data", {})
    if not isinstance(data, dict):
        data = {}

    return {
        "op": op_name,
        "ok": ok,
        "error": str(error)[:120],
        "revisionId": data.get("revisionId"),
        "metadata": {
            "acceptedOps": len(data.get("acceptedOps", [])),
            "rejectedOps": len(data.get("rejectedOps", [])),
            "warning": data.get("warning", "")[:80],
            "applyPath": data.get("applyPath", ""),
        }
    }


def print_results_table(mode, results):
    print(f"\n{'Op':<20s} {'OK':>4s} {'Error':<60s} {'RevID':<8s}")
    print("-" * 95)
    for r in results:
        rev = str(r["revisionId"])[:6] if r["revisionId"] else "-"
        err = r["error"][:58] if r["error"] else ""
        ok_str = "YES" if r["ok"] else "NO"
        print(f"  {r['op']:<18s} {ok_str:>4s} {err:<60s} {rev:<8s}")
        if r["metadata"].get("warning"):
            print(f"    WARNING: {r['metadata']['warning']}")


def main():
    print("=" * 70)
    print("MODE MATRIX TEST")
    print(f"Doc: {DOC_ID}")
    print(f"Sheet: {SHEET}")
    print("=" * 70)

    # ── MODE: OFF (current) ──
    print("\n>>> MODE: off (default — no SPREADSHEET_ENGINE_MODE env)")
    token = login()
    if not token:
        print("FATAL: cannot login")
        sys.exit(1)

    ops = build_ops()
    results_off = []
    for op_name, payload in ops:
        r = test_op(token, op_name, payload)
        results_off.append(r)
        time.sleep(0.5)  # gentle pacing

    print_results_table("off", results_off)

    # ── Summary ──
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    passed = sum(1 for r in results_off if r["ok"])
    total = len(results_off)
    print(f"  off mode: {passed}/{total} passed")

    # Note about shadow/enforced modes
    print("\n  NOTE: shadow and enforced modes require restarting the backend")
    print("  with SPREADSHEET_ENGINE_MODE=shadow or =enforced in .env")
    print("  Since mode is read at construction time, we cannot change it at runtime.")


if __name__ == "__main__":
    main()
