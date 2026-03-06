import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import closeIcon from "../../../assets/x-close.svg";

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

  const { t } = useTranslation();
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
              <TabButton label={t("editor.rightPanel.ask")} active={tab === "ask"} onClick={() => setTab("ask")} />
            ) : null}
            {availableTabs.includes("targets") ? (
              <TabButton label={t("editor.rightPanel.targets")} active={tab === "targets"} onClick={() => setTab("targets")} />
            ) : null}
            {availableTabs.includes("changes") ? (
              <TabButton label={t("editor.rightPanel.changes")} active={tab === "changes"} onClick={() => setTab("changes")} />
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
              title={t("editor.rightPanel.close")}
              aria-label={t("editor.rightPanel.close")}
            >
              <img
                src={closeIcon}
                alt=""
                style={{ width: 14, height: 14 }}
              />
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{content}</div>
    </div>
  );
}
