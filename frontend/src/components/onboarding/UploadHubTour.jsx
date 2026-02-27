import React from 'react';
import TourEngine from './TourEngine';

// ─── Persistence helpers ─────────────────────────────────────────────────────
function getTourKey(userId) {
  return `allybi:hasSeenUploadTour:${userId}`;
}

export function hasSeenUploadTour(userId) {
  if (!userId) return true;
  return localStorage.getItem(getTourKey(userId)) === 'true';
}

export function markUploadTourSeen(userId) {
  if (!userId) return;
  localStorage.setItem(getTourKey(userId), 'true');
}

// ─── Step definitions ────────────────────────────────────────────────────────
const STEPS = [
  {
    selector: '[data-tour="upload-dropzone"]',
    i18nKey: 'uploadTour.steps.dropzone',
    preferredPlacement: 'right',
    fallbackPlacements: ['bottom', 'top', 'left'],
    spotlightPadding: 12,
  },
  {
    selector: '[data-tour="upload-select-files"]',
    i18nKey: 'uploadTour.steps.selectFiles',
    preferredPlacement: 'bottom',
    fallbackPlacements: ['top', 'right', 'left'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="upload-select-folder"]',
    i18nKey: 'uploadTour.steps.selectFolder',
    preferredPlacement: 'bottom',
    fallbackPlacements: ['top', 'right', 'left'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="upload-destination-panel"]',
    i18nKey: 'uploadTour.steps.destination',
    preferredPlacement: 'left',
    fallbackPlacements: ['bottom', 'top', 'right'],
    spotlightPadding: 12,
  },
  {
    selector: '[data-tour="upload-destination-search"]',
    i18nKey: 'uploadTour.steps.destinationSearch',
    preferredPlacement: 'left',
    fallbackPlacements: ['bottom', 'top', 'right'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="upload-keep-structure"]',
    i18nKey: 'uploadTour.steps.keepStructure',
    preferredPlacement: 'left',
    fallbackPlacements: ['bottom', 'top', 'right'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="upload-queue"]',
    i18nKey: 'uploadTour.steps.queue',
    preferredPlacement: 'top',
    fallbackPlacements: ['right', 'left', 'bottom'],
    spotlightPadding: 12,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function UploadHubTour() {
  return (
    <TourEngine
      steps={STEPS}
      namespace="uploadTour"
      hasSeenFn={hasSeenUploadTour}
      markSeenFn={markUploadTourSeen}
    />
  );
}
