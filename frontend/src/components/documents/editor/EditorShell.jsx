import React from "react";

/**
 * EditorShell
 * - Standardizes edit-mode layout across file types.
 * - Desktop: center canvas + right panel.
 * - Mobile: right panel can be full-screen overlay (handled by caller).
 */
export default function EditorShell({
  header,
  canvas,
  rightPanel,
  isMobile = false,
}) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex" }}>
        {canvas}
      </div>

      {!isMobile ? (
        <div
          style={{
            width: 420,
            minWidth: 420,
            maxWidth: 480,
            height: "100%",
            background: "rgba(255,255,255,0.92)",
            borderLeft: "1px solid #E6E6EC",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {header}
          <div style={{ flex: 1, minHeight: 0 }}>{rightPanel}</div>
        </div>
      ) : null}
    </div>
  );
}

