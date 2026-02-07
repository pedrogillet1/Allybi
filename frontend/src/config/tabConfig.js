/**
 * Centralized Tab Configuration
 * Single source of truth for mobile bottom navigation tabs
 * Used by both MobileBottomNav and SwipeableTabViewport
 */

import { ROUTES } from '../constants/routes';

// Tab definitions in display order (left to right)
export const TAB_CONFIG = [
  {
    id: 'home',
    index: 0,
    path: ROUTES.HOME,
    labelKey: 'nav.home',
    matchPaths: [ROUTES.HOME],
    // Auth gate feature when unauthenticated
    authGateFeature: 'history',
  },
  {
    id: 'upload',
    index: 1,
    path: ROUTES.UPLOAD_HUB,
    labelKey: 'nav.upload',
    matchPaths: [ROUTES.UPLOAD_HUB, ROUTES.UPLOAD],
    authGateFeature: 'upload',
  },
  {
    id: 'chat',
    index: 2,
    path: ROUTES.CHAT,
    labelKey: 'nav.chat',
    matchPaths: [ROUTES.CHAT, '/'],
    authGateFeature: null, // Chat is default, always accessible
  },
  {
    id: 'settings',
    index: 3,
    path: ROUTES.SETTINGS,
    labelKey: 'nav.settings',
    matchPaths: [ROUTES.SETTINGS],
    authGateFeature: null,
  },
];

export const TAB_COUNT = TAB_CONFIG.length;
export const FIRST_TAB_INDEX = 0;
export const LAST_TAB_INDEX = TAB_COUNT - 1;

/**
 * Get tab index from pathname
 * @param {string} pathname - Current route pathname
 * @returns {number} Tab index, or -1 if not a tab route
 */
export function getTabIndexFromPath(pathname) {
  // Special case: root path maps to chat
  if (pathname === '/') return 2;

  for (const tab of TAB_CONFIG) {
    for (const matchPath of tab.matchPaths) {
      if (pathname === matchPath || pathname.startsWith(matchPath + '/')) {
        return tab.index;
      }
    }
  }
  return -1;
}

/**
 * Get tab config by index
 * @param {number} index - Tab index
 * @returns {Object|null} Tab config or null
 */
export function getTabByIndex(index) {
  return TAB_CONFIG[index] ?? null;
}

/**
 * Get tab path by index
 * @param {number} index - Tab index
 * @returns {string|null} Tab path or null
 */
export function getTabPath(index) {
  return TAB_CONFIG[index]?.path ?? null;
}

/**
 * Check if a pathname is a tab root (not a nested route)
 * Swipe navigation should only work on tab roots
 * @param {string} pathname - Current route pathname
 * @returns {boolean}
 */
export function isTabRoot(pathname) {
  if (pathname === '/') return true;

  for (const tab of TAB_CONFIG) {
    // Check for exact match with any of the tab's paths
    if (tab.matchPaths.includes(pathname)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a pathname is any kind of tab route (including nested)
 * @param {string} pathname - Current route pathname
 * @returns {boolean}
 */
export function isTabRoute(pathname) {
  return getTabIndexFromPath(pathname) !== -1;
}

/**
 * Get adjacent tab indices
 * @param {number} currentIndex - Current tab index
 * @returns {{ prev: number|null, next: number|null }}
 */
export function getAdjacentTabs(currentIndex) {
  return {
    prev: currentIndex > FIRST_TAB_INDEX ? currentIndex - 1 : null,
    next: currentIndex < LAST_TAB_INDEX ? currentIndex + 1 : null,
  };
}
