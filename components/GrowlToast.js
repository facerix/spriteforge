/**
 * GrowlToast Web Component
 * Ephemeral, growl-style user feedback using the Popover API.
 * Appears in the top-right of the window and auto-hides after a few seconds.
 *
 * Usage:
 *   const growl = document.querySelector('growl-toast');
 *   growl.show('Copied to clipboard!');
 *   growl.show('Saved!', { duration: 5000 });
 *
 * Options:
 *   duration: number - ms before auto-hide (default: 3000)
 */

import { h } from "../src/domUtils.js";

const CSS = `
:host {
  --growl-bg: #2d2d2d;
  --growl-text: #f5f5f5;
  --growl-border: rgba(255, 255, 255, 0.12);
  --growl-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  --growl-radius: 8px;

  /* Override UA popover styles (inset:0; margin:auto) which center the popover */
  inset: auto;
  top: 1rem;
  right: 1rem;
  bottom: auto;
  left: auto;
  margin: 0;
  padding: 0;
  background-color: transparent;
  border: none;
}

.toast {
  display: block;
  padding: 0.75rem 1rem;
  min-width: 200px;
  max-width: 320px;
  background: var(--growl-bg);
  color: var(--growl-text);
  border: 1px solid var(--growl-border);
  border-radius: var(--growl-radius);
  box-shadow: var(--growl-shadow);
  font-size: 0.9rem;
  font-family: inherit;
  line-height: 1.4;
}

:host(:popover-open) .toast {
  animation: growlSlideIn 0.2s ease-out;
}

@keyframes growlSlideIn {
  from {
    opacity: 0;
    transform: translateX(1rem);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  :host(:popover-open) .toast {
    animation: none;
  }
}
`;

class GrowlToast extends HTMLElement {
  #toast = null;
  #hideTimer = null;

  constructor() {
    super();
  }

  connectedCallback() {
    this.setAttribute("popover", "auto");

    const shadow = this.attachShadow({ mode: "open" });
    const styles = document.createElement("style");
    styles.textContent = CSS;
    shadow.appendChild(styles);

    this.#toast = h("div", { className: "toast" }, []);
    shadow.appendChild(this.#toast);

    this.addEventListener("toggle", (evt) => {
      if (evt.newState === "closed") {
        this.#clearTimer();
      }
    });
  }

  #clearTimer() {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
  }

  /**
   * Show an ephemeral message. Auto-hides after `duration` ms.
   * @param {string} message - Text to display
   * @param {{ duration?: number }} [options] - duration in ms (default: 3000)
   */
  show(message, options = {}) {
    const { duration = 3000 } = options;

    this.#clearTimer();

    this.#toast.textContent = message;

    try {
      if (this.matches(":popover-open")) {
        this.hidePopover();
      }
      this.showPopover();
    } catch (_e) {
      this.showPopover();
    }

    this.#hideTimer = setTimeout(() => {
      this.#clearTimer();
      try {
        this.hidePopover();
      } catch (_e) {
        // Already closed
      }
    }, duration);
  }
}

customElements.define("growl-toast", GrowlToast);

export default GrowlToast;
