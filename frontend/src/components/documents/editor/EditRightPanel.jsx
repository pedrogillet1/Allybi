import React, { useMemo, useState } from "react";

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid #E6E6EC",
        background: active ? "#111827" : "white",
        color: active ? "white" : "#111827",
        fontFamily: "Plus Jakarta Sans",
        fontWeight: 900,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function EditRightPanel({
  defaultTab = "ask", // ask|targets|changes
  ask,
  targets,
  changes,
  onClose,
}) {
  const availableTabs = useMemo(() => {
    const tabs = [];
    if (ask != null) tabs.push("ask");
    if (targets != null) tabs.push("targets");
    if (changes != null) tabs.push("changes");
    return tabs;
  }, [ask, changes, targets]);

  const initialTab = useMemo(() => {
    if (availableTabs.includes(defaultTab)) return defaultTab;
    return availableTabs[0] || "targets";
  }, [availableTabs, defaultTab]);

  const [tab, setTab] = useState(initialTab);

  const content = useMemo(() => {
    if (tab === "targets") return targets;
    if (tab === "changes") return changes;
    return ask;
  }, [ask, changes, targets, tab]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {availableTabs.length > 1 || typeof onClose === "function" ? (
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #E6E6EC",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {availableTabs.includes("ask") ? (
              <TabButton label="Ask" active={tab === "ask"} onClick={() => setTab("ask")} />
            ) : null}
            {availableTabs.includes("targets") ? (
              <TabButton label="Targets" active={tab === "targets"} onClick={() => setTab("targets")} />
            ) : null}
            {availableTabs.includes("changes") ? (
              <TabButton label="Changes" active={tab === "changes"} onClick={() => setTab("changes")} />
            ) : null}
          </div>

          {typeof onClose === "function" ? (
            <button
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid #E6E6EC",
                background: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              title="Close"
              aria-label="Close"
            >
              <span style={{ fontSize: 16, lineHeight: "16px", fontWeight: 900, color: "#111827" }}>×</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{content}</div>
    </div>
  );
}
