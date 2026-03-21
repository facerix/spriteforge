/**
 * Sidebar animation preview: high-DPI canvas, static frame when paused, play at sprite FPS.
 */

import { h } from "/src/domUtils.js";
import { rgbToHex } from "/src/utils.js";

const CSS = `
:host {
  display: block;
  width: 100px;
  height: 100px;
}
canvas {
  width: 100%;
  height: 100%;
  border: 1px solid var(--accent-color, #333);
  background-color: #fff;
  display: block;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}
`;

class SpriteAnimationPreview extends HTMLElement {
  #shadowBuilt = false;
  #listenersBound = false;
  #canvas = null;
  #ctx = null;
  #playing = false;
  #animFrameIndex = 0;
  #intervalId = null;
  #frameIndex = 0;
  #onResize = null;
  #onOrientation = null;
  #onFullscreen = null;
  #onDpr = null;
  /** @type {{ width: number; height: number; fps?: number; frameCount: number; frames: { pixels: (number|null)[] }[] } | null} */
  #sprite = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
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
    this.#sprite = value ?? null;
    if (this.#playing && this.#sprite && this.#sprite.frameCount >= 1) {
      this.#animFrameIndex = Math.min(
        this.#animFrameIndex,
        this.#sprite.frameCount - 1,
      );
    }
    if (this.isConnected && this.#shadowBuilt) {
      this.#render();
    }
  }

  connectedCallback() {
    const shadow = this.shadowRoot;
    if (!this.#shadowBuilt) {
      shadow.appendChild(h("style", { textContent: CSS }, null));
      this.#canvas = h("canvas", {}, null);
      shadow.appendChild(this.#canvas);
      this.#ctx = this.#canvas.getContext("2d");
      this.#shadowBuilt = true;
    }

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
    this.#animFrameIndex = Math.min(this.#frameIndex, sprite.frameCount - 1);
    const fps = Math.max(1, sprite.fps || 12);
    const tick = () => {
      const s = this.#sprite;
      if (!s || !this.#playing) return;
      this.#animFrameIndex = (this.#animFrameIndex + 1) % s.frameCount;
      this.#render();
    };
    tick();
    this.#intervalId = window.setInterval(tick, 1000 / fps);
  }

  stopAnimation() {
    if (!this.#playing) return;
    this.#playing = false;
    if (this.#intervalId !== null) {
      window.clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
    this.#render();
  }

  #bindListeners() {
    if (this.#listenersBound) return;
    this.#listenersBound = true;

    this.#onResize = () => this.#setupCanvasForHighDPI();
    this.#onOrientation = () => this.#setupCanvasForHighDPI();
    this.#onFullscreen = () => this.#setupCanvasForHighDPI();
    this.#onDpr = () => this.#setupCanvasForHighDPI();
    window.addEventListener("resize", this.#onResize);
    window.addEventListener("orientationchange", this.#onOrientation);
    window.addEventListener("fullscreenchange", this.#onFullscreen);
    window.addEventListener("devicePixelRatioChange", this.#onDpr);
  }

  #unbindListeners() {
    if (!this.#listenersBound) return;
    this.#listenersBound = false;

    window.removeEventListener("resize", this.#onResize);
    window.removeEventListener("orientationchange", this.#onOrientation);
    window.removeEventListener("fullscreenchange", this.#onFullscreen);
    window.removeEventListener("devicePixelRatioChange", this.#onDpr);
  }

  #setupCanvasForHighDPI() {
    if (!this.#canvas || !this.#ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.#canvas.getBoundingClientRect();

    this.#canvas.width = rect.width * dpr;
    this.#canvas.height = rect.height * dpr;
    this.#canvas.style.width = rect.width + "px";
    this.#canvas.style.height = rect.height + "px";
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

    const previewRect = this.#canvas.getBoundingClientRect();
    this.#ctx.clearRect(0, 0, previewRect.width, previewRect.height);
    const previewPixelWidth = previewRect.width / sprite.width;
    const previewPixelHeight = previewRect.height / sprite.height;

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
