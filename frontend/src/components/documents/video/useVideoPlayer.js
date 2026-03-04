import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY_VOLUME = 'allybi_video_volume';
const STORAGE_KEY_SPEED = 'allybi_video_speed';
const STORAGE_KEY_MUTED = 'allybi_video_muted';

function readStorage(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

/**
 * Hook that wraps a <video> element ref and exposes clean state + controls.
 *
 * Returns an object with:
 *  - state: playing, currentTime, duration, buffered, volume, muted, speed,
 *           isFullscreen, waiting, canPlay, error
 *  - actions: play, pause, togglePlay, seek, setVolume, toggleMute,
 *             setSpeed, toggleFullscreen, requestPiP
 *  - videoRef: ref to attach to the <video> element
 *  - shellRef: ref to attach to the fullscreen container
 */
export default function useVideoPlayer() {
  const videoRef = useRef(null);
  const shellRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);     // furthest buffered second
  const [volume, setVolumeState] = useState(() => readStorage(STORAGE_KEY_VOLUME, 1));
  const [muted, setMutedState] = useState(() => readStorage(STORAGE_KEY_MUTED, false));
  const [speed, setSpeedState] = useState(() => readStorage(STORAGE_KEY_SPEED, 1));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [error, setError] = useState(null);

  /* ── sync volume/speed to video element on mount ───── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = speed;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── video event listeners ──────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    const onDurationChange = () => setDuration(v.duration || 0);
    const onLoadedMetadata = () => {
      setDuration(v.duration || 0);
      setCanPlay(true);
    };
    const onCanPlay = () => { setCanPlay(true); setWaiting(false); };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onProgress = () => {
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
    };
    const onEnded = () => setPlaying(false);
    const onError = () => {
      const code = v.error?.code;
      const msg = v.error?.message || '';
      if (code === 4 || msg.includes('MEDIA_ERR_SRC_NOT_SUPPORTED')) {
        setError('codec');
      } else if (code === 2) {
        setError('network');
      } else {
        setError('unknown');
      }
    };
    const onVolumeChange = () => {
      setVolumeState(v.volume);
      setMutedState(v.muted);
    };

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('durationchange', onDurationChange);
    v.addEventListener('loadedmetadata', onLoadedMetadata);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('progress', onProgress);
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    v.addEventListener('volumechange', onVolumeChange);

    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('durationchange', onDurationChange);
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('progress', onProgress);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('error', onError);
      v.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  /* ── fullscreen tracking ────────────────────────────── */
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /* ── actions ────────────────────────────────────────── */
  const play = useCallback(() => { videoRef.current?.play?.().catch(() => {}); }, []);
  const pause = useCallback(() => { videoRef.current?.pause?.(); }, []);
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = useCallback((time) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(time)) return;
    v.currentTime = Math.max(0, Math.min(time, v.duration || 0));
  }, []);

  const setVolume = useCallback((val) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(1, val));
    v.volume = clamped;
    if (clamped > 0 && v.muted) v.muted = false;
    try { localStorage.setItem(STORAGE_KEY_VOLUME, JSON.stringify(clamped)); } catch {}
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    try { localStorage.setItem(STORAGE_KEY_MUTED, JSON.stringify(v.muted)); } catch {}
  }, []);

  const setSpeed = useCallback((rate) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setSpeedState(rate);
    try { localStorage.setItem(STORAGE_KEY_SPEED, JSON.stringify(rate)); } catch {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const requestPiP = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture?.().catch(() => {});
    } else {
      v.requestPictureInPicture?.().catch(() => {});
    }
  }, []);

  return {
    videoRef,
    shellRef,
    state: {
      playing, currentTime, duration, buffered,
      volume, muted, speed,
      isFullscreen, waiting, canPlay, error,
    },
    actions: {
      play, pause, togglePlay, seek,
      setVolume, toggleMute, setSpeed,
      toggleFullscreen, requestPiP,
    },
  };
}
