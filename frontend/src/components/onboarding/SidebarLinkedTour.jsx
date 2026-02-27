import React from 'react';
import { useNavigate } from 'react-router-dom';
import TourEngine from './TourEngine';
import { ROUTES } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';
import { markTourSeen } from './HomeTour';
import { markChatTourSeen } from './ChatTour';
import { markUploadTourSeen } from './UploadHubTour';
import { useAuth } from '../../context/AuthContext';

// ─── Persistence helpers ────────────────────────────────────────────────────
const TOUR_KEY_PREFIX = 'allybi:hasSeenSidebarLinkedHomeTour:';
const SESSION_FLAG = 'koda_sidebar_tour_active';

export function hasSeenSidebarLinkedTour(userId) {
  if (!userId) return true;
  return localStorage.getItem(`${TOUR_KEY_PREFIX}${userId}`) === 'true';
}

export function markSidebarLinkedTourSeen(userId) {
  if (!userId) return;
  localStorage.setItem(`${TOUR_KEY_PREFIX}${userId}`, 'true');
}

// ─── Step definitions (6 cross-page steps) ──────────────────────────────────
const STEPS = [
  {
    // Step 1: Upload CTA on Home
    selector: '[data-tour="upload"]',
    secondarySelector: '[data-tour="sidebar-home"]',
    i18nKey: 'sidebarTour.steps.uploadCta',
    sectionBadge: 'sidebarTour.sections.home',
    preferredPlacement: 'bottom-end',
    spotlightPadding: 10,
    route: ROUTES.HOME,
  },
  {
    // Step 2: Smart Categories on Home
    selector: '[data-tour="smart-categories"]',
    secondarySelector: '[data-tour="sidebar-home"]',
    i18nKey: 'sidebarTour.steps.smartCategories',
    sectionBadge: 'sidebarTour.sections.home',
    preferredPlacement: 'top',
    fallbackPlacements: ['bottom', 'right', 'left'],
    spotlightPadding: 14,
    route: ROUTES.HOME,
  },
  {
    // Step 3: Search on Home
    selector: '[data-tour="search"]',
    secondarySelector: '[data-tour="sidebar-home"]',
    i18nKey: 'sidebarTour.steps.search',
    sectionBadge: 'sidebarTour.sections.home',
    preferredPlacement: 'bottom-start',
    spotlightPadding: 10,
    route: ROUTES.HOME,
  },
  {
    // Step 4: Upload hub dropzone (route change)
    selector: '[data-tour="upload-dropzone"]',
    secondarySelector: '[data-tour="sidebar-upload"]',
    i18nKey: 'sidebarTour.steps.dropzone',
    sectionBadge: 'sidebarTour.sections.upload',
    preferredPlacement: 'right',
    fallbackPlacements: ['bottom', 'left'],
    spotlightPadding: 12,
    route: ROUTES.UPLOAD_HUB,
  },
  {
    // Step 5: Chat plus button (route change)
    selector: '[data-tour="chat-plus"]',
    secondarySelector: '[data-tour="sidebar-chat"]',
    i18nKey: 'sidebarTour.steps.chatPlus',
    sectionBadge: 'sidebarTour.sections.chat',
    preferredPlacement: 'top-start',
    fallbackPlacements: ['top', 'right', 'bottom'],
    spotlightPadding: 10,
    route: ROUTES.CHAT,
  },
  {
    // Step 6: Integrations panel (route change)
    selector: '[data-tour="integrations-panel"]',
    secondarySelector: '[data-tour="sidebar-integrations"]',
    i18nKey: 'sidebarTour.steps.integrations',
    sectionBadge: 'sidebarTour.sections.integrations',
    preferredPlacement: 'left',
    fallbackPlacements: ['right', 'bottom', 'top'],
    spotlightPadding: 12,
    route: ROUTES.INTEGRATIONS,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function SidebarLinkedTour() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const userId = user?.id;

  // Desktop only — sidebar doesn't exist on mobile
  if (isMobile) return null;

  return (
    <TourEngine
      steps={STEPS}
      namespace="sidebarTour"
      hasSeenFn={hasSeenSidebarLinkedTour}
      markSeenFn={markSidebarLinkedTourSeen}
      navigate={navigate}
      onTourActiveChange={(isActive) => {
        if (isActive) {
          sessionStorage.setItem(SESSION_FLAG, 'true');
        } else {
          sessionStorage.removeItem(SESSION_FLAG);
        }
      }}
      onClose={() => {
        // Mark all per-page tours as seen so they don't re-appear
        if (userId) {
          markTourSeen(userId);
          markChatTourSeen(userId);
          markUploadTourSeen(userId);
        }
      }}
    />
  );
}
