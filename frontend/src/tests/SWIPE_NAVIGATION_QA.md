# Mobile Tab Shell - Swipe Navigation QA Checklist

## Overview
Production-quality, iOS-perfect swipe navigation system for mobile. All tabs remain mounted (keep-alive) for **zero loading flash** during transitions.

**Tab Order:** Home (0) → Upload (1) → Chat (2) → Settings (3)

---

## Architecture

### Key Differences from Previous Implementation
| Feature | Old (SwipeableTabViewport) | New (MobileTabShell) |
|---------|---------------------------|---------------------|
| Tab mounting | Unmount/remount on navigate | All tabs stay mounted |
| Loading flash | Yes (preview spinner shown) | **None** |
| Scroll preservation | Saved/restored externally | Per-tab scroll containers |
| Adjacent tab preview | Loading spinner placeholder | Actual rendered content |
| Bottom nav animation | None (instant jump) | Animated slide |

### Files
- `MobileTabShell.jsx` - Main shell with keep-alive tabs
- `MobileBottomNav.jsx` - Uses shell for animated navigation
- `tabConfig.js` - Centralized tab configuration
- `safari-fixes.css` - GPU-optimized styles

---

## Debug Mode

Enable debug logging:
```javascript
// In browser console
window.DEBUG_SWIPE = true;
```

Logs gesture decisions, velocity, thresholds, and navigation events.

---

## Test Environment

### Required Devices
- [ ] iPhone (iOS Safari 15+)
- [ ] Android (Chrome 90+)
- [ ] iOS Simulator
- [ ] Android Emulator
- [ ] Chrome DevTools (touch emulation)

---

## Core Tests

### 1. No Loading Flash (CRITICAL)
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Swipe Home → Upload | Instant transition, no spinner | [ ] | [ ] |
| Swipe Upload → Chat | Instant transition, no spinner | [ ] | [ ] |
| Swipe Chat → Settings | Instant transition, no spinner | [ ] | [ ] |
| Swipe back through all tabs | No loading at any point | [ ] | [ ] |
| Fast repeated swipes | All transitions smooth | [ ] | [ ] |

### 2. Bottom Nav Animation
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Tap Home from Chat | Animated slide, same as swipe | [ ] | [ ] |
| Tap Settings from Home | Animated slide right | [ ] | [ ] |
| Tap same tab | No animation (already active) | [ ] | [ ] |

### 3. Swipe Gestures
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Slow swipe (>22% screen) | Navigates to next tab | [ ] | [ ] |
| Fast flick (any distance) | Navigates via velocity | [ ] | [ ] |
| Short slow swipe (<threshold) | Snaps back to current | [ ] | [ ] |
| Finger follows exactly | 1:1 tracking, no lag | [ ] | [ ] |

### 4. Rubber Band at Edges
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Swipe right on Home (first tab) | Rubber band, snap back | [ ] | [ ] |
| Swipe left on Settings (last tab) | Rubber band, snap back | [ ] | [ ] |
| Resistance feels natural | ~30% of finger movement | [ ] | [ ] |

### 5. Scroll Position Preservation
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Scroll down on Home, swipe away | Position saved | [ ] | [ ] |
| Swipe back to Home | Position restored exactly | [ ] | [ ] |
| Each tab remembers position | Independent per tab | [ ] | [ ] |
| Fresh load starts at top | No stale positions | [ ] | [ ] |

---

## Gesture Conflict Tests

### 6. Vertical Scroll
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Scroll up/down in tab | Normal scroll, no tab switch | [ ] | [ ] |
| Diagonal (mostly vertical) | Treats as scroll | [ ] | [ ] |
| Diagonal (mostly horizontal) | Treats as swipe | [ ] | [ ] |

### 7. Horizontal Scroll Areas
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Carousel inside tab | Carousel scrolls only | [ ] | [ ] |
| Element with `data-horizontal-scroll` | No tab switch | [ ] | [ ] |
| Element with `data-swipe-ignore` | No tab switch | [ ] | [ ] |

### 8. Interactive Elements
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Swipe on text input | No tab switch | [ ] | [ ] |
| Swipe on textarea | No tab switch | [ ] | [ ] |
| Swipe on range slider | No tab switch | [ ] | [ ] |

### 9. Edge Zone (Safari Back)
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Swipe from left edge (<16px) | No tab switch | [ ] | N/A |
| Swipe from right edge | No tab switch | [ ] | N/A |
| Swipe from center | Normal navigation | [ ] | [ ] |

### 10. Modal/Overlay
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Swipe with modal open | No tab switch | [ ] | [ ] |
| Swipe after modal closes | Navigation works | [ ] | [ ] |

---

## Performance Tests

### 11. Frame Rate
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Swipe maintains 60fps | No visible jank | [ ] | [ ] |
| Release animation smooth | No dropped frames | [ ] | [ ] |
| Multiple rapid swipes | Consistent performance | [ ] | [ ] |

### 12. Memory
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| All 4 tabs mounted | Reasonable memory usage | [ ] | [ ] |
| Repeated navigation | No memory leak | [ ] | [ ] |
| Long session | Stable performance | [ ] | [ ] |

---

## URL & Routing

### 13. URL Sync
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| Swipe updates URL | URL reflects current tab | [ ] | [ ] |
| Browser back button | Returns to previous tab | [ ] | [ ] |
| Deep link to tab | Correct tab shown | [ ] | [ ] |
| Refresh on tab | Same tab restored | [ ] | [ ] |

---

## Accessibility

### 14. Reduced Motion
| Test | Expected | iOS | Android |
|------|----------|-----|---------|
| `prefers-reduced-motion: reduce` | Instant transition, no animation | [ ] | [ ] |
| Swipe still detectable | Can navigate via swipe | [ ] | [ ] |

---

## Desktop Behavior

### 15. Desktop (Non-Mobile)
| Test | Expected |
|------|----------|
| Desktop viewport (>768px) | No tab shell, normal routes |
| Resize to mobile | Tab shell activates |
| Resize to desktop | Tab shell deactivates |

---

## Known Behaviors

1. **Keep-Alive Memory**: All 4 tabs stay mounted for instant switching. This uses more memory than unmounting inactive tabs but eliminates loading flash.

2. **Data Prefetch**: Documents data is prefetched on tab change to ensure adjacent tabs have data ready.

3. **Scroll Containers**: Each tab has its own scroll container. Scroll position is stored per-tab in refs.

4. **Edge Zones**: 16px from left/right edges is ignored to avoid iOS Safari back gesture conflicts.

---

## Running Tests

```bash
cd frontend

# Unit tests
npm test -- --testPathPattern=swipeNavigation

# All tests
npm test
```

---

## Debugging Tips

1. **Enable debug logging:**
   ```javascript
   window.DEBUG_SWIPE = true;
   ```

2. **Check gesture state:**
   - `IDLE` → `TRACKING` → `DRAGGING` → `SETTLING` → `IDLE`

3. **Verify keep-alive:**
   - Inspect DOM: all 4 `[data-tab-pane]` elements should exist
   - Only active tab has `data-active="true"`

4. **Performance profiling:**
   - Use Chrome DevTools Performance tab
   - Look for paint/layout during swipe (should be minimal)

---

## Sign-off

| Tester | Device | Date | Pass/Fail | Notes |
|--------|--------|------|-----------|-------|
| | | | | |
