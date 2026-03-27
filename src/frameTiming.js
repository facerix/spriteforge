/**
 * Per-frame animation timing (milliseconds). GIF/APNG export normalization.
 */

/** ~12 FPS default when no per-frame delay is set. */
export const DEFAULT_FRAME_DELAY_MS = Math.round(1000 / 12);

const MIN_STORED_MS = 1;
const MAX_STORED_MS = 3_600_000;

/**
 * @param {unknown} ms
 * @returns {number}
 */
export function clampStoredFrameDelayMs(ms) {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n)) {
    return DEFAULT_FRAME_DELAY_MS;
  }
  return Math.min(MAX_STORED_MS, Math.max(MIN_STORED_MS, n));
}

/**
 * Ensures every frame has `delay` and removes deprecated sprite-level `fps`.
 * @param {{ fps?: number; frames: { delay?: number }[] } | null | undefined} sprite
 */
export function migrateSpriteTiming(sprite) {
  if (!sprite || !Array.isArray(sprite.frames)) {
    return sprite;
  }
  const legacyFps =
    typeof sprite.fps === "number" &&
    Number.isFinite(sprite.fps) &&
    sprite.fps > 0
      ? Math.min(120, Math.max(1, Math.round(sprite.fps)))
      : null;
  const fallbackFromFps =
    legacyFps != null ? Math.round(1000 / legacyFps) : DEFAULT_FRAME_DELAY_MS;

  for (const frame of sprite.frames) {
    let d = frame.delay;
    if (typeof d !== "number" || !Number.isFinite(d)) {
      d = fallbackFromFps;
    }
    frame.delay = clampStoredFrameDelayMs(d);
  }
  delete sprite.fps;
  return sprite;
}

/**
 * GIF stores delay in centiseconds; gifenc accepts ms and uses round(ms / 10).
 * Quantize to a positive multiple of 10 ms so file timing matches intent.
 * @param {number} delayMs
 * @returns {number}
 */
export function exportDelayMsForGif(delayMs) {
  const base = clampStoredFrameDelayMs(delayMs);
  const centiseconds = Math.max(1, Math.round(base / 10));
  return centiseconds * 10;
}

/**
 * UPNG APNG fcTL uses delay numerator as ushort with denominator 1000 (ms).
 * @param {number} delayMs
 * @returns {number}
 */
export function exportDelayMsForApng(delayMs) {
  return Math.min(65535, clampStoredFrameDelayMs(delayMs));
}

/**
 * @param {{ delay?: number } | null | undefined} frame
 * @returns {number}
 */
export function frameDelayOrDefault(frame) {
  return clampStoredFrameDelayMs(frame?.delay ?? DEFAULT_FRAME_DELAY_MS);
}
