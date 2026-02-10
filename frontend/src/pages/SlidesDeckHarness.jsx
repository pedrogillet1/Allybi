/**
 * Slides Deck Rendering Harness
 *
 * Dev-only page that renders a sample `slides_deck` attachment so you can
 * iterate on deck card + thumbnail UX without touching backend/auth.
 *
 * Route: /dev/slides-deck-harness
 */

import React from 'react';
import AttachmentsRenderer from '../components/attachments/AttachmentsRenderer';

function svgThumb(n) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="1" stop-color="#1F2937"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="18" fill="url(#g)"/>
      <rect x="24" y="24" width="592" height="72" rx="12" fill="#0B0F19" opacity="0.55"/>
      <text x="44" y="72" font-size="28" font-family="Arial, sans-serif" fill="#FFFFFF">Slide ${n}</text>
      <rect x="24" y="124" width="420" height="18" rx="9" fill="#FFFFFF" opacity="0.25"/>
      <rect x="24" y="156" width="520" height="18" rx="9" fill="#FFFFFF" opacity="0.16"/>
      <rect x="24" y="188" width="480" height="18" rx="9" fill="#FFFFFF" opacity="0.12"/>
      <rect x="24" y="220" width="300" height="18" rx="9" fill="#FFFFFF" opacity="0.10"/>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function SlidesDeckHarness() {
  const deckUrl = 'https://docs.google.com/presentation/d/TEST_PRESENTATION_ID/edit';

  const attachment = {
    type: 'slides_deck',
    title: 'Allybi (Minimal Intro)',
    presentationId: 'TEST_PRESENTATION_ID',
    url: deckUrl,
    slides: Array.from({ length: 6 }).map((_, i) => ({
      slideObjectId: `slide_${i + 1}`,
      thumbnailUrl: svgThumb(i + 1),
      width: 640,
      height: 360,
    })),
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0B0F19', color: '#fff', padding: 32 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, marginBottom: 8 }}>
          Slides Deck Harness
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 0, marginBottom: 18 }}>
          Rendering sample <code>slides_deck</code> attachment.
        </p>

        <div style={{ background: '#FFFFFF', borderRadius: 18, padding: 18 }}>
          <AttachmentsRenderer attachments={[attachment]} />
        </div>
      </div>
    </div>
  );
}

