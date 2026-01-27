// src/components/chat/StreamingWelcomeMessage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * StreamingWelcomeMessage.jsx (ChatGPT-parity)
 * -------------------------------------------
 * Goals:
 *  - Friendly, minimal welcome like ChatGPT
 *  - No “robotic” claims, no feature dumps
 *  - Fast + subtle typing animation (only for first chat)
 *  - Text is general (not tied to any document type)
 *
 * Props:
 *  - userName?: string
 *  - isFirstChat?: boolean  (true => animate, false => render instantly)
 */

const DEFAULT_PROMPTS = {
  en: [
    "Ask anything, or drop something in to work with.",
    "What are you trying to figure out today?",
    "Want a quick summary, a checklist, or a clean answer?",
    "If you’re not sure how to start, tell me the goal.",
  ],
};

function pickOne(arr, seed) {
  if (!arr || !arr.length) return "";
  const i = Math.abs(seed) % arr.length;
  return arr[i];
}

function makeSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function StreamingWelcomeMessage({
  userName = "",
  isFirstChat = true,
  lang = "en",
}) {
  const seedRef = useRef(makeSeed());

  // Keep it short, like ChatGPT
  const greeting = useMemo(() => {
    const name = (userName || "").trim();
    return name ? `Hi, ${name}.` : "Hi.";
  }, [userName]);

  const sub = useMemo(() => {
    const lines = DEFAULT_PROMPTS[lang] || DEFAULT_PROMPTS.en;
    return pickOne(lines, seedRef.current);
  }, [lang]);

  const full = useMemo(() => `${greeting} ${sub}`, [greeting, sub]);

  // Typing animation: only for first chat
  const [shown, setShown] = useState(isFirstChat ? "" : full);

  useEffect(() => {
    if (!isFirstChat) {
      setShown(full);
      return;
    }

    let i = 0;
    let raf = 0;
    let last = performance.now();

    // ChatGPT-ish: quick start, then steady
    const cpsBase = 45; // characters/sec
    const cpsMax = 75;
    const rampMs = 350;

    const tick = (now) => {
      const elapsed = now - last;
      last = now;

      const ramp = clamp((now - (now - i)) / rampMs, 0, 1); // harmless; keeps ramp stable
      const cps = cpsBase + (cpsMax - cpsBase) * 0.6;

      const chars = Math.max(1, Math.floor((elapsed / 1000) * cps));
      i = Math.min(full.length, i + chars);
      setShown(full.slice(0, i));

      if (i < full.length) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [full, isFirstChat]);

  return (
    <div className="koda-welcome" style={wrap}>
      <div className="koda-welcome-title" style={title}>
        {shown}
        {isFirstChat ? <span className="streaming-cursor" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

const wrap = {
  maxWidth: 720,
  margin: "0 auto",
};

const title = {
  fontFamily: 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 18,
  lineHeight: 1.5,
  fontWeight: 600,
  color: "#111111",
};
