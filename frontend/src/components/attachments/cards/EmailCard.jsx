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

export default function EmailCard({ email, onOpen }) {
  const meta = email || {};
  const provider = safeString(meta.provider).toLowerCase();
  const subject = safeString(meta.subject).trim() || "(no subject)";
  const from = safeString(meta.from).trim();
  const to = safeString(meta.to).trim();
  const cc = safeString(meta.cc).trim();
  const when = formatWhen(meta.receivedAt);
  const preview = safeString(meta.preview).trim();

  const icon = useMemo(() => providerIcon(provider), [provider]);

  const open = () => onOpen?.(meta);

  return (
    <div
      className="koda-email-card"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`Open email: ${subject}`}
    >
      <div className="koda-email-card__top">
        <div className="koda-email-card__title">Email</div>
        <div className="koda-email-card__metaRight">
          <div className="koda-email-card__brand">
            {icon ? <img className="koda-email-card__icon" src={icon} alt="" /> : null}
            <span className="koda-email-card__provider">{provider ? provider.toUpperCase() : "EMAIL"}</span>
          </div>
          {when ? <div className="koda-email-card__when">{when}</div> : null}
        </div>
      </div>

      <div className="koda-email-card__subject" title={subject}>{subject}</div>

      <div className="koda-email-card__meta">
        {from ? <div className="koda-email-card__line"><span className="koda-email-card__k">From</span><span className="koda-email-card__v" title={from}>{from}</span></div> : null}
        {to ? <div className="koda-email-card__line"><span className="koda-email-card__k">To</span><span className="koda-email-card__v" title={to}>{to}</span></div> : null}
        {cc ? <div className="koda-email-card__line"><span className="koda-email-card__k">Cc</span><span className="koda-email-card__v" title={cc}>{cc}</span></div> : null}
      </div>

      {preview ? <div className="koda-email-card__preview">{preview}</div> : null}

      <div className="koda-email-card__actions">
        <button
          type="button"
          className="koda-email-card__btn koda-email-card__btn--primary"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          Open
        </button>
      </div>
    </div>
  );
}
