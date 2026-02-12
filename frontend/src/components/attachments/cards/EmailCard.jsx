import React, { useMemo } from "react";

import gmailSvg from "../../../assets/Gmail.svg";
import outlookSvg from "../../../assets/outlook.svg";

import "./EmailCard.css";

function safeString(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function formatWhen(value) {
  const v = safeString(value).trim();
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString();
  }
  return v;
}

function providerIcon(provider) {
  const p = safeString(provider).toLowerCase();
  if (p === "gmail") return gmailSvg;
  if (p === "outlook") return outlookSvg;
  return null;
}

export default function EmailCard({ email, onOpen, variant = "default", showAction = true }) {
  const meta = email || {};
  const title = safeString(meta.cardTitle).trim() || "Email";
  const actionLabel = safeString(meta.actionLabel).trim() || "Open";
  const provider = safeString(meta.provider).toLowerCase();
  const subject = safeString(meta.subject).trim() || "(no subject)";
  const from = safeString(meta.from).trim();
  const to = safeString(meta.to).trim();
  const cc = safeString(meta.cc).trim();
  const when = formatWhen(meta.receivedAt);
  const preview = safeString(meta.preview).trim();
  const previewIsPlaceholder = Boolean(meta.previewIsPlaceholder);

  const icon = useMemo(() => providerIcon(provider), [provider]);

  const open = () => onOpen?.(meta);
  const compact = variant === "compact";
  const canOpen = typeof onOpen === "function";
  const showActionButton = Boolean(showAction && canOpen && actionLabel);
  const status = safeString(email?.status || "").toLowerCase().trim();
  const statusLabel = safeString(email?.statusLabel || "").trim();
  const showStatus = Boolean(status);

  return (
    <div
      className={`koda-email-card ${compact ? "koda-email-card--compact" : ""}`}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? open : undefined}
      onKeyDown={(e) => {
        if (!canOpen) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`Open email: ${subject}`}
    >
      <div className="koda-email-card__layout">
        <div className="koda-email-card__main">
          <div className="koda-email-card__top">
            <div className="koda-email-card__title">{title}</div>
            <div className="koda-email-card__metaRight">
              <div className="koda-email-card__brand">
                {icon ? <img className="koda-email-card__icon" src={icon} alt="" /> : null}
                <span className="koda-email-card__provider">{provider ? provider.toUpperCase() : "EMAIL"}</span>
              </div>
              {showStatus ? (
                <div
                  className={`koda-email-card__status koda-email-card__status--${status}`}
                  aria-label={statusLabel || status}
                  title={statusLabel || status}
                >
                  {statusLabel || status}
                </div>
              ) : null}
              {when ? <div className="koda-email-card__when">{when}</div> : null}
            </div>
          </div>

          <div className="koda-email-card__subject" title={subject}>{subject}</div>

          <div className="koda-email-card__meta">
            {from ? <div className="koda-email-card__line"><span className="koda-email-card__k">From</span><span className="koda-email-card__v" title={from}>{from}</span></div> : null}
            {to ? <div className="koda-email-card__line"><span className="koda-email-card__k">To</span><span className="koda-email-card__v" title={to}>{to}</span></div> : null}
            {cc ? <div className="koda-email-card__line"><span className="koda-email-card__k">Cc</span><span className="koda-email-card__v" title={cc}>{cc}</span></div> : null}
          </div>

          {preview ? (
            <div className={`koda-email-card__preview ${previewIsPlaceholder ? "koda-email-card__preview--placeholder" : ""}`}>
              {preview}
            </div>
          ) : null}
        </div>

        {showActionButton ? (
          <div className="koda-email-card__side">
            <button
              type="button"
              className="koda-email-card__btn koda-email-card__btn--primary"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
            >
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
