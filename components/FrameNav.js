/**
 * FrameNav Web Component
 *
 * Filmstrip view of sprite frames with navigation controls. No DataStore dependency.
 * Parent sets `frames`, `frameIndex`, and `frameTotal` and listens to custom events.
 *
 * Events: frame-previous, frame-next, frame-add, frame-remove, frame-select
 *
 * Usage:
 *   <frame-nav></frame-nav>
 *   frameNav.frames = [...];
 *   frameNav.frameIndex = 0;
 *   frameNav.frameTotal = 4;
 *   frameNav.addEventListener('frame-select', (e) => { currentFrame = e.detail.index; });
 */

import { h } from "/src/domUtils.js";
import "/components/SpriteThumbnail.js";

const CSS = `
:host {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-bottom: 1px solid var(--accent-color, #333);
  padding-bottom: 4px;
  margin-bottom: 4px;
}

.filmstrip {
  position: relative;
  border-top: 6px solid black;
  border-bottom: 6px solid black;
  margin: 0 auto;
  padding: 0 4px;
}
  
.filmstrip-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  overflow-x: auto;
  min-height: 60px;
  background-color: var(--backdrop-color);
  padding: 1px 8px;
  border-top: 4px dashed #aaa;
  margin-top: -5px;
  border-bottom: 4px dashed #aaa;
  margin-bottom: -5px;
}

.filmstrip-cell {
  cursor: pointer;
  border-left: 2px solid #000;
  border-right: 2px solid #000;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.filmstrip-cell:hover {
  box-shadow: inset 0px 0px 10px 0px var(--accent-color);
}
  
.filmstrip-cell.selected {
  box-shadow: inset 0px 0px 10px 0px var(--border-subtle);
}

@media (prefers-color-scheme: dark) {
  .filmstrip-cell {
    border-left: 2px solid #888;
    border-right: 2px solid #888;
  }

  .filmstrip-cell:hover {
    box-shadow: inset 0px 0px 10px 0px var(--accent-color-muted);
  }
    
  .filmstrip-cell.selected {
    box-shadow: inset 0px 0px 10px 0px var(--accent-color);
  }
}

.controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 2px solid var(--accent-color, #333);
  background-color: #fff;
  cursor: pointer;
}

button:hover,
button:focus-visible {
  background-color: var(--accent-color-muted, #f0f0f0);
}

button img {
  width: 90%;
  height: 90%;
  display: block;
  margin: 0 auto;
}
`;

class FrameNav extends HTMLElement {
  #frameIndex = 0;
  #frameTotal = 1;
  #frames = [];
  #filmstripEl = null;
  #numberEl = null;
  #totalEl = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  get frames() {
    return this.#frames;
  }

  set frames(value) {
    this.#frames = Array.isArray(value) ? value : [];
    this.#renderFilmstrip();
  }

  get frameIndex() {
    return this.#frameIndex;
  }

  set frameIndex(value) {
    const n = Number(value);
    if (Number.isNaN(n) || this.#frameIndex === n) return;
    this.#frameIndex = Math.max(0, n);
    this.#updateDisplay();
  }

  get frameTotal() {
    return this.#frameTotal;
  }

  set frameTotal(value) {
    const n = Number(value);
    if (Number.isNaN(n) || this.#frameTotal === n) return;
    this.#frameTotal = Math.max(1, n);
    this.#updateDisplay();
  }

  connectedCallback() {
    if (!this.shadowRoot.firstChild) {
      this.#render();
    }
  }

  #updateDisplay() {
    if (this.#numberEl) {
      this.#numberEl.textContent = String(this.#frameIndex + 1);
    }
    if (this.#totalEl) {
      this.#totalEl.textContent = String(this.#frameTotal);
    }
    this.#updateFilmstripSelection();
  }

  #updateFilmstripSelection() {
    if (!this.#filmstripEl) return;
    const cells = this.#filmstripEl.querySelectorAll(".filmstrip-cell");
    cells.forEach((cell, i) => {
      cell.classList.toggle("selected", i === this.#frameIndex);
      if (i === this.#frameIndex) {
        cell.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    });
  }

  #renderFilmstrip() {
    if (!this.#filmstripEl) return;
    this.#filmstripEl.replaceChildren();
    for (let i = 0; i < this.#frames.length; i++) {
      const frame = this.#frames[i];
      const cell = h("div", {
        className: `filmstrip-cell${i === this.#frameIndex ? " selected" : ""}`,
      });
      cell.dataset.index = String(i);
      const thumb = document.createElement("sprite-thumbnail");
      thumb.spriteData = frame ?? null;
      cell.appendChild(thumb);
      cell.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("frame-select", {
            bubbles: true,
            detail: { index: i },
          }),
        );
      });
      this.#filmstripEl.appendChild(cell);
    }
  }

  #render() {
    const style = document.createElement("style");
    style.textContent = CSS;

    this.#filmstripEl = h("div", { className: "filmstrip-inner" }, []);
    const filmstripOuter = h("div", { className: "filmstrip" }, [
      this.#filmstripEl,
    ]);
    this.#renderFilmstrip();

    this.#numberEl = document.createElement("span");
    this.#numberEl.textContent = String(this.#frameIndex + 1);

    const slash = document.createTextNode(" / ");

    this.#totalEl = document.createElement("span");
    this.#totalEl.textContent = String(this.#frameTotal);

    const prevBtn = h("button", { type: "button", title: "Previous Frame" }, [
      h("img", { src: "/images/prev.svg", alt: "Previous Frame" }),
    ]);
    prevBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("frame-previous", { bubbles: true }));
    });

    const nextBtn = h("button", { type: "button", title: "Next Frame" }, [
      h("img", { src: "/images/next.svg", alt: "Next Frame" }),
    ]);
    nextBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("frame-next", { bubbles: true }));
    });

    const addBtn = h("button", { type: "button", title: "Add Frame" }, [
      h("img", { src: "/images/plus.svg", alt: "Add Frame" }),
    ]);
    addBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("frame-add", { bubbles: true }));
    });

    const removeBtn = h("button", { type: "button", title: "Remove Frame" }, [
      h("img", { src: "/images/minus.svg", alt: "Remove Frame" }),
    ]);
    removeBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("frame-remove", { bubbles: true }));
    });

    const controls = h("div", { className: "controls" }, [
      prevBtn,
      this.#numberEl,
      slash,
      this.#totalEl,
      nextBtn,
      addBtn,
      removeBtn,
    ]);

    this.shadowRoot.replaceChildren(style, filmstripOuter, controls);
  }
}

customElements.define("frame-nav", FrameNav);

export default FrameNav;
