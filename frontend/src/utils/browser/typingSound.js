/**
 * ✨ Typing Sound Effect Utility
 *
 * Provides optional typing sounds for streaming animation
 * Uses Web Audio API for lightweight, synthetic typing sounds
 */

let audioContext = null;

/**
 * Initialize audio context (call once)
 */
export function initializeAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a subtle typing sound
 * @param {number} volume - Volume level (0.0 to 1.0, default: 0.05)
 */
export function playTypingSound(volume = 0.05) {
  if (!audioContext) {
    audioContext = initializeAudio();
  }

  // Create oscillator for typing sound
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // High frequency click sound
  oscillator.frequency.value = 800 + Math.random() * 200; // Vary frequency slightly
  oscillator.type = 'sine';

  // Quick fade out for click effect
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.05);
}

/**
 * Play typing sound with variation (for more natural feel)
 */
export function playTypingSoundVaried() {
  const volumes = [0.03, 0.05, 0.04, 0.06, 0.05]; // Vary volume
  const randomVolume = volumes[Math.floor(Math.random() * volumes.length)];
  playTypingSound(randomVolume);
}

/**
 * Play completion sound (when streaming finishes)
 * @param {number} volume - Volume level (0.0 to 1.0, default: 0.1)
 */
export function playCompletionSound(volume = 0.1) {
  if (!audioContext) {
    audioContext = initializeAudio();
  }

  // Create two-tone completion sound
  const oscillator1 = audioContext.createOscillator();
  const oscillator2 = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator1.connect(gainNode);
  oscillator2.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // Two tones for pleasant notification
  oscillator1.frequency.value = 800;
  oscillator2.frequency.value = 1200;
  oscillator1.type = 'sine';
  oscillator2.type = 'sine';

  // Fade in and out
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

  oscillator1.start(audioContext.currentTime);
  oscillator2.start(audioContext.currentTime + 0.1);
  oscillator1.stop(audioContext.currentTime + 0.3);
  oscillator2.stop(audioContext.currentTime + 0.3);
}

/**
 * Enable/disable typing sounds based on user preference
 */
let typingSoundsEnabled = false;

export function enableTypingSounds() {
  typingSoundsEnabled = true;
  initializeAudio();
}

export function disableTypingSounds() {
  typingSoundsEnabled = false;
}

export function areTypingSoundsEnabled() {
  return typingSoundsEnabled;
}

/**
 * Play typing sound only if enabled
 */
export function playTypingSoundIfEnabled() {
  if (typingSoundsEnabled) {
    playTypingSoundVaried();
  }
}

export default {
  initializeAudio,
  playTypingSound,
  playTypingSoundVaried,
  playCompletionSound,
  enableTypingSounds,
  disableTypingSounds,
  areTypingSoundsEnabled,
  playTypingSoundIfEnabled,
};
