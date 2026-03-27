/**
 * ExportModal Web Component
 * Export sprite as sprite-sheet with format selection (GIF, PNG, APNG).
 *
 * Usage:
 *   const modal = document.querySelector('export-modal');
 *   modal.addEventListener('export', (evt) => { evt.detail.blob, evt.detail.filename });
 *   modal.addEventListener('cancel', () => { ... });
 *   modal.showModal(sprite);
 */

import { h, CreateSvg } from "/src/domUtils.js";
import {
  exportDelayMsForApng,
  exportDelayMsForGif,
  frameDelayOrDefault,
} from "/src/frameTiming.js";
import { rgbToHex } from "/src/utils.js";

const closeIconSvg = CreateSvg(
  '<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  "24",
  "24",
);

const FORMATS = [
  // SFF support - coming later
  // {
  //   id: "sff",
  //   label: "SFF",
  //   ext: ".sff",
  //   mime: "application/json",
  // },
  { id: "png", label: "PNG", ext: ".png", mime: "image/png" },
  { id: "gif", label: "GIF", ext: ".gif", mime: "image/gif" },
  {
    id: "apng",
    label: "APNG",
    ext: ".png",
    mime: "image/png",
  },
];

const CSS = `
:host {
  --export-primary: #4a4a4a;
  --export-border: rgba(0, 0, 0, 0.12);
  --export-focus: rgba(74, 74, 74, 0.4);
  --export-bg: #ffffff;
  --export-header-bg: #f5f5f5;

  dialog[open] {
    display: flex;
    flex-direction: column;
    min-width: 320px;
    max-width: 520px;
    width: 90vw;
    padding: 0;
    border: 1px solid var(--export-border);
    border-radius: 8px;
    background-color: var(--export-bg);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  ::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
  }

  header {
    padding: 1em 1.5em;
    background-color: var(--export-header-bg);
    border-bottom: 1px solid var(--export-border);
    display: flex;
    justify-content: space-between;
    align-items: center;

    h3 {
      margin: 0;
      font-size: 1.25em;
      color: var(--export-primary);
      font-weight: 500;
    }

    #close-modal {
      background: none;
      border: none;
      padding: 0;
      width: 1.5em;
      height: 1.5em;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--export-primary);
    }

    #close-modal:hover {
      opacity: 0.7;
    }

    #close-modal:focus {
      outline: none;
    }

    #close-modal:focus-visible {
      outline: 2px solid var(--export-focus);
      outline-offset: 2px;
    }
  }

  form {
    flex: 1;
    padding: 1.5em;
    display: flex;
    flex-direction: column;
    gap: 1.25em;

    .preview-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;

      label {
        font-size: 0.9em;
        color: var(--export-primary);
      }

      .preview-wrap {
        border: 1px solid var(--export-border);
        background: #fff;
        max-width: 100%;
        overflow: auto;
        max-height: 180px;

        canvas {
          display: block;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      }
    }

    .format-row,
    .filename-row {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label {
        font-size: 0.9em;
        color: var(--export-primary);
      }

      select,
      input {
        padding: 0.5em 0.75em;
        border: 2px solid var(--export-border);
        border-radius: 6px;
        font-size: 0.95em;
        font-family: inherit;
      }

      select:focus,
      input:focus {
        outline: none;
        border-color: var(--export-focus);
      }

      select option:disabled {
        color: #999;
      }
    }

    .actions {
      display: flex;
      gap: 0.75em;
      justify-content: flex-end;
      margin-top: 0.25em;

      button {
        padding: 0.5em 1.25em;
        border: 1px solid var(--export-border);
        border-radius: 6px;
        font-size: 0.95em;
        font-family: inherit;
        cursor: pointer;
        font-weight: 500;
      }

      button:focus {
        outline: none;
      }

      button:focus-visible {
        outline: 2px solid var(--export-focus);
        outline-offset: 2px;
      }

      #btnCancel {
        background-color: transparent;
        color: var(--export-primary);
      }

      #btnCancel:hover {
        background-color: rgba(0, 0, 0, 0.05);
        border-color: var(--export-primary);
      }

      #btnExport {
        background-color: var(--export-primary);
        color: white;
        border: none;
      }

      #btnExport:hover:not(:disabled) {
        opacity: 0.9;
      }

      #btnExport:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  dialog,
  ::backdrop {
    transition: opacity 0.25s allow-discrete;
    opacity: 0;
  }

  dialog[open],
  dialog[open]::backdrop {
    opacity: 1;
  }

  @starting-style {
    dialog[open],
    dialog[open]::backdrop {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    @starting-style {
      dialog[open] {
        transform: translateY(-12px);
      }

      dialog[open],
      dialog[open]::backdrop {
        opacity: 0;
      }
    }

    dialog[open] {
      animation: exportSlideIn 0.25s ease;
    }
  }

  @keyframes exportSlideIn {
    from {
      transform: translateY(-12px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
}
`;

