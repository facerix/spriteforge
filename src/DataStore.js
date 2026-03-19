// singleton class to manage the user's data

import { v4WithTimestamp } from "./uuid.js";
import { rgbToHex, hexToRgb } from "./utils.js";

function serializeSprite(sprite) {
  if (!sprite) return null;
  return {
    ...sprite,
    frames: sprite.frames.map((frame) => ({
      ...frame,
      pixels: frame.pixels.map((pixel) =>
        pixel === null ? null : rgbToHex(pixel),
      ),
    })),
  };
}

function deserializeSprite(sprite) {
  if (!sprite) return null;
  return {
    ...sprite,
    frames: sprite.frames.map((frame) => ({
      ...frame,
      pixels: frame.pixels.map((pixel) =>
        pixel === null ? null : hexToRgb(pixel),
      ),
    })),
  };
}

/* Pixel data structure:
number | null
- null = transparent/off pixel
- number = packed RGB color value (0x000000 to 0xFFFFFF)
*/

/* Image data structure:
{
  width: number;
  height: number;
  pixels: pixel[]; // array of pixels, width*height in length
}
*/

/* Sprite data structure:
{
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  frames: image[]; // array of images, frameCount in length
}
*/

/* LocalStorage will retain:
currentSprite: Sprite;
spriteHistory: Sprite[];
*/

const STORAGE_KEY_CURRENT = "currentSprite";
const STORAGE_KEY_HISTORY = "spriteHistory";

function createDefaultSprite(
  width = 16,
  height = 16,
  fps = 12,
  frameCount = 1,
) {
  const pixels = new Array(width * height).fill(null);

  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push({
      width,
      height,
      pixels: [...pixels],
    });
  }

  return {
    id: v4WithTimestamp(),
    width,
    height,
    fps,
    frameCount,
    frames,
  };
}

let instance;
class DataStore extends EventTarget {
  #currentSprite = null;
  #spriteHistory = [];

  constructor() {
    if (instance) {
      throw new Error("New instance cannot be created!!");
    }
    super();

    instance = this;
  }

