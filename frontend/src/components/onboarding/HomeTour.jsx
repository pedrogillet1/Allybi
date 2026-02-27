import React from 'react';
import TourEngine from './TourEngine';

// ─── Persistence helpers (localStorage MVP, swap to API later) ──────────────
function getTourKey(userId) {
  return `allybi:hasSeenHomeTour:${userId}`;
}

export function hasSeenTour(userId) {
  if (!userId) return true;
  // Suppress while sidebar-linked tour is active or hasn't been completed yet
  if (sessionStorage.getItem('koda_sidebar_tour_active') === 'true') return true;
  if (localStorage.getItem(`allybi:hasSeenSidebarLinkedHomeTour:${userId}`) !== 'true') return true;
  return localStorage.getItem(getTourKey(userId)) === 'true';
}

export function markTourSeen(userId) {
  if (!userId) return;
  localStorage.setItem(getTourKey(userId), 'true');
}

// ─── Step definitions ───────────────────────────────────────────────────────
const STEPS = [
  {
    selector: '[data-tour="upload"]',
    i18nKey: 'homeTour.steps.upload',
    preferredPlacement: 'bottom-end',
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="upload-dropzone"]',
    i18nKey: 'homeTour.steps.dropzone',
    preferredPlacement: 'right',
    fallbackPlacements: ['bottom', 'left'],
    spotlightPadding: 12,
    beforeEnter: 'openUploadModal',
    beforeLeave: 'closeUploadModal',
    onBack: 'closeUploadModal',
  },
  {
    selector: '[data-tour="file-insights"]',
    i18nKey: 'homeTour.steps.fileInsights',
    preferredPlacement: 'left',
    fallbackPlacements: ['right', 'bottom', 'top'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="smart-categories"]',
    i18nKey: 'homeTour.steps.smartCategories',
    preferredPlacement: 'top',
    fallbackPlacements: ['bottom', 'right', 'left'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="search"]',
    i18nKey: 'homeTour.steps.search',
    preferredPlacement: 'bottom-start',
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="integrations"]',
    i18nKey: 'homeTour.steps.integrations',
    preferredPlacement: 'left',
    fallbackPlacements: ['right', 'bottom', 'top'],
    spotlightPadding: 10,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function HomeTour({ onOpenUploadModal, onCloseUploadModal }) {
  return (
    <TourEngine
      steps={STEPS}
      namespace="homeTour"
      hasSeenFn={hasSeenTour}
      markSeenFn={markTourSeen}
      onAction={(name) => {
        if (name === 'openUploadModal')  onOpenUploadModal?.();
        if (name === 'closeUploadModal') onCloseUploadModal?.();
      }}
      onStepChange={(index) => {
        // Only the dropzone step (index 1) should have the upload modal open.
        // Close it defensively on every other step.
        if (index !== 1) onCloseUploadModal?.();
      }}
      onClose={() => {
        // Ensure upload modal is closed if tour ends while on dropzone step
        onCloseUploadModal?.();
      }}
    />
  );
}
