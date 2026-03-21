/**
 * Main pixel editor: grid canvas, drawing tools, viewport sizing.
 *
 * Data flow: parent sets `sprite`, `onSetPixel`, and `onSetFrame` (see getters/setters below).
 */

import { h } from "/src/domUtils.js";
import { hexToRgb, rgbToHex } from "/src/utils.js";

const TOOLS = {
  PENCIL: "pencil",
  ERASER: "eraser",
  FILL: "fill",
};

const CSS = `
:host {
  display: block;
  flex: 1;
}

canvas.main {
  width: 60vw;
  height: 60vw;
  cursor: pointer;
  border: 1px solid var(--accent-color, #333);
  background-color: #fff;
  display: block;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}
`;

class SpriteEditor extends HTMLElement {
  #shadowBuilt = false;
  #listenersBound = false;
  #canvas = null;
  #ctx = null;
  #cellWidth = 0;
  #cellHeight = 0;
  #isDrawing = false;
  #lastPixel = null;
  #frameIndex = 0;
  #color = "#000000";
  #tool = TOOLS.PENCIL;
  #onResize = null;
  #onOrientation = null;
  #onFullscreen = null;
  #onDpr = null;
  #onMouseUp = null;
  #onBlur = null;
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
    this.#render();
  }

  get color() {
    return this.#color;
  }

  set color(value) {
    if (this.#color === value) return;
    this.#color = value;
  }

  get tool() {
    return this.#tool;
  }

  set tool(value) {
    if (this.#tool === value) return;
    this.#tool = value;
  }

  /** Sprite under edit; assign whenever upstream data changes (including in-place mutations). */
  get sprite() {
    return this.#sprite;
  }

  set sprite(value) {
    this.#sprite = value ?? null;
    if (this.isConnected && this.#shadowBuilt) {
      this.#recalculateGrid();
      this.#render();
    }
  }

  /**
   * Called when a single pixel should change. Signature matches DataStore.setPixel.
   * @type {(frameIndex: number, pixelIndex: number, pixel: number | null) => void | undefined}
   */
  onSetPixel;

  /**
   * Called when a full frame should be replaced (e.g. flood fill). Signature matches DataStore.setFrame.
   * @type {(frameIndex: number, frame: { width: number; height: number; pixels: (number|null)[] }) => void | undefined}
   */
  onSetFrame;

  connectedCallback() {
    const shadow = this.shadowRoot;
    if (!this.#shadowBuilt) {
      shadow.appendChild(h("style", { textContent: CSS }, null));
      this.#canvas = h("canvas", { className: "main" }, null);
      shadow.appendChild(this.#canvas);
      this.#ctx = this.#canvas.getContext("2d");
      this.#shadowBuilt = true;
    }

    this.#setupCanvasForHighDPI();
    this.#bindListeners();

    if (this.#sprite) {
      this.#recalculateGrid();
      this.#render();
    }
  }

  disconnectedCallback() {
    this.#unbindListeners();
  }

  #bindListeners() {
    if (this.#listenersBound) return;
    this.#listenersBound = true;

    this.#onResize = () => this.#handleViewportChange();
    this.#onOrientation = () => this.#handleViewportChange();
    this.#onFullscreen = () => this.#handleViewportChange();
    this.#onDpr = () => this.#setupCanvasForHighDPI();
    window.addEventListener("resize", this.#onResize);
    window.addEventListener("orientationchange", this.#onOrientation);
    window.addEventListener("fullscreenchange", this.#onFullscreen);
    window.addEventListener("devicePixelRatioChange", this.#onDpr);

    this.#canvas.addEventListener("mousedown", (event) =>
      this.#onCanvasMouseDown(event),
    );
    this.#canvas.addEventListener("mousemove", (event) =>
      this.#onCanvasMouseMove(event),
    );

    this.#onMouseUp = () => this.#endCanvasStroke();
    this.#onBlur = () => this.#endCanvasStroke();
    window.addEventListener("mouseup", this.#onMouseUp);
    window.addEventListener("blur", this.#onBlur);
  }

  #unbindListeners() {
    if (!this.#listenersBound) return;
    this.#listenersBound = false;

    window.removeEventListener("resize", this.#onResize);
    window.removeEventListener("orientationchange", this.#onOrientation);
    window.removeEventListener("fullscreenchange", this.#onFullscreen);
    window.removeEventListener("devicePixelRatioChange", this.#onDpr);
    window.removeEventListener("mouseup", this.#onMouseUp);
    window.removeEventListener("blur", this.#onBlur);
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

    this.#recalculateGrid();
    this.#render();
  }

  #linePixels(x0, y0, x1, y1) {
    const cells = [];
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      cells.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return cells;
  }

  #clientToPixel(clientX, clientY) {
    const sprite = this.#sprite;
    if (!sprite || this.#cellWidth <= 0 || this.#cellHeight <= 0) {
      return null;
    }
    const rect = this.#canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pixelX = Math.floor(x / this.#cellWidth);
    const pixelY = Math.floor(y / this.#cellHeight);
    if (
      pixelX < 0 ||
      pixelY < 0 ||
      pixelX >= sprite.width ||
      pixelY >= sprite.height
    ) {
      return null;
    }
    return { pixelX, pixelY };
  }

  #drawPixel(pixelX, pixelY) {
    const sprite = this.#sprite;
    if (!sprite || typeof this.onSetPixel !== "function") return;
    const pixelIndex = pixelX + pixelY * sprite.width;
    this.onSetPixel(this.#frameIndex, pixelIndex, hexToRgb(this.#color));
  }

  #erasePixel(pixelX, pixelY) {
    const sprite = this.#sprite;
    if (!sprite || typeof this.onSetPixel !== "function") return;
    const pixelIndex = pixelX + pixelY * sprite.width;
    this.onSetPixel(this.#frameIndex, pixelIndex, null);
  }

  #floodFill(pixelX, pixelY) {
    const sprite = this.#sprite;
    if (!sprite || typeof this.onSetFrame !== "function") return;
    const frame = sprite.frames?.[this.#frameIndex];
    if (!frame?.pixels) return;

    const w = sprite.width;
    const startIndex = pixelX + pixelY * w;
    const targetColor = frame.pixels[startIndex];
    const replacementColor = hexToRgb(this.#color);
    if (targetColor === replacementColor) return;

    const pixels = frame.pixels.slice();
    const idx = (x, y) => x + y * w;
    const stack = [[pixelX, pixelY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const i = idx(x, y);
      if (pixels[i] !== targetColor) continue;
      pixels[i] = replacementColor;
      if (x > 0) stack.push([x - 1, y]);
      if (x < w - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < sprite.height - 1) stack.push([x, y + 1]);
    }

    this.onSetFrame(this.#frameIndex, { ...frame, pixels });
  }

  #applyToolAt(pixelX, pixelY) {
    switch (this.#tool) {
      case TOOLS.PENCIL:
        this.#drawPixel(pixelX, pixelY);
        break;
      case TOOLS.ERASER:
        this.#erasePixel(pixelX, pixelY);
        break;
      default:
        break;
    }
  }

  #endCanvasStroke() {
    this.#isDrawing = false;
    this.#lastPixel = null;
  }

  #onCanvasMouseDown(event) {
    const sprite = this.#sprite;
    if (event.button !== 0 || !sprite) return;
    const coords = this.#clientToPixel(event.clientX, event.clientY);
    if (!coords) return;
    if (this.#tool === TOOLS.FILL) {
      this.#floodFill(coords.pixelX, coords.pixelY);
      return;
    }
    this.#isDrawing = true;
    this.#lastPixel = coords;
    this.#applyToolAt(coords.pixelX, coords.pixelY);
  }

  #onCanvasMouseMove(event) {
    const sprite = this.#sprite;
    if (this.#tool === TOOLS.FILL) return;
    if (!this.#isDrawing || !sprite) return;
    if ((event.buttons & 1) === 0) {
      this.#endCanvasStroke();
      return;
    }
    const coords = this.#clientToPixel(event.clientX, event.clientY);
    if (!coords) {
      this.#lastPixel = null;
      return;
    }
    if (this.#lastPixel) {
      for (const [px, py] of this.#linePixels(
        this.#lastPixel.pixelX,
        this.#lastPixel.pixelY,
        coords.pixelX,
        coords.pixelY,
      )) {
        this.#applyToolAt(px, py);
      }
    } else {
      this.#applyToolAt(coords.pixelX, coords.pixelY);
    }
    this.#lastPixel = coords;
  }

  #recalculateGrid() {
    const sprite = this.#sprite;
    if (!this.#canvas || !sprite) return;
    const rect = this.#canvas.getBoundingClientRect();
    this.#cellWidth = rect.width / sprite.width;
    this.#cellHeight = rect.height / sprite.height;
  }

  #handleViewportChange() {
    if (!this.#canvas) return;
    const width = (window.innerWidth / 100) * 60;
    const height = (window.innerHeight / 100) * 60;
    const targetSize = Math.min(width, height);
    this.#canvas.style.width = targetSize + "px";
    this.#canvas.style.height = targetSize + "px";
    this.#setupCanvasForHighDPI();
  }

  #render() {
    const sprite = this.#sprite;
    if (!sprite || !this.#ctx) return;
    const rect = this.#canvas.getBoundingClientRect();
    this.#ctx.clearRect(0, 0, rect.width, rect.height);

    this.#ctx.strokeStyle = "#999999";
    this.#ctx.lineWidth = 1;
    for (let i = 0; i < sprite.width; i++) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(i * this.#cellWidth, 0);
      this.#ctx.lineTo(i * this.#cellWidth, rect.height);
      this.#ctx.stroke();
    }
    for (let j = 0; j < sprite.height; j++) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(0, j * this.#cellHeight);
      this.#ctx.lineTo(rect.width, j * this.#cellHeight);
      this.#ctx.stroke();
    }

    const editFrame = sprite.frames[this.#frameIndex];
    if (!editFrame) return;

    for (let i = 0; i < editFrame.pixels.length; i++) {
      const pixel = editFrame.pixels[i];
      if (pixel === null) continue;
      const pixelX = i % sprite.width;
      const pixelY = Math.floor(i / sprite.width);
      this.#ctx.fillStyle = rgbToHex(pixel);
      this.#ctx.fillRect(
        pixelX * this.#cellWidth,
        pixelY * this.#cellHeight,
        this.#cellWidth,
        this.#cellHeight,
      );
    }
  }
}

customElements.define("sprite-editor", SpriteEditor);

export { TOOLS as SpriteEditorTools };
