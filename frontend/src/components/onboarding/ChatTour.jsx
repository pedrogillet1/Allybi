import React from 'react';
import TourEngine from './TourEngine';

// ─── Persistence helpers (localStorage MVP, swap to API later) ──────────────
function getTourKey(userId) {
  return `allybi:hasSeenChatTour:${userId}`;
}

export function hasSeenChatTour(userId) {
  if (!userId) return true;
  return localStorage.getItem(getTourKey(userId)) === 'true';
}

export function markChatTourSeen(userId) {
  if (!userId) return;
  localStorage.setItem(getTourKey(userId), 'true');
}

// ─── Step definitions ───────────────────────────────────────────────────────
// 8 internal steps displayed as 7 logical steps to the user.
// Steps 6 + 7 both display as "7/7" — step 6 auto-skips if drawer is already expanded.
const STEPS = [
  {
    selector: '[data-tour="chat-hero"]',
    i18nKey: 'chatTour.steps.hero',
    preferredPlacement: 'bottom',
    spotlightPadding: 12,
  },
  {
    selector: '[data-tour="chat-input"]',
    i18nKey: 'chatTour.steps.input',
    preferredPlacement: 'top',
    fallbackPlacements: ['bottom', 'right', 'left'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="chat-send"]',
    i18nKey: 'chatTour.steps.send',
    preferredPlacement: 'top',
    fallbackPlacements: ['bottom', 'left'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="chat-plus"]',
    i18nKey: 'chatTour.steps.plus',
    preferredPlacement: 'top-start',
    fallbackPlacements: ['top', 'right', 'bottom'],
    spotlightPadding: 10,
  },
  {
    selector: '[data-tour="chat-upload-files"]',
    i18nKey: 'chatTour.steps.uploadFiles',
    preferredPlacement: 'right',
    fallbackPlacements: ['left', 'bottom', 'top'],
    spotlightPadding: 10,
    beforeEnter: 'openConnectorMenu',
    onBack: 'closeConnectorMenu',
  },
  {
    selector: '[data-tour="chat-connectors"]',
    i18nKey: 'chatTour.steps.connectors',
    preferredPlacement: 'right',
    fallbackPlacements: ['left', 'bottom', 'top'],
    spotlightPadding: 10,
    beforeEnter: 'openConnectorMenu',
    beforeLeave: 'closeConnectorMenu',
  },
  {
    selector: '[data-tour="chat-drawer-toggle"]',
    i18nKey: 'chatTour.steps.organized',
    preferredPlacement: 'right',
    fallbackPlacements: ['bottom', 'left'],
    spotlightPadding: 10,
    beforeLeave: 'expandDrawer',
  },
  {
    selector: '[data-tour="chat-new"]',
    i18nKey: 'chatTour.steps.organized',
    preferredPlacement: 'right',
    fallbackPlacements: ['bottom', 'left'],
    spotlightPadding: 10,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function ChatTour({ onOpenConnectorMenu, onCloseConnectorMenu, onExpandDrawer }) {
  return (
    <TourEngine
      steps={STEPS}
      namespace="chatTour"
      hasSeenFn={hasSeenChatTour}
      markSeenFn={markChatTourSeen}
      displayTotal={7}
      onAction={(name) => {
        if (name === 'openConnectorMenu')  onOpenConnectorMenu?.();
        if (name === 'closeConnectorMenu') onCloseConnectorMenu?.();
        if (name === 'expandDrawer')       onExpandDrawer?.();
      }}
      onClose={() => {
        // Ensure connector menu is closed regardless of which step we're on
        onCloseConnectorMenu?.();
      }}
    />
  );
}