/**
 * Render a single frame's pixels to a 2D context at the given offset.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ pixels: (number|null)[] }} frame
 * @param {number} frameWidth - sprite width in pixels (row stride for frame.pixels)
 * @param {number} offsetX
 * @param {number} scale - pixel scale (1 = 1:1)
 */
function drawFrameToContext(ctx, frame, frameWidth, offsetX, scale = 1) {
  const w = frameWidth;
  for (let i = 0; i < frame.pixels.length; i++) {
    const pixel = frame.pixels[i];
    if (pixel === null) continue;
    const x = (i % w) * scale + offsetX;
    const y = Math.floor(i / w) * scale;
    ctx.fillStyle = rgbToHex(pixel);
    ctx.fillRect(x, y, scale, scale);
  }
}

/**
 * Build sprite-sheet dimensions: all frames in a horizontal row.
 * @param {{ width: number; height: number; frames: { pixels: (number|null)[] }[] }} sprite
 * @param {number} scale
 * @param {number} gap
 * @returns {{ sheetWidth: number; sheetHeight: number; frameWidth: number; frameHeight: number }}
 */
function spriteSheetLayout(sprite, scale = 1, gap = 1) {
  const fw = sprite.width * scale;
  const fh = sprite.height * scale;
  const n = sprite.frames.length;
  const sheetWidth = n * fw + (n - 1) * gap;
  const sheetHeight = fh;
  return { sheetWidth, sheetHeight, frameWidth: fw, frameHeight: fh, gap };
}

/**
 * Create sprite-sheet canvas (1:1 pixel scale for export quality).
 * @param {*} sprite
 * @param {number} scale
 * @returns {HTMLCanvasElement}
 */
function createSpriteSheetCanvas(sprite, scale = 1) {
  const gap = scale;
  const {
    sheetWidth,
    sheetHeight,
    frameWidth,
    gap: layoutGap,
  } = spriteSheetLayout(sprite, scale, gap);
  const canvas = document.createElement("canvas");
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sheetWidth, sheetHeight);

  let x = 0;
  for (const frame of sprite.frames) {
    drawFrameToContext(ctx, frame, sprite.width, x, scale);
    x += frameWidth + layoutGap;
  }
  return canvas;
}

/**
 * Convert sprite frames to RGBA Uint8Array for gifenc.
 * @param {{ width: number; height: number; frames: { pixels: (number|null)[] }[] }} sprite
 * @returns {Uint8Array[]} One RGBA array per frame
 */
function spriteToRgbaFrames(sprite) {
  const w = sprite.width;
  const h = sprite.height;
  const stride = w * h * 4;
  return sprite.frames.map((frame) => {
    const buf = new Uint8Array(stride);
    for (let i = 0; i < frame.pixels.length; i++) {
      const p = frame.pixels[i];
      const j = i * 4;
      if (p === null) {
        buf[j] = 0;
        buf[j + 1] = 0;
        buf[j + 2] = 0;
        buf[j + 3] = 0;
      } else {
        buf[j] = (p >> 16) & 255;
        buf[j + 1] = (p >> 8) & 255;
        buf[j + 2] = p & 255;
        buf[j + 3] = 255;
      }
    }
    return buf;
  });
}

