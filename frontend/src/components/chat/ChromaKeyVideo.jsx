import React, { useRef, useEffect } from "react";

/**
 * ChromaKeyVideo — plays a green-screen video on a canvas with the
 * chroma-key colour replaced by transparency.
 *
 * Supports:
 * - mode="crossfade" (default): two staggered videos with a crossfade at the loop seam
 * - mode="pingpong": time-mirrored playback (0->end then end->0) to avoid a hard cut
 *
 * Renders at devicePixelRatio resolution for crisp retina display.
 */
const FADE_DURATION = 0.5; // seconds of crossfade at loop boundary
const SX = 137, SY = 548, SW = 800, SH = 800; // source crop

const ChromaKeyVideo = ({
  src,
  width = 35,
  height = 35,
  style,
  mode = "crossfade", // "crossfade" | "pingpong"
  speed = 2,
  // Some exports include a few non-keyed tail frames (black). Trimming avoids a flash.
  trimEndSeconds = 0.12,
}) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const rw = Math.round(width * dpr);
    const rh = Math.round(height * dpr);

    const makeVideo = () => {
      const v = document.createElement("video");
      v.src = src;
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.setAttribute("playsinline", "");
      v.preload = "auto";
      v.playbackRate = Number(speed) > 0 ? Number(speed) : 1;
      return v;
    };

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = rw;
    canvas.height = rh;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const chromaKey = (data) => {
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (g > 100 && g > r * 2 && g > b * 1.8) {
          d[i + 3] = 0;
        }
      }
    };

    if (mode === "pingpong") {
      const vid = makeVideo();
      // We manually control time, so don't let the browser loop.
      vid.loop = false;

      let duration = 0;
      let t = 0;
      let dir = 1; // 1 forward, -1 backward
      let lastTs = 0;
      let accumMs = 0;

      const draw = (ts) => {
        rafRef.current = requestAnimationFrame(draw);

        if (!duration || !Number.isFinite(duration)) return;
        if (vid.readyState < 2) return;

        if (!lastTs) lastTs = ts;
        const dtMs = Math.min(Math.max(ts - lastTs, 0), 50);
        lastTs = ts;
        accumMs += dtMs;

        // Cap at ~30fps to avoid hammering currentTime seeks.
        if (accumMs < 33) return;
        const stepSec = (accumMs / 1000) * (Number(speed) > 0 ? Number(speed) : 1);
        accumMs = 0;

        const start = 0;
        const end = Math.max(0, duration - Math.max(0, Number(trimEndSeconds) || 0));

        t = t + dir * stepSec;
        if (t >= end) {
          t = end;
          dir = -1;
        } else if (t <= start) {
          t = start;
          dir = 1;
        }

        // Seek and draw.
        try {
          vid.currentTime = t;
        } catch {
          // ignore transient DOM exceptions while seeking
        }

        ctx.clearRect(0, 0, rw, rh);
        ctx.drawImage(vid, SX, SY, SW, SH, 0, 0, rw, rh);
        const frame = ctx.getImageData(0, 0, rw, rh);
        chromaKey(frame);
        ctx.putImageData(frame, 0, 0);
      };

      const onLoaded = () => {
        duration = vid.duration;
        t = 0;
        dir = 1;
        lastTs = 0;
        accumMs = 0;
        // Prime first frame (best-effort).
        try { vid.currentTime = 0; } catch {}
        rafRef.current = requestAnimationFrame(draw);
      };

      vid.addEventListener("loadedmetadata", onLoaded, { once: true });
      vid.addEventListener("canplay", () => { /* no-op; we drive draws */ }, { once: true });

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        vid.pause(); vid.removeAttribute("src"); vid.load();
      };
    }

    // mode === "crossfade" (legacy): Two videos: A plays normally, B starts from 0 and fades in near A's end
    const vidA = makeVideo();
    const vidB = makeVideo();
    vidA.loop = true;
    vidB.loop = true;

    // Off-screen canvas for blending the second video
    const offCanvas = document.createElement("canvas");
    offCanvas.width = rw;
    offCanvas.height = rh;
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });

    let videoDuration = 0;

    const draw = () => {
      if (vidA.paused || vidA.ended) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const safeEnd = Math.max(0, videoDuration - Math.max(0, Number(trimEndSeconds) || 0));
      const t = Math.min(vidA.currentTime, safeEnd || vidA.currentTime);
      const timeLeft = (safeEnd || videoDuration) - t;
      const needsFade = (safeEnd || videoDuration) > 0 && timeLeft < FADE_DURATION;

      // Draw main video (A)
      ctx.clearRect(0, 0, rw, rh);
      ctx.drawImage(vidA, SX, SY, SW, SH, 0, 0, rw, rh);
      const frameA = ctx.getImageData(0, 0, rw, rh);
      chromaKey(frameA);

      if (needsFade && vidB.readyState >= 2) {
        // Draw video B (looped back to start) into off-screen canvas
        offCtx.clearRect(0, 0, rw, rh);
        offCtx.drawImage(vidB, SX, SY, SW, SH, 0, 0, rw, rh);
        const frameB = offCtx.getImageData(0, 0, rw, rh);
        chromaKey(frameB);

        // Blend: fade from A to B
        const blend = 1 - timeLeft / FADE_DURATION; // 0→1 as we approach the end
        const dA = frameA.data;
        const dB = frameB.data;
        for (let i = 0; i < dA.length; i += 4) {
          dA[i]     = dA[i]     * (1 - blend) + dB[i]     * blend;
          dA[i + 1] = dA[i + 1] * (1 - blend) + dB[i + 1] * blend;
          dA[i + 2] = dA[i + 2] * (1 - blend) + dB[i + 2] * blend;
          dA[i + 3] = dA[i + 3] * (1 - blend) + dB[i + 3] * blend;
        }
      }

      ctx.putImageData(frameA, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    };

    // Keep vidB offset so it's at the start when vidA reaches the end
    const syncB = () => {
      if (videoDuration > 0) {
        vidB.currentTime = 0;
        vidB.play().catch(() => {});
      }
    };

    vidA.addEventListener("loadedmetadata", () => {
      videoDuration = vidA.duration;
    });

    // When vidA loops, restart vidB offset
    vidA.addEventListener("seeked", () => {
      if (vidA.currentTime < 0.1) {
        syncB();
      }
    });

    vidA.addEventListener("canplay", () => {
      vidA.play().catch(() => {});
      vidB.play().then(() => { vidB.pause(); vidB.currentTime = 0; }).catch(() => {});
      draw();
    }, { once: true });

    // When vidA is near the end, ensure vidB is playing from start
    const checkSync = setInterval(() => {
      if (videoDuration > 0 && vidA.currentTime > videoDuration - FADE_DURATION - 0.1) {
        if (vidB.paused || vidB.currentTime > FADE_DURATION + 0.5) {
          vidB.currentTime = 0;
          vidB.play().catch(() => {});
        }
      }
    }, 200);

    return () => {
      clearInterval(checkSync);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      vidA.pause(); vidA.removeAttribute("src"); vidA.load();
      vidB.pause(); vidB.removeAttribute("src"); vidB.load();
    };
  }, [src, width, height, mode, speed, trimEndSeconds]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        ...style,
      }}
    />
  );
};

export default ChromaKeyVideo;