  #loadSpriteFromJson(json) {
    try {
      const sprite = JSON.parse(json);
      if (!sprite || typeof sprite !== "object") {
        console.warn("[DataStore] Invalid sprite JSON, returning null.");
        return null;
      }
      if (!sprite.id) {
        sprite.id = v4WithTimestamp();
      }
      return deserializeSprite(sprite);
    } catch (error) {
      console.warn("[DataStore] Failed to parse sprite JSON.", error);
      return null;
    }
  }

  #loadHistoryFromJson(json) {
    try {
      const history = JSON.parse(json);
      if (!Array.isArray(history)) {
        console.warn(
          "[DataStore] Expected array for history, falling back to empty list.",
        );
        return [];
      }
      return history.map((sprite) => {
        if (!sprite.id) {
          sprite.id = v4WithTimestamp();
        }
        return deserializeSprite(sprite);
      });
    } catch (error) {
      console.warn(
        "[DataStore] Failed to parse history JSON, resetting.",
        error,
      );
      try {
        window.localStorage.setItem(STORAGE_KEY_HISTORY, "[]");
      } catch (storageError) {
        console.warn(
          "[DataStore] Failed to reset stored history.",
          storageError,
        );
      }
      return [];
    }
  }

  async init() {
    const savedCurrentJson = window.localStorage.getItem(STORAGE_KEY_CURRENT);
    if (savedCurrentJson) {
      this.#currentSprite = this.#loadSpriteFromJson(savedCurrentJson);
    }
    if (!this.#currentSprite) {
      this.#currentSprite = createDefaultSprite();
      this.#saveCurrentSprite();
    }

    const savedHistoryJson = window.localStorage.getItem(STORAGE_KEY_HISTORY);
    if (savedHistoryJson) {
      this.#spriteHistory = this.#loadHistoryFromJson(savedHistoryJson);
    } else {
      window.localStorage.setItem(STORAGE_KEY_HISTORY, "[]");
    }

    setTimeout(() => {
      this.#emitChangeEvent("init", ["*"]);
    }, 0);
  }

  #saveCurrentSprite() {
    window.localStorage.setItem(
      STORAGE_KEY_CURRENT,
      JSON.stringify(serializeSprite(this.#currentSprite)),
    );
  }

  #saveHistory() {
    window.localStorage.setItem(
      STORAGE_KEY_HISTORY,
      JSON.stringify(this.#spriteHistory.map(serializeSprite)),
    );
  }

  #emitChangeEvent(changeType, affectedRecords) {
    const changeEvent = new CustomEvent("change", {
      detail: {
        currentSprite: this.#currentSprite,
        spriteHistory: this.#spriteHistory,
        changeType,
        affectedRecords,
      },
    });
    this.dispatchEvent(changeEvent);
  }

  get currentSprite() {
    return this.#currentSprite;
  }

  set currentSprite(sprite) {
    if (!sprite.id) {
      sprite.id = v4WithTimestamp();
    }
    this.#currentSprite = sprite;
    this.#saveCurrentSprite();
    this.#emitChangeEvent("update", ["currentSprite"]);
  }

  get spriteHistory() {
    return this.#spriteHistory;
  }

  get width() {
    return this.#currentSprite?.width ?? 16;
  }

  set width(value) {
    if (this.#currentSprite) {
      this.#currentSprite.width = value;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  get height() {
    return this.#currentSprite?.height ?? 16;
  }

  set height(value) {
    if (this.#currentSprite) {
      this.#currentSprite.height = value;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  get fps() {
    return this.#currentSprite?.fps ?? 12;
  }

  set fps(value) {
    if (this.#currentSprite) {
      this.#currentSprite.fps = value;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  get frameCount() {
    return this.#currentSprite?.frameCount ?? 1;
  }

  get frames() {
    return this.#currentSprite?.frames ?? [];
  }

  getFrame(index) {
    return this.#currentSprite?.frames?.[index] ?? null;
  }

  setFrame(index, image) {
    if (
      this.#currentSprite &&
      index >= 0 &&
      index < this.#currentSprite.frames.length
    ) {
      this.#currentSprite.frames[index] = image;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  addFrame(image = null) {
    if (this.#currentSprite) {
      const newFrame = image ?? {
        width: this.#currentSprite.width,
        height: this.#currentSprite.height,
        pixels: new Array(
          this.#currentSprite.width * this.#currentSprite.height,
        ).fill(null),
      };
      this.#currentSprite.frames.push(newFrame);
      this.#currentSprite.frameCount = this.#currentSprite.frames.length;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  deleteFrame(index) {
    if (
      this.#currentSprite &&
      this.#currentSprite.frames.length > 1 &&
      index >= 0 &&
      index < this.#currentSprite.frames.length
    ) {
      this.#currentSprite.frames.splice(index, 1);
      this.#currentSprite.frameCount = this.#currentSprite.frames.length;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  getPixel(frameIndex, pixelIndex) {
    return (
      this.#currentSprite?.frames?.[frameIndex]?.pixels?.[pixelIndex] ?? null
    );
  }

  setPixel(frameIndex, pixelIndex, pixel) {
    const frame = this.#currentSprite?.frames?.[frameIndex];
    if (frame && pixelIndex >= 0 && pixelIndex < frame.pixels.length) {
      frame.pixels[pixelIndex] = pixel;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  saveToHistory() {
    if (this.#currentSprite) {
      const copy = JSON.parse(JSON.stringify(this.#currentSprite));
      copy.id = v4WithTimestamp();
      this.#spriteHistory.unshift(copy);
      this.#saveHistory();
      this.#emitChangeEvent("add", ["spriteHistory"]);
    }
  }

  loadFromHistory(index) {
    if (index >= 0 && index < this.#spriteHistory.length) {
      const sprite = JSON.parse(JSON.stringify(this.#spriteHistory[index]));
      sprite.id = v4WithTimestamp();
      this.#currentSprite = sprite;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  deleteFromHistory(index) {
    if (index >= 0 && index < this.#spriteHistory.length) {
      this.#spriteHistory.splice(index, 1);
      this.#saveHistory();
      this.#emitChangeEvent("delete", ["spriteHistory"]);
    }
  }

  clearHistory() {
    this.#spriteHistory = [];
    this.#saveHistory();
    this.#emitChangeEvent("delete", ["spriteHistory"]);
  }

  newSprite(width = 16, height = 16, fps = 12, frameCount = 1) {
    this.#currentSprite = createDefaultSprite(width, height, fps, frameCount);
    this.#saveCurrentSprite();
    this.#emitChangeEvent("update", ["currentSprite"]);
  }

  import(jsonData) {
    const sprite = this.#loadSpriteFromJson(jsonData);
    if (sprite) {
      this.#currentSprite = sprite;
      this.#saveCurrentSprite();
      this.#emitChangeEvent("update", ["currentSprite"]);
    }
  }

  export() {
    return JSON.stringify(serializeSprite(this.#currentSprite));
  }
}

const singleton = Object.freeze(new DataStore());

export default singleton;