class ExportModal extends HTMLElement {
  #ready = false;
  #sprite = null;
  #modal = null;
  #previewCanvas = null;
  #formatSelect = null;
  #filenameInput = null;
  #btnExport = null;

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });
    const styles = document.createElement("style");
    styles.innerHTML = CSS;
    shadow.appendChild(styles);

    const closeIcon = closeIconSvg.cloneNode(true);
    this.#formatSelect = h("select", { id: "format-select" }, null);
    for (const f of FORMATS) {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.label;
      this.#formatSelect.appendChild(opt);
    }

    this.#filenameInput = h("input", {
      type: "text",
      id: "filename-input",
      placeholder: "sprite",
      autocomplete: "off",
    });

    this.#btnExport = h("button", {
      type: "button",
      id: "btnExport",
      innerText: "Export",
    });

    this.#modal = h("dialog", { closedby: "any" }, [
      h("header", {}, [
        h("h3", { innerText: "Export Sprite" }),
        h("button", { id: "close-modal" }, [closeIcon]),
      ]),
      h("form", { method: "dialog", autocomplete: "off" }, [
        h("div", { className: "preview-section" }, [
          h("label", { innerText: "Sprite Sheet Preview" }),
          h("div", { className: "preview-wrap" }, [
            (this.#previewCanvas = h("canvas", {}, null)),
          ]),
        ]),
        h("div", { className: "format-row" }, [
          h("label", { htmlFor: "format-select", innerText: "Format" }),
          this.#formatSelect,
        ]),
        h("div", { className: "filename-row" }, [
          h("label", { htmlFor: "filename-input", innerText: "Filename" }),
          this.#filenameInput,
        ]),
        h("div", { className: "actions" }, [
          h("button", { type: "button", id: "btnCancel", innerText: "Cancel" }),
          this.#btnExport,
        ]),
      ]),
    ]);
    shadow.appendChild(this.#modal);
    this.#init();
  }

  #init() {
    if (this.#ready) return;
    const closeHandler = () => this.#onClose();
    this.shadowRoot
      .querySelector("#close-modal")
      .addEventListener("click", closeHandler);
    this.shadowRoot
      .querySelector("#btnCancel")
      .addEventListener("click", closeHandler);

    this.#formatSelect.addEventListener("change", () => this.#onFormatChange());
    this.#btnExport.addEventListener("click", () => this.#onExport());

    this.#modal.addEventListener("cancel", () => this.#onClose());
    this.#ready = true;
  }

  #onClose() {
    this.dispatchEvent(new CustomEvent("cancel", { bubbles: true }));
    this.#modal?.close();
  }

  #onFormatChange() {
    this.#updateFilenameExtension();
  }

  #updateFilenameExtension() {
    const fmt = FORMATS.find((f) => f.id === this.#formatSelect.value);
    if (!fmt) return;
    const input = this.#filenameInput;
    let base = input.value.trim() || "sprite";
    const ext = fmt.ext;
    if (base.endsWith(ext)) {
      return;
    }
    const dot = base.lastIndexOf(".");
    if (dot >= 0) {
      base = base.slice(0, dot);
    }
    input.value = base + ext;
  }

  #renderPreview() {
    const sprite = this.#sprite;
    if (!sprite?.frames?.length || !this.#previewCanvas) return;

    const maxPreviewPx = 280;
    const scale = Math.max(
      1,
      Math.min(
        Math.floor(maxPreviewPx / (sprite.width * sprite.frames.length)),
        Math.floor(maxPreviewPx / sprite.height),
      ),
    );
    const canvas = createSpriteSheetCanvas(sprite, scale);
    this.#previewCanvas.width = canvas.width;
    this.#previewCanvas.height = canvas.height;
    const ctx = this.#previewCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
  }

  async #onExport() {
    const sprite = this.#sprite;
    const formatId = this.#formatSelect.value;
    const fmt = FORMATS.find((f) => f.id === formatId);
    if (!sprite || !fmt) return;

    let base = this.#filenameInput.value.trim() || "sprite";
    if (!base.endsWith(fmt.ext)) {
      const dot = base.lastIndexOf(".");
      base = dot >= 0 ? base.slice(0, dot) + fmt.ext : base + fmt.ext;
    }

    let blob;
    const filename = base;

    try {
      // SFF support - coming later
      // if (formatId === "sff") {
      //   const json = this.#serializeSprite(sprite);
      //   blob = new Blob([json], { type: fmt.mime });
      // } else
      if (formatId === "png") {
        const canvas = createSpriteSheetCanvas(sprite, 1);
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
      } else if (formatId === "gif") {
        blob = await this.#exportGif(sprite);
      } else if (formatId === "apng") {
        blob = await this.#exportApng(sprite);
      } else {
        return;
      }
    } catch (err) {
      this.dispatchEvent(
        new CustomEvent("growl", {
          bubbles: true,
          detail: { message: "Export failed: " + (err?.message ?? err) },
        }),
      );
      return;
    }

    if (blob) {
      this.dispatchEvent(
        new CustomEvent("export", {
          bubbles: true,
          detail: { blob, filename },
        }),
      );
      this.#onClose();
    }
  }

  // SFF support - coming later
  // #serializeSprite(sprite) {
  //   const serialized = {
  //     ...sprite,
  //     frames: sprite.frames.map((frame) => ({
  //       ...frame,
  //       pixels: frame.pixels.map((pixel) =>
  //         pixel === null ? 0 : rgbToHex(pixel),
  //       ),
  //     })),
  //   };
  //   return JSON.stringify(serialized, null, 2);
  // }

  async #exportGif(sprite) {
    const { GIFEncoder, quantize, applyPalette } =
      await import("/vendor/gifenc.js");
    const w = sprite.width;
    const h = sprite.height;
    const rgbaFrames = spriteToRgbaFrames(sprite);

    const totalLen = rgbaFrames.reduce((s, f) => s + f.length, 0);
    const combined = new Uint8Array(totalLen);
    let off = 0;
    for (const f of rgbaFrames) {
      combined.set(f, off);
      off += f.length;
    }

    const palette = quantize(combined, 256, {
      format: "rgba4444",
      clearAlpha: false,
    });
    let transparentIndex = -1;
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i];
      if (c.length >= 4 && c[3] === 0) {
        transparentIndex = i;
        break;
      }
    }

    const gif = GIFEncoder();
    let first = true;
    for (let i = 0; i < rgbaFrames.length; i++) {
      const rgba = rgbaFrames[i];
      const index = applyPalette(rgba, palette, "rgba4444");
      const delayMs = exportDelayMsForGif(
        frameDelayOrDefault(sprite.frames[i]),
      );
      gif.writeFrame(index, w, h, {
        palette,
        delay: delayMs,
        transparent: transparentIndex >= 0,
        transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
        first,
      });
      first = false;
    }
    gif.finish();
    const bytes = gif.bytes();
    return new Blob([bytes], { type: "image/gif" });
  }

  async #exportApng(sprite) {
    const UPNG = await import("/vendor/upng-js.js").then((m) => m.default);
    const w = sprite.width;
    const h = sprite.height;
    const rgbaFrames = spriteToRgbaFrames(sprite);

    const bufs = rgbaFrames.map((arr) => arr.buffer);
    const dels = sprite.frames.map((f) =>
      exportDelayMsForApng(frameDelayOrDefault(f)),
    );

    const apngBuffer = UPNG.encode(bufs, w, h, 0, dels);
    return new Blob([apngBuffer], { type: "image/png" });
  }

  /**
   * @param {{ width: number; height: number; frames: { delay?: number; pixels: (number|null)[] }[] } | null} sprite
   */
  showModal(sprite) {
    this.#sprite = sprite ?? null;
    if (!this.#sprite?.frames?.length) {
      return;
    }
    this.#renderPreview();
    this.#formatSelect.value = "png";
    this.#btnExport.disabled = false;
    this.#filenameInput.value = "sprite.png";
    this.#modal?.showModal();
  }
}

customElements.define("export-modal", ExportModal);

export default ExportModal;
