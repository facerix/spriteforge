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
  MARQUEE: "marquee",
};

const CSS = `
:host {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}

canvas.main {
  flex-shrink: 0;
  max-width: 100%;
  max-height: 100%;
  cursor: pointer;
  border: 1px solid var(--accent-color, #333);
  background-color: #fff;
  display: block;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}

canvas.main.tool-marquee {
  cursor: crosshair;
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
  /** @type {ResizeObserver | null} */
  #resizeObserver = null;
  /** @type {number} */
  #syncCanvasRaf = 0;
  #onVisualViewportResize = null;
  #onDpr = null;
  #onMouseUp = null;
  #onBlur = null;
  #onCanvasMouseMoveBound = null;
  #marchRaf = 0;
  /** @type {{ width: number; height: number; frameCount: number; frames: { delay?: number; pixels: (number|null)[] }[] } | null} */
  #sprite = null;
  /** @type {{ x: number; y: number; width: number; height: number } | null} */
  #selection = null;
  #isSelecting = false;
  /** @type {{ pixelX: number; pixelY: number } | null} */
  #selectionStart = null;
  #isMovingSelection = false;
  /** @type {{ pixelX: number; pixelY: number } | null} */
  #moveStart = null;
  #marchOffset = 0;

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
    if (this.#canvas) {
      this.#canvas.classList.toggle("tool-marquee", value === TOOLS.MARQUEE);
    }
    if (value !== TOOLS.MARQUEE) {
      this.#selection = null;
      this.#render();
    }
  }

  /** Sprite under edit; assign whenever upstream data changes (including in-place mutations). */
  get sprite() {
    return this.#sprite;
  }

  set sprite(value) {
    this.#sprite = value ?? null;
    if (this.isConnected && this.#shadowBuilt) {
      this.#syncCanvasToContainer();
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
   * @type {(frameIndex: number, frame: { delay?: number; pixels: (number|null)[] }) => void | undefined}
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

    this.#bindListeners();
    this.#scheduleSyncCanvasToContainer();
    this.#startMarchAnimation();
  }

  disconnectedCallback() {
    if (this.#syncCanvasRaf) {
      cancelAnimationFrame(this.#syncCanvasRaf);
      this.#syncCanvasRaf = 0;
    }
    if (this.#marchRaf) {
      cancelAnimationFrame(this.#marchRaf);
      this.#marchRaf = 0;
    }
    this.#unbindListeners();
  }

  #startMarchAnimation() {
    let lastTick = 0;
    const tick = (now) => {
      this.#marchRaf = requestAnimationFrame(tick);
      if (
        this.#tool === TOOLS.MARQUEE &&
        this.#selection &&
        this.#sprite &&
        this.#ctx &&
        now - lastTick > 80
      ) {
        lastTick = now;
        this.#marchOffset = (this.#marchOffset + 1) % 8;
        this.#render();
      }
    };
    this.#marchRaf = requestAnimationFrame(tick);
  }

  #bindListeners() {
    if (this.#listenersBound) return;
    this.#listenersBound = true;

    this.#resizeObserver = new ResizeObserver(() =>
      this.#scheduleSyncCanvasToContainer(),
    );
    this.#resizeObserver.observe(this);
    this.#onVisualViewportResize = () => this.#scheduleSyncCanvasToContainer();
    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        "resize",
        this.#onVisualViewportResize,
      );
    }
    this.#onDpr = () => this.#setupCanvasForHighDPI();
    window.addEventListener("devicePixelRatioChange", this.#onDpr);

    this.#canvas.addEventListener("mousedown", (event) =>
      this.#onCanvasMouseDown(event),
    );
    this.#onCanvasMouseMoveBound = (event) => this.#onCanvasMouseMove(event);
    this.#canvas.addEventListener("mousemove", this.#onCanvasMouseMoveBound);
    document.addEventListener("mousemove", this.#onCanvasMouseMoveBound);

    this.#onMouseUp = () => this.#endCanvasStroke();
    this.#onBlur = () => this.#endCanvasStroke();
    window.addEventListener("mouseup", this.#onMouseUp);
    window.addEventListener("blur", this.#onBlur);
  }

  #unbindListeners() {
    if (!this.#listenersBound) return;
    this.#listenersBound = false;

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    if (window.visualViewport && this.#onVisualViewportResize) {
      window.visualViewport.removeEventListener(
        "resize",
        this.#onVisualViewportResize,
      );
    }
    this.#onVisualViewportResize = null;
    window.removeEventListener("devicePixelRatioChange", this.#onDpr);
    window.removeEventListener("mouseup", this.#onMouseUp);
    window.removeEventListener("blur", this.#onBlur);
    this.#canvas.removeEventListener("mousemove", this.#onCanvasMouseMoveBound);
    document.removeEventListener("mousemove", this.#onCanvasMouseMoveBound);
    this.#onCanvasMouseMoveBound = null;
  }

  #setupCanvasForHighDPI() {
    if (!this.#canvas || !this.#ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Match backing store to the laid-out content box (not border box) so we
    // don’t re-apply getBoundingClientRect as inline size and fight borders.
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    if (w < 1 || h < 1) return;

    this.#canvas.width = w * dpr;
    this.#canvas.height = h * dpr;
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.#recalculateGrid();
    this.#render();
  }

  #scheduleSyncCanvasToContainer() {
    if (this.#syncCanvasRaf) return;
    this.#syncCanvasRaf = requestAnimationFrame(() => {
      this.#syncCanvasRaf = 0;
      this.#syncCanvasToContainer();
    });
  }

  /** Scale canvas to fit the host while preserving sprite aspect ratio (square pixels). */
  #syncCanvasToContainer() {
    if (!this.#canvas) return;
    const w = this.clientWidth;
    const h = this.clientHeight;
    const sprite = this.#sprite;
    if (w < 1 || h < 1) return;

    if (!sprite || sprite.width < 1 || sprite.height < 1) {
      const size = Math.min(w, h);
      if (size < 1) return;
      this.#canvas.style.width = `${size}px`;
      this.#canvas.style.height = `${size}px`;
      this.#setupCanvasForHighDPI();
      return;
    }

    const sw = sprite.width;
    const sh = sprite.height;
    const scale = Math.min(w / sw, h / sh);
    const displayW = sw * scale;
    const displayH = sh * scale;
    if (displayW < 1 || displayH < 1) return;

    this.#canvas.style.width = `${displayW}px`;
    this.#canvas.style.height = `${displayH}px`;
    this.#setupCanvasForHighDPI();
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
    const x = clientX - rect.left - this.#canvas.clientLeft;
    const y = clientY - rect.top - this.#canvas.clientTop;
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

  /** Like #clientToPixel but clamps to canvas bounds (for marquee drag outside). */
  #clientToPixelClamped(clientX, clientY) {
    const sprite = this.#sprite;
    if (!sprite || this.#cellWidth <= 0 || this.#cellHeight <= 0) {
      return null;
    }
    const rect = this.#canvas.getBoundingClientRect();
    const x = clientX - rect.left - this.#canvas.clientLeft;
    const y = clientY - rect.top - this.#canvas.clientTop;
    const pixelX = Math.max(
      0,
      Math.min(sprite.width - 1, Math.floor(x / this.#cellWidth)),
    );
    const pixelY = Math.max(
      0,
      Math.min(sprite.height - 1, Math.floor(y / this.#cellHeight)),
    );
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
    if (this.#tool === TOOLS.MARQUEE) {
      if (this.#isSelecting && this.#selectionStart) {
        this.#isSelecting = false;
        this.#selectionStart = null;
        this.#render();
      } else if (
        this.#isMovingSelection &&
        this.#moveStart &&
        this.#selection
      ) {
        this.#isMovingSelection = false;
        this.#moveStart = null;
        this.#render();
      }
    }
  }

  /** @param {number} x @param {number} y @returns {boolean} */
  #isPointInSelection(pixelX, pixelY) {
    const s = this.#selection;
    if (!s) return false;
    return (
      pixelX >= s.x &&
      pixelX < s.x + s.width &&
      pixelY >= s.y &&
      pixelY < s.y + s.height
    );
  }

  /**
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1
   * @param {number} y1
   */
  #normalizeSelection(x0, y0, x1, y1) {
    const sprite = this.#sprite;
    if (!sprite) return null;
    const x = Math.max(0, Math.min(x0, x1));
    const y = Math.max(0, Math.min(y0, y1));
    const w = Math.min(sprite.width - x, Math.abs(x1 - x0) + 1);
    const h = Math.min(sprite.height - y, Math.abs(y1 - y0) + 1);
    if (w <= 0 || h <= 0) return null;
    return { x, y, width: w, height: h };
  }

  #moveSelectionTo(destX, destY) {
    const sprite = this.#sprite;
    const sel = this.#selection;
    if (
      !sprite ||
      !sel ||
      typeof this.onSetFrame !== "function" ||
      sel.width <= 0 ||
      sel.height <= 0
    )
      return;

    const frame = sprite.frames?.[this.#frameIndex];
    if (!frame?.pixels) return;

    const w = sprite.width;
    const pixels = frame.pixels.slice();

    const srcPixels = [];
    for (let sy = sel.y; sy < sel.y + sel.height; sy++) {
      for (let sx = sel.x; sx < sel.x + sel.width; sx++) {
        const idx = sx + sy * w;
        srcPixels.push(pixels[idx]);
        pixels[idx] = null;
      }
    }

    let di = 0;
    for (let sy = 0; sy < sel.height; sy++) {
      const dy = destY + sy;
      for (let sx = 0; sx < sel.width; sx++) {
        const dx = destX + sx;
        if (
          dy >= 0 &&
          dy < sprite.height &&
          dx >= 0 &&
          dx < sprite.width &&
          di < srcPixels.length
        ) {
          pixels[dx + dy * w] = srcPixels[di];
        }
        di++;
      }
    }

    this.onSetFrame(this.#frameIndex, { ...frame, pixels });
    this.#selection = {
      x: destX,
      y: destY,
      width: sel.width,
      height: sel.height,
    };
  }

  #onCanvasMouseDown(event) {
    const sprite = this.#sprite;
    if (event.button !== 0 || !sprite) return;
    const coords = this.#clientToPixel(event.clientX, event.clientY);
    if (!coords) return;

    if (this.#tool === TOOLS.MARQUEE) {
      if (
        this.#selection &&
        this.#isPointInSelection(coords.pixelX, coords.pixelY)
      ) {
        this.#isMovingSelection = true;
        this.#moveStart = coords;
      } else {
        this.#selection = null;
        this.#isSelecting = true;
        this.#selectionStart = coords;
        this.#selection = this.#normalizeSelection(
          coords.pixelX,
          coords.pixelY,
          coords.pixelX,
          coords.pixelY,
        );
      }
      this.#render();
      return;
    }

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
    const coords = this.#clientToPixel(event.clientX, event.clientY);

    if (this.#tool === TOOLS.MARQUEE) {
      if ((event.buttons & 1) === 0) {
        this.#endCanvasStroke();
        return;
      }
      if (this.#isSelecting && this.#selectionStart) {
        const current =
          coords ?? this.#clientToPixelClamped(event.clientX, event.clientY);
        if (current) {
          const norm = this.#normalizeSelection(
            this.#selectionStart.pixelX,
            this.#selectionStart.pixelY,
            current.pixelX,
            current.pixelY,
          );
          if (norm) this.#selection = norm;
        }
        this.#render();
      } else if (
        this.#isMovingSelection &&
        this.#moveStart &&
        this.#selection &&
        coords
      ) {
        const dx = coords.pixelX - this.#moveStart.pixelX;
        const dy = coords.pixelY - this.#moveStart.pixelY;
        const newX = Math.max(
          0,
          Math.min(
            sprite.width - this.#selection.width,
            this.#selection.x + dx,
          ),
        );
        const newY = Math.max(
          0,
          Math.min(
            sprite.height - this.#selection.height,
            this.#selection.y + dy,
          ),
        );
        if (newX !== this.#selection.x || newY !== this.#selection.y) {
          this.#moveSelectionTo(newX, newY);
          this.#moveStart = coords;
        }
      }
      return;
    }

    if (this.#tool === TOOLS.FILL) return;
    if (!this.#isDrawing || !sprite) return;
    if ((event.buttons & 1) === 0) {
      this.#endCanvasStroke();
      return;
    }
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
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    this.#cellWidth = w / sprite.width;
    this.#cellHeight = h / sprite.height;
  }

  #render() {
    const sprite = this.#sprite;
    if (!sprite || !this.#ctx) return;
    const cw = this.#canvas.clientWidth;
    const ch = this.#canvas.clientHeight;
    this.#ctx.clearRect(0, 0, cw, ch);

    this.#ctx.strokeStyle = "#999999";
    this.#ctx.lineWidth = 1;
    for (let i = 0; i < sprite.width; i++) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(i * this.#cellWidth, 0);
      this.#ctx.lineTo(i * this.#cellWidth, ch);
      this.#ctx.stroke();
    }
    for (let j = 0; j < sprite.height; j++) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(0, j * this.#cellHeight);
      this.#ctx.lineTo(cw, j * this.#cellHeight);
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

    if (
      this.#tool === TOOLS.MARQUEE &&
      this.#selection &&
      this.#selection.width > 0 &&
      this.#selection.height > 0
    ) {
      const s = this.#selection;
      const x = s.x * this.#cellWidth;
      const y = s.y * this.#cellHeight;
      const w = s.width * this.#cellWidth;
      const h = s.height * this.#cellHeight;
      this.#ctx.setLineDash([4, 4]);
      this.#ctx.lineDashOffset = -this.#marchOffset;
      this.#ctx.strokeStyle = "#000";
      this.#ctx.lineWidth = 2;
      this.#ctx.strokeRect(x, y, w, h);
      this.#ctx.strokeStyle = "#fff";
      this.#ctx.lineWidth = 1;
      this.#ctx.strokeRect(x, y, w, h);
      this.#ctx.setLineDash([]);
    }
  }
}

customElements.define("sprite-editor", SpriteEditor);

export { TOOLS as SpriteEditorTools };
