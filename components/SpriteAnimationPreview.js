/**
 * Sidebar animation preview: high-DPI canvas, static frame when paused, play using per-frame delay (ms).
 */

import { h } from "/src/domUtils.js";
import { frameDelayOrDefault } from "/src/frameTiming.js";
import { rgbToHex } from "/src/utils.js";

const CSS = `
:host {
  display: block;
  width: 100px;
}
.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.canvas-wrap {
  position: relative;
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
canvas {
  position: absolute;
  left: 0;
  top: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: 1px solid var(--accent-color, #333);
  background-color: #fff;
  display: block;
  /* Bitmap w/h from JS set intrinsic size; absolute + clip keeps layout stable. */
  max-width: 100%;
  max-height: 100%;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}
.controls {
  margin-bottom: 16px;
}
.controls button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 2px solid var(--accent-color);
  background-color: #fff;
  cursor: pointer;
}
.controls button img {
  width: 90%;
  height: 90%;
  vertical-align: middle;
}
`;

class SpriteAnimationPreview extends HTMLElement {
  #shadowBuilt = false;
  #listenersBound = false;
  #canvas = null;
  #ctx = null;
  #playing = false;
  #animFrameIndex = 0;
  /** @type {number | null} */
  #rafId = null;
  #lastRafTime = 0;
  #animAccumMs = 0;
  #frameIndex = 0;
  #onResize = null;
  #onOrientation = null;
  #onFullscreen = null;
  #onDpr = null;
  #onVisibilityChange = null;
  /** True when playback was stopped because the tab became hidden; used to resume on focus. */
  #pausedBecauseHidden = false;
  /** @type {HTMLButtonElement | null} */
  #playPauseButton = null;
  /** @type {HTMLImageElement | null} */
  #playPauseImg = null;
  /** @type {HTMLDivElement | null} */
  #canvasWrap = null;
  /** Max preview box side (px); sprite is letterboxed inside. */
  static #PREVIEW_MAX = 100;
  /** @type {{ width: number; height: number; frameCount: number; frames: { delay?: number; pixels: (number|null)[] }[] } | null} */
  #sprite = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  get playing() {
    return this.#playing;
  }

  get frameIndex() {
    return this.#frameIndex;
  }

  set frameIndex(value) {
    const n = Number(value);
    if (Number.isNaN(n) || this.#frameIndex === n) return;
    this.#frameIndex = n;
    if (!this.#playing) {
      this.#render();
    }
  }

  get sprite() {
    return this.#sprite;
  }

  set sprite(value) {
    const wasPlaying = this.#playing;
    if (wasPlaying) {
      this.stopAnimation();
    }
    this.#sprite = value ?? null;
    if (this.#sprite && this.#sprite.frameCount >= 1) {
      this.#animFrameIndex = Math.min(
        this.#animFrameIndex,
        this.#sprite.frameCount - 1,
      );
    }
    if (this.isConnected && this.#shadowBuilt) {
      this.#updatePreviewBoxSize();
      this.#setupCanvasForHighDPI();
    }
    if (wasPlaying && this.#sprite && this.#sprite.frameCount >= 1) {
      this.startAnimation();
    }
  }

  connectedCallback() {
    const shadow = this.shadowRoot;
    if (!this.#shadowBuilt) {
      shadow.appendChild(h("style", { textContent: CSS }, null));
      const wrap = h("div", { className: "wrap" }, null);
      this.#canvasWrap = h("div", { className: "canvas-wrap" }, null);
      this.#canvas = h("canvas", {}, null);
      this.#canvasWrap.appendChild(this.#canvas);
      wrap.appendChild(this.#canvasWrap);
      this.#playPauseImg = h("img", { src: "/images/play.svg", alt: "" }, null);
      this.#playPauseButton = h(
        "button",
        { type: "button", className: "play-pause" },
        [this.#playPauseImg],
      );
      this.#playPauseButton.addEventListener("click", () => {
        if (this.#playing) {
          this.stopAnimation();
        } else {
          this.startAnimation();
        }
      });
      const controls = h("div", { className: "controls" }, [
        this.#playPauseButton,
      ]);
      wrap.appendChild(controls);
      shadow.appendChild(wrap);
      this.#ctx = this.#canvas.getContext("2d");
      this.#shadowBuilt = true;
      this.#syncPlayPauseButton();
    }

    this.#updatePreviewBoxSize();
    this.#setupCanvasForHighDPI();
    this.#bindListeners();
    if (this.#sprite) {
      this.#render();
    }
  }

  disconnectedCallback() {
    this.stopAnimation();
    this.#unbindListeners();
  }

  startAnimation() {
    if (this.#playing) return;
    const sprite = this.#sprite;
    if (!sprite || sprite.frameCount < 1) return;
    this.#playing = true;
    const startIdx = Math.min(this.#frameIndex, sprite.frameCount - 1);
    this.#animFrameIndex = (startIdx + 1) % sprite.frameCount;
    this.#render();
    this.#lastRafTime = performance.now();
    this.#animAccumMs = 0;
    this.#rafId = requestAnimationFrame((t) => this.#rafLoop(t));
    this.#syncPlayPauseButton();
  }

  /**
   * @param {{ visibilityDriven?: boolean }} [options] — internal: set when pausing because the tab is hidden.
   */
  stopAnimation(options = {}) {
    if (!this.#playing) return;
    this.#playing = false;
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    if (!options.visibilityDriven) {
      this.#pausedBecauseHidden = false;
    }
    this.#render();
    this.#syncPlayPauseButton();
  }

  /**
   * @param {DOMHighResTimeStamp} now
   */
  #rafLoop(now) {
    this.#rafId = null;
    if (!this.#playing) return;
    const sprite = this.#sprite;
    if (!sprite || sprite.frameCount < 1) {
      this.stopAnimation();
      return;
    }
    let frameDurationMs = frameDelayOrDefault(
      sprite.frames[this.#animFrameIndex],
    );
    const delta = Math.min(
      now - this.#lastRafTime,
      Math.max(frameDurationMs, 16) * 10,
    );
    this.#lastRafTime = now;
    this.#animAccumMs += delta;
    while (this.#animAccumMs >= frameDurationMs) {
      this.#animAccumMs -= frameDurationMs;
      this.#animFrameIndex = (this.#animFrameIndex + 1) % sprite.frameCount;
      frameDurationMs = frameDelayOrDefault(
        sprite.frames[this.#animFrameIndex],
      );
    }
    this.#render();
    if (this.#playing) {
      this.#rafId = requestAnimationFrame((t) => this.#rafLoop(t));
    }
  }

  #syncPlayPauseButton() {
    if (!this.#playPauseButton || !this.#playPauseImg) return;
    const playing = this.#playing;
    this.#playPauseButton.setAttribute(
      "aria-pressed",
      playing ? "true" : "false",
    );
    this.#playPauseButton.setAttribute(
      "aria-label",
      playing ? "Pause preview" : "Play preview",
    );
    this.#playPauseImg.src = playing ? "/images/pause.svg" : "/images/play.svg";
  }

  #bindListeners() {
    if (this.#listenersBound) return;
    this.#listenersBound = true;

    this.#onResize = () => this.#setupCanvasForHighDPI();
    this.#onOrientation = () => this.#setupCanvasForHighDPI();
    this.#onFullscreen = () => this.#setupCanvasForHighDPI();
    this.#onDpr = () => this.#setupCanvasForHighDPI();
    this.#onVisibilityChange = () => {
      if (document.hidden) {
        if (this.#playing) {
          this.#pausedBecauseHidden = true;
          this.stopAnimation({ visibilityDriven: true });
        }
      } else if (this.#pausedBecauseHidden) {
        this.#pausedBecauseHidden = false;
        this.startAnimation();
      }
    };
    window.addEventListener("resize", this.#onResize);
    window.addEventListener("orientationchange", this.#onOrientation);
    window.addEventListener("fullscreenchange", this.#onFullscreen);
    window.addEventListener("devicePixelRatioChange", this.#onDpr);
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
  }

  #updatePreviewBoxSize() {
    const wrap = this.#canvasWrap;
    if (!wrap) return;
    const max = SpriteAnimationPreview.#PREVIEW_MAX;
    const sprite = this.#sprite;
    if (!sprite || sprite.width < 1 || sprite.height < 1) {
      wrap.style.width = `${max}px`;
      wrap.style.height = `${max}px`;
      return;
    }
    const sw = sprite.width;
    const sh = sprite.height;
    const ar = sw / sh;
    let bw;
    let bh;
    if (ar >= 1) {
      bw = max;
      bh = max / ar;
    } else {
      bh = max;
      bw = max * ar;
    }
    wrap.style.width = `${bw}px`;
    wrap.style.height = `${bh}px`;
  }

  #unbindListeners() {
    if (!this.#listenersBound) return;
    this.#listenersBound = false;

    window.removeEventListener("resize", this.#onResize);
    window.removeEventListener("orientationchange", this.#onOrientation);
    window.removeEventListener("fullscreenchange", this.#onFullscreen);
    window.removeEventListener("devicePixelRatioChange", this.#onDpr);
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
  }

  #setupCanvasForHighDPI() {
    if (!this.#canvas || !this.#ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Use client dimensions, not getBoundingClientRect + style — border-box vs
    // content-box feedback would otherwise grow the canvas on every resize.
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    if (w < 1 || h < 1) return;

    this.#canvas.width = w * dpr;
    this.#canvas.height = h * dpr;
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.#render();
  }

  #render() {
    const sprite = this.#sprite;
    if (!sprite || !this.#ctx || !this.#canvas) return;

    const previewFrameIndex = this.#playing
      ? this.#animFrameIndex
      : this.#frameIndex;
    const previewFrame = sprite.frames[previewFrameIndex];
    if (!previewFrame) return;

    const cw = this.#canvas.clientWidth;
    const ch = this.#canvas.clientHeight;
    this.#ctx.clearRect(0, 0, cw, ch);
    const previewPixelWidth = cw / sprite.width;
    const previewPixelHeight = ch / sprite.height;

    for (let i = 0; i < previewFrame.pixels.length; i++) {
      const pixel = previewFrame.pixels[i];
      if (pixel === null) continue;
      const pixelX = i % sprite.width;
      const pixelY = Math.floor(i / sprite.width);
      this.#ctx.fillStyle = rgbToHex(pixel);
      this.#ctx.fillRect(
        pixelX * previewPixelWidth,
        pixelY * previewPixelHeight,
        previewPixelWidth,
        previewPixelHeight,
      );
    }
  }
}

customElements.define("sprite-animation-preview", SpriteAnimationPreview);
