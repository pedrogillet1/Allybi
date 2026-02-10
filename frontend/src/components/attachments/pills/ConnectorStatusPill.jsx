import React from "react";
import InlineNavPill from "./InlineNavPill";

import gmailSvg from "../../../assets/Gmail.svg";
import outlookSvg from "../../../assets/outlook.svg";
import slackSvg from "../../../assets/slack.svg";

const ICONS = { gmail: gmailSvg, outlook: outlookSvg, slack: slackSvg };
const LABELS = { gmail: "Gmail", outlook: "Outlook", slack: "Slack" };

/**
 * ConnectorStatusPill
 *
 * Renders a pill with provider icon, label, and a small status badge
 * (connected / not connected / expired).
 *
 * Props:
 *  - connector: { provider, connected, expired, indexedDocuments }
 *  - onClick?: () => void
 */
export default function ConnectorStatusPill({ connector, onClick }) {
  const provider = connector?.provider || "unknown";
  const label = LABELS[provider] || provider;
  const isConnected = Boolean(connector?.connected);
  const isExpired = Boolean(connector?.expired);

  const statusText = isExpired ? "Expired" : isConnected ? "Connected" : "Not connected";
  const statusColor = isExpired ? "#F59E0B" : isConnected ? "#22C55E" : "#A1A1AA";

  const iconSrc = ICONS[provider];
  const icon = iconSrc ? (
    <img
      src={iconSrc}
      alt=""
      style={{ width: 24, height: 24, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
      aria-hidden="true"
    />
  ) : null;

  const pillLabel = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        color: statusColor,
        lineHeight: 1,
      }}>
        {statusText}
      </span>
    </span>
  );

  return (
    <InlineNavPill
      label={pillLabel}
      icon={icon}
      onClick={onClick}
      title={`${label} — ${statusText}`}
    />
  );
}
