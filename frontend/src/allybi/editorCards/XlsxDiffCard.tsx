import React from "react";

export default function XlsxDiffCard({ title = "Spreadsheet changes", diff }: { title?: string; diff?: any }) {
  return (
    <div style={{ border: "1px solid #d7d7dc", borderRadius: 10, padding: 12, background: "#fff" }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(diff || {}, null, 2)}</pre>
    </div>
  );
}
