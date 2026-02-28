import React from "react";
import FilePill from "../pills/FilePill";

/**
 * FileActionCard.jsx
 *
 * ChatGPT-like inline attachment card for messages:
 * - Shows a file pill (icon + filename)
 * - Optional secondary actions (Open / Download)
 * - Clean, minimal, consistent with Koda palette
 *
 * Props:
 * - file: {
 *    id?: string
 *    filename?: string
 *    title?: string
 *    url?: string           // download URL or preview URL
 *    previewUrl?: string    // optional in-app preview URL
 *    mimeType?: string
 *    fileType?: string
 *  }
 * - onOpen?: (file) => void
 * - onDownload?: (file) => void
 * - className?: string
 * - style?: object
 */

export default function FileActionCard({
  file,
  onOpen,
  onDownload,
  className = "",
  style = {},
}) {
  if (!file) return null;

  const canDownload = !!file.url && typeof onDownload === "function";
  const canOpen = typeof onOpen === "function";

  return (
    <div className={`koda-file-card ${className}`} style={style}>
      <div className="koda-file-card__row">
        <FilePill file={file} onOpen={canOpen ? onOpen : undefined} />
        <div className="koda-file-card__actions">
          {canOpen ? (
            <button
              type="button"
              className="koda-file-card__btn"
              onClick={() => onOpen(file)}
            >
              Open
            </button>
          ) : null}

          {canDownload ? (
            <button
              type="button"
              className="koda-file-card__btn koda-file-card__btn--secondary"
              onClick={() => onDownload(file)}
            >
              Download
            </button>
          ) : null}
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
.koda-file-card{
  width: 100%;
  margin-top: 10px;
}

.koda-file-card__row{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.koda-file-card__actions{
  display: flex;
  align-items: center;
  gap: 10px;
}

.koda-file-card__btn{
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #E6E6EC;
  background: #F5F5F5;
  color: #32302C;
  font-family: "Plus Jakarta Sans";
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background 150ms ease, transform 120ms ease;
}

.koda-file-card__btn:hover{
  background: #EAEAEA;
}

.koda-file-card__btn:active{
  transform: scale(0.98);
}

.koda-file-card__btn--secondary{
  background: #FFFFFF;
}

.koda-file-card__btn--secondary:hover{
  background: #F5F5F5;
}

@media (max-width: 520px){
  .koda-file-card__row{
    align-items: stretch;
  }
  .koda-file-card__actions{
    width: 100%;
  }
  .koda-file-card__btn{
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce){
  .koda-file-card__btn{
    transition: none !important;
  }
}
`;
