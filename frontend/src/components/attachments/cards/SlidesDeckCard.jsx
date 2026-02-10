import React from "react";
import "./SlidesDeckCard.css";

export default function SlidesDeckCard({ deck }) {
  if (!deck?.url) return null;

  const slides = Array.isArray(deck.slides) ? deck.slides : [];

  return (
    <div className="koda-deck-card">
      <div className="koda-deck-card__top">
        <div className="koda-deck-card__meta">
          <div className="koda-deck-card__title">{deck.title || "Google Slides Deck"}</div>
          <div className="koda-deck-card__sub">
            {slides.length ? `${slides.length} slides` : "Deck ready"}
          </div>
        </div>

        <a
          className="koda-deck-card__btn"
          href={deck.url}
          target="_blank"
          rel="noreferrer"
          title="Open deck"
        >
          Open
        </a>
      </div>

      {slides.length > 0 && (
        <div className="koda-deck-card__thumbs" aria-label="Slide thumbnails">
          {slides.slice(0, 12).map((s, idx) => (
            <a
              key={`${s.slideObjectId || "slide"}-${idx}`}
              className="koda-deck-card__thumb"
              href={deck.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Slide ${idx + 1}`}
            >
              <img src={s.thumbnailUrl} alt={`Slide ${idx + 1}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

