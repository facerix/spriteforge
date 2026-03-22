/**
 * SpriteThumbnail Web Component
 * Renders a thumbnail of a single sprite frame that auto-sizes to fit its container
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
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            min-width: 0;
            min-height: 0;
          }
          .empty {
            aspect-ratio: 1;
            max-width: 100%;
            max-height: 100%;
            background: transparent;
          }
        </style>
        <div class="empty"></div>
      `;
      return;
    }

    const { width, height, pixels } = this.#spriteData;
    const pixelWidthPct = 100 / width;
    const pixelHeightPct = 100 / height;

    let pixelsHtml = "";
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const pixel = pixels[index];
        if (pixel !== null) {
          const color = rgbToHex(pixel);
          const left = x * pixelWidthPct;
          const top = y * pixelHeightPct;
          pixelsHtml += `<span style="left:${left}%;top:${top}%;width:${pixelWidthPct}%;height:${pixelHeightPct}%;background:${color}"></span>`;
        }
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
        }
        .container {
          flex: 1;
          position: relative;
          aspect-ratio: ${width} / ${height};
          max-width: 100%;
          max-height: 100%;
          background: transparent;
          overflow: hidden;
        }
        .container span {
          position: absolute;
        }
      </style>
      <div class="container">${pixelsHtml}</div>
    `;
  }
}

customElements.define("sprite-thumbnail", SpriteThumbnail);

export default SpriteThumbnail;
