/**
 * Centralized timing contract for chat answer rendering.
 * Keep answer-path timing values in one place so cadence and animations stay consistent.
 */
export const ANSWER_TIMING = {
  STREAMING: {
    TARGET_CHARS_PER_SEC: 75,
    MAX_CHARS_PER_FLUSH: 12,
    RAMP_MS: 350,
    // Guard against ultra-fast RAF loops on high-refresh displays.
    MIN_FRAME_MS: 16,
  },
  STAGE: {
    BACKEND_EVENT_FALLBACK_MS: 900,
    STOPPED_STATE_RESET_MS: 1200,
  },
  ANIMATION: {
    CURSOR_BLINK_MS: 900,
    ASSISTANT_AVATAR_CROSSFADE_MS: 300,
    MESSAGE_FADE_IN_MS: 300,
  },
};

