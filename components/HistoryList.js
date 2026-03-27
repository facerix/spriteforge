/**
 * HistoryList Web Component
 * Displays a list of sprites remembered in the edit history
 * Uses Shadow DOM with encapsulated styles
 */

import "/components/SpriteThumbnail.js";

const CSS_TEMPLATE = `
:host > ul {
    width: 100px;
    list-style: none;
    padding: 0;
    margin: 0;
    flex: 1 1 auto;
    overflow-y: auto;

    li {
      margin: 8px auto;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;

      sprite-thumbnail {
        width: 80px;
        height: 80px;
        flex-shrink: 0;
        border: 1px dashed var(--accent-color-muted);
        border-radius: 4px;
        cursor: pointer;

        &:hover {
          background: var(--accent-color);
          border-color: var(--border-subtle);
        }
      }
    }

    .remove-from-history {
      border: none;
      margin: 0;
      padding: 0;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      font: inherit;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      color: #f1f1f1;
      background: rgba(60, 60, 60, 0.95);
    }

    .remove-from-history:hover {
      background: rgba(160, 45, 45, 0.95);
    }

    .remove-from-history:focus-visible {
      outline: 2px solid #6eb3ff;
      outline-offset: 2px;
    }
}
`;

class HistoryList extends HTMLElement {
  #items = [];
  #boundHandleClick = null;
  #ready = false;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.#boundHandleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    if (this.#ready) return;
    const shadow = this.shadowRoot;
    const style = document.createElement("style");
    style.textContent = CSS_TEMPLATE;
    shadow.appendChild(style);

    const listContainer = document.createElement("ul");
    shadow.appendChild(listContainer);

    this.setupEventListeners();
    this.#ready = true;
  }

  disconnectedCallback() {
    this.cleanupEventListeners();
  }

  render() {
    if (!this.#ready) return;
    this.#regenerateHistoryListItems();
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener("click", this.#boundHandleClick);
  }

  cleanupEventListeners() {
    this.shadowRoot.removeEventListener("click", this.#boundHandleClick);
  }

  handleClick(event) {
    const removeBtn = event.target.closest("button.remove-from-history");
    if (removeBtn) {
      event.preventDefault();
      const li = removeBtn.closest("li");
      if (li?.dataset.id) {
        this.dispatchEvent(
          new CustomEvent("remove", {
            detail: { id: li.dataset.id },
            bubbles: true,
            composed: true,
          }),
        );
      }
      return;
    }

    const li = event.target.closest("li");
    if (li) {
      this.dispatchEvent(
        new CustomEvent("select", { detail: { id: li.dataset.id } }),
      );
    }
  }

  #regenerateHistoryListItems() {
    const listContainer = this.shadowRoot.querySelector("ul");
    listContainer.innerHTML = "";
    this.#items.forEach((item) => {
      const li = document.createElement("li");
      li.dataset.id = item.id;

      const thumbnail = document.createElement("sprite-thumbnail");
      const { width, height } = item;
      if (item.frames && item.frames.length > 0) {
        thumbnail.spriteData = item.frames[0]
          ? { ...item.frames[0], width, height }
          : { width, height, pixels: [] };
      }
      li.appendChild(thumbnail);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-from-history";
      removeBtn.setAttribute("aria-label", "Remove from history");
      removeBtn.title = "Remove from history";
      removeBtn.textContent = "\u00D7";
      li.appendChild(removeBtn);

      listContainer.appendChild(li);
    });
  }

  /**
   * @param {array} items
   */
  set items(items) {
    this.#items = items;
    this.#regenerateHistoryListItems();
    this.render();
  }
}

// Register the custom element
customElements.define("history-list", HistoryList);

export default HistoryList;
