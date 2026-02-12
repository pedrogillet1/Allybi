import React, { useMemo } from "react";
import slackSvg from "../../../assets/slack.svg";

import "./SlackMessageCard.css";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

export default function SlackMessageCard({ message, variant = "default" }) {
  const meta = message || {};
  const channelName = safeString(meta.channelName).trim();
  const channelId = safeString(meta.channelId).trim();
  const preview = safeString(meta.preview).trim();
  const compact = variant === "compact";

  const channelLabel = useMemo(() => {
    if (channelName) return `#${channelName}`;
    if (channelId) return channelId;
    return "Slack";
  }, [channelId, channelName]);

  return (
    <div className={`koda-slack-card ${compact ? "koda-slack-card--compact" : ""}`}>
      <div className="koda-slack-card__top">
        <div className="koda-slack-card__title">Slack message</div>
        <div className="koda-slack-card__brand">
          <img className="koda-slack-card__icon" src={slackSvg} alt="" />
          <span className="koda-slack-card__provider">SLACK</span>
        </div>
      </div>

      <div className="koda-slack-card__meta">
        <span className="koda-slack-card__k">Channel</span>
        <span className="koda-slack-card__v" title={channelLabel}>{channelLabel}</span>
      </div>

      {preview ? (
        <div className="koda-slack-card__preview" title={preview}>
          {preview}
        </div>
      ) : (
        <div className="koda-slack-card__preview koda-slack-card__preview--placeholder">
          (no text)
        </div>
      )}
    </div>
  );
}

