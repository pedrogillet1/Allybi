#!/usr/bin/env node
import http from "http";

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, "http://localhost:5000");
    const payload = body ? JSON.stringify(body) : null;
    const opts = { method, headers: { ...headers } };
    if (payload) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(url, opts, (res) => {
      const setCookies = res.headers["set-cookie"] || [];
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        let json;
        try { json = JSON.parse(data); } catch { json = null; }
        resolve({ status: res.statusCode, json, raw: data, setCookies });
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("Timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function parseCookies(setCookies) {
  const cookies = {};
  for (const line of setCookies) {
    const m = line.match(/^([^=]+)=([^;]*)/);
    if (m) cookies[m[1]] = m[2];
  }
  return cookies;
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  console.log("Logging in...");
  const loginRes = await request("POST", "/api/auth/login", { email: "test@koda.com", password: "test1234" });
  const cookies = parseCookies(loginRes.setCookies);
  if (loginRes.json?.accessToken) cookies["koda_at"] = loginRes.json.accessToken;
  const csrf = cookies["koda_csrf"] || "";
  const authHeaders = { Cookie: cookieHeader(cookies), "x-csrf-token": csrf };

  const docsRes = await request("GET", "/api/documents", null, authHeaders);
  const allDocs = (docsRes.json?.data?.items || docsRes.json?.data || []).filter(d => d.status === "ready");

  const tests = [
    { docPrefix: "2ba9f87c", label: "Q29 ATT Bill", query: "What should the customer verify before the scheduled AutoPay date?" },
    { docPrefix: "d4497946", label: "Q36 Breguet", query: "Produce a high-confidence fact sheet using only facts that are directly visible." },
    { docPrefix: "8c00a4ed", label: "Q76 Reserve Req", query: "Compare the rules for demand deposits versus savings deposits in a side-by-side table." },
  ];

  for (const t of tests) {
    const doc = allDocs.find(d => d.id.startsWith(t.docPrefix));
    if (!doc) { console.log(`\n${t.label}: doc not found`); continue; }

    const start = Date.now();
    const chatRes = await request("POST", "/api/chat/chat", {
      message: t.query,
      preferredLanguage: "en",
      language: "en",
      attachedDocuments: [{ id: doc.id, name: doc.filename, type: "pdf" }],
      documentIds: [doc.id],
    }, authHeaders);

    const ms = Date.now() - start;
    const data = chatRes.json?.data || chatRes.json || {};
    const text = data.assistantText || "";
    console.log(`\n=== ${t.label} (${ms}ms, HTTP ${chatRes.status}) ===`);
    console.log(`  Length: ${text.length}ch`);
    console.log(`  AnswerMode: ${data.answerMode || "n/a"}`);
    console.log(`  FailureCode: ${data.failureCode || "none"}`);
    console.log(`  Warnings: ${JSON.stringify(data.warnings || [])}`);
    console.log(`  Sources: ${(data.sources || data.sourceButtons || []).length}`);
    console.log(`  Full text:\n${text}`);
    console.log(`  ---`);
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
