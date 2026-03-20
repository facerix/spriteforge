/**
 * SpriteThumbnail Web Component
 * Renders a small thumbnail (80px max dimension) of a single sprite frame
 * Uses individual div elements for pixels instead of canvas
 */

import { rgbToHex } from "/src/utils.js";

class SpriteThumbnail extends HTMLElement {
  #spriteData = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  set spriteData(data) {
    this.#spriteData = data;
    this.render();
  }

  get spriteData() {
    return this.#spriteData;
  }

  render() {
    if (!this.#spriteData) {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-block;
          }
          .empty {
            width: 80px;
            height: 80px;
            background: transparent;
            border: 1px solid #444;
            border-radius: 4px;
          }
        </style>
        <div class="empty"></div>
      `;
      return;
    }

    const { width, height, pixels } = this.#spriteData;
    const maxDimension = 80;
    const pixelSize = Math.floor(maxDimension / Math.max(width, height));
    const containerWidth = width * pixelSize;
    const containerHeight = height * pixelSize;

    let pixelsHtml = "";
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const pixel = pixels[index];
        if (pixel !== null) {
          const color = rgbToHex(pixel);
          const left = x * pixelSize;
          const top = y * pixelSize;
          pixelsHtml += `<span style="left:${left}px;top:${top}px;background:${color}"></span>`;
        }
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }
        .container {
          position: relative;
          width: ${containerWidth}px;
          height: ${containerHeight}px;
          background: transparent;
          border: 1px solid #8b1a1a;
          border-radius: 4px;
          overflow: hidden;
        }
        .container span {
          position: absolute;
          width: ${pixelSize}px;
          height: ${pixelSize}px;
        }
      </style>
      <div class="container">${pixelsHtml}</div>
    `;
  }
}

customElements.define("sprite-thumbnail", SpriteThumbnail);

export default SpriteThumbnail;
