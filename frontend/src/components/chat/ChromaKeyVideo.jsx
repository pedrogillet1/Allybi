import React, { useRef, useEffect } from "react";

/**
 * ChromaKeyVideo — plays a green-screen video on a canvas with the
 * chroma-key colour replaced by transparency.
 *
 * Uses two staggered video elements with a crossfade in the last 0.5 s
 * so the loop seam is invisible.
 *
 * Renders at devicePixelRatio resolution for crisp retina display.
 */
const FADE_DURATION = 0.5; // seconds of crossfade at loop boundary
const SX = 137, SY = 548, SW = 800, SH = 800; // source crop

const ChromaKeyVideo = ({ src, width = 35, height = 35, style }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const rw = Math.round(width * dpr);
    const rh = Math.round(height * dpr);

    // Two videos: A plays normally, B starts from 0 and fades in near A's end
    const makeVideo = () => {
      const v = document.createElement("video");
      v.src = src;
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.setAttribute("playsinline", "");
      return v;
    };

    const vidA = makeVideo();
    const vidB = makeVideo();
    vidA.loop = true;
    vidB.loop = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = rw;
    canvas.height = rh;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    // Off-screen canvas for blending the second video
    const offCanvas = document.createElement("canvas");
    offCanvas.width = rw;
    offCanvas.height = rh;
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });

    let videoDuration = 0;

    const chromaKey = (data) => {
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (g > 100 && g > r * 2 && g > b * 1.8) {
          d[i + 3] = 0;
        }
      }
    };

    const draw = () => {
      if (vidA.paused || vidA.ended) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const t = vidA.currentTime;
      const timeLeft = videoDuration - t;
      const needsFade = videoDuration > 0 && timeLeft < FADE_DURATION;

      // Draw main video (A)
      ctx.clearRect(0, 0, rw, rh);
      ctx.drawImage(vidA, SX, SY, SW, SH, 0, 0, rw, rh);
      const frameA = ctx.getImageData(0, 0, rw, rh);
      chromaKey(frameA);

      if (needsFade && !vidB.paused && vidB.readyState >= 2) {
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
  }, [src, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, ...style }}
    />
  );
};

export default ChromaKeyVideo;
