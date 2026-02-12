import React, { useMemo } from "react";
import gmailSvg from "../../../assets/Gmail.svg";
import outlookSvg from "../../../assets/outlook.svg";
import slackSvg from "../../../assets/slack.svg";

const PROVIDERS = [
  { provider: "gmail", label: "Gmail", icon: gmailSvg },
  { provider: "outlook", label: "Outlook", icon: outlookSvg },
  { provider: "slack", label: "Slack", icon: slackSvg },
];

export default function ConnectorPromptCard({ prompt, onPick }) {
  const providers = useMemo(() => {
    const raw = Array.isArray(prompt?.providers) ? prompt.providers : [];
    const normalized = raw.map((p) => String(p || "").toLowerCase()).filter(Boolean);
    const set = new Set(normalized);
    return PROVIDERS.filter((p) => set.size ? set.has(p.provider) : true);
  }, [prompt?.providers]);

  if (!providers.length) return null;

  const family = String(prompt?.family || "").toLowerCase();
  const intent = String(prompt?.intent || "").toLowerCase();

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        padding: 0,
        borderRadius: 0,
        border: "none",
        background: "transparent",
        boxShadow: "none",
        maxWidth: "100%",
      }}
    >
      {providers.map((p) => (
        <button
          key={p.provider}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            // Slack prompts are often "invite the app to a channel/DM". Give the user
            // a direct escape hatch into Slack while still triggering our in-app flow.
            if (p.provider === "slack" && family === "messages" && intent === "read") {
              try {
                window.open("https://slack.com/app_redirect", "_blank", "noopener,noreferrer");
              } catch {}
            }
            onPick?.(p.provider);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            height: 40,
            padding: "0 14px",
            borderRadius: 999,
            border: "1.5px solid #18181B",
            background: "#FFFFFF",
            cursor: "pointer",
            fontFamily: "Plus Jakarta Sans, sans-serif",
            fontSize: 14,
            fontWeight: 850,
            color: "#18181B",
          }}
        >
          <img src={p.icon} alt="" width={22} height={22} style={{ flexShrink: 0 }} />
          {p.label}
        </button>
      ))}
    </div>
  );
}
