// frontend/src/components/attachments/cards/ImageCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./ImageCard.css";

/**
 * ImageCard - Renders generated images in chat
 *
 * Props:
 *   image: {
 *     type: "image",
 *     url: string (required - image URL or data URL),
 *     title?: string,
 *     alt?: string,
 *     width?: number,
 *     height?: number,
 *     mimeType?: string,
 *     generatedBy?: string (e.g., "nano-banana"),
 *   }
 */
export default function ImageCard({ image }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const title = image?.title || "Generated image";

  const closeLightbox = () => setIsExpanded(false);
  const toggleLightbox = () => setIsExpanded((v) => !v);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    if (!image?.url) return;
    const link = document.createElement("a");
    link.href = image.url;
    link.download = image.title || "generated-image.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Lightbox: lock scroll + allow Escape to close (and render in a portal to avoid stacking-context bugs).
  useEffect(() => {
    if (!isExpanded) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeLightbox();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    };
  }, [isExpanded]);

  const lightboxNode = useMemo(() => {
    if (!isExpanded) return null;

    return (
      <div
        className="koda-image-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} (expanded)`}
        onClick={closeLightbox}
      >
        <div className="koda-image-lightbox__frame" onClick={(e) => e.stopPropagation()}>
          <div className="koda-image-lightbox__toolbar">
            <div className="koda-image-lightbox__meta">
              <div className="koda-image-lightbox__title">{title}</div>
              {image.generatedBy && (
                <div className="koda-image-lightbox__badge">AI Generated</div>
              )}
            </div>

            <div className="koda-image-lightbox__toolbar-actions">
              <button
                className="koda-image-lightbox__icon-btn"
                onClick={handleDownload}
                title="Download image"
                aria-label="Download image"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>

              <a
                className="koda-image-lightbox__icon-btn"
                href={image.url}
                target="_blank"
                rel="noreferrer"
                title="Open in new tab"
                aria-label="Open in new tab"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h6v6" />
                  <path d="M10 14L21 3" />
                  <path d="M21 14v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
                </svg>
              </a>

              <button
                className="koda-image-lightbox__icon-btn koda-image-lightbox__icon-btn--close"
                onClick={closeLightbox}
                title="Close"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="koda-image-lightbox__stage">
            <img
              src={image.url}
              alt={image.alt || title}
              className="koda-image-lightbox__image"
              draggable={false}
            />
          </div>
        </div>
      </div>
    );
  }, [closeLightbox, handleDownload, image, isExpanded, title]);

  if (!image || !image.url) return null;

  if (hasError) {
    return (
      <div className="koda-image-card koda-image-card--error">
        <div className="koda-image-card__error-content">
          <span className="koda-image-card__error-icon">⚠️</span>
          <span className="koda-image-card__error-text">Failed to load image</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`koda-image-card ${isExpanded ? "koda-image-card--expanded" : ""}`}
        onClick={toggleLightbox}
      >
        {image.title && (
          <div className="koda-image-card__header">
            <div className="koda-image-card__title">{image.title}</div>
            {image.generatedBy && (
              <div className="koda-image-card__badge">AI Generated</div>
            )}
          </div>
        )}

        <div className="koda-image-card__body">
          {isLoading && (
            <div className="koda-image-card__loading">
              <div className="koda-image-card__spinner" />
            </div>
          )}
          <img
            src={image.url}
            alt={image.alt || image.title || "Generated image"}
            className="koda-image-card__image"
            onLoad={handleLoad}
            onError={handleError}
            style={{ display: isLoading ? "none" : "block" }}
          />
        </div>

        <div className="koda-image-card__actions">
          <button
            className="koda-image-card__action-btn"
            onClick={handleDownload}
            title="Download image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <button
            className="koda-image-card__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleLightbox();
            }}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isExpanded ? (
                <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
              ) : (
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {typeof document !== "undefined" && isExpanded && createPortal(lightboxNode, document.body)}
    </>
  );
}
