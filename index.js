import { serviceWorkerManager } from "/src/ServiceWorkerManager.js";
import "/components/UpdateNotification.js";
import "/components/HistoryList.js";
import "/components/SpriteAnimationPreview.js";
import { SpriteEditorTools as TOOLS } from "/components/SpriteEditor.js";
import DataStore from "/src/DataStore.js";

const whenLoaded = Promise.all([
  customElements.whenDefined("update-notification"),
  customElements.whenDefined("history-list"),
  customElements.whenDefined("sprite-animation-preview"),
  customElements.whenDefined("sprite-editor"),
]);

whenLoaded.then(async () => {
  let currentSprite = null;
  let currentFrame = 0;
  let currentToolButton = null;

  const spriteEditor = document.getElementById("sprite-editor");
  const spritePreview = document.getElementById("sprite-preview");
  spriteEditor.onSetPixel = (frameIndex, pixelIndex, pixel) => {
    DataStore.setPixel(frameIndex, pixelIndex, pixel);
  };
  spriteEditor.onSetFrame = (frameIndex, frame) => {
    DataStore.setFrame(frameIndex, frame);
  };

  const spriteWidthInput = document.getElementById("sprite-width");
  const spriteHeightInput = document.getElementById("sprite-height");

  function syncSpriteDimensionsFromStore() {
    spriteWidthInput.value = String(DataStore.width);
    spriteHeightInput.value = String(DataStore.height);
  }

  function applySpriteDimensionsFromInputs() {
    const w = Number(spriteWidthInput.value);
    const h = Number(spriteHeightInput.value);
    DataStore.resizeSprite(w, h);
    syncSpriteDimensionsFromStore();
  }

  // init menu bar
  const newButton = document.getElementById("btn-new");
  newButton.addEventListener("click", () => {
    if (!window.confirm("Create a new sprite?")) {
      return;
    }
    DataStore.saveToHistory();
    DataStore.newSprite();
  });

  spriteWidthInput.addEventListener("change", () => {
    applySpriteDimensionsFromInputs();
  });
  spriteHeightInput.addEventListener("change", () => {
    applySpriteDimensionsFromInputs();
  });

  // init controls
  const pencilButton = document.getElementById("pencil");
  const colorPicker = document.getElementById("color-picker");
  const eraserButton = document.getElementById("eraser");
  const paintBucketButton = document.getElementById("paint-bucket");
  colorPicker.addEventListener("change", (event) => {
    spriteEditor.color = event.target.value;
  });
  currentToolButton = pencilButton;
  pencilButton.addEventListener("click", () => {
    currentToolButton.classList.remove("active");
    spriteEditor.tool = TOOLS.PENCIL;
    pencilButton.classList.add("active");
    currentToolButton = pencilButton;
  });
  eraserButton.addEventListener("click", () => {
    currentToolButton.classList.remove("active");
    spriteEditor.tool = TOOLS.ERASER;
    eraserButton.classList.add("active");
    currentToolButton = eraserButton;
  });
  paintBucketButton.addEventListener("click", () => {
    currentToolButton.classList.remove("active");
    spriteEditor.tool = TOOLS.FILL;
    paintBucketButton.classList.add("active");
    currentToolButton = paintBucketButton;
  });

  const frameNumberInput = document.getElementById("frame-number");
  frameNumberInput.max = currentSprite?.frameCount ?? 1;
  frameNumberInput.min = 1;
  frameNumberInput.value = currentFrame + 1;

  frameNumberInput.addEventListener("change", (event) => {
    currentFrame = event.target.value - 1;
    spriteEditor.frameIndex = currentFrame;
    spritePreview.frameIndex = currentFrame;
  });
  const frameTotalSpan = document.getElementById("frame-total");
  function updateFrameTotal() {
    frameTotalSpan.textContent = currentSprite?.frameCount ?? 1;
  }
  const framePreviousButton = document.getElementById("frame-previous");
  framePreviousButton.addEventListener("click", () => {
    currentFrame = Math.max(currentFrame - 1, 0);
    frameNumberInput.value = currentFrame + 1;
    spriteEditor.frameIndex = currentFrame;
    spritePreview.frameIndex = currentFrame;
  });
  const frameNextButton = document.getElementById("frame-next");
  frameNextButton.addEventListener("click", () => {
    currentFrame = Math.min(currentFrame + 1, currentSprite?.frameCount - 1);
    frameNumberInput.value = currentFrame + 1;
    spriteEditor.frameIndex = currentFrame;
    spritePreview.frameIndex = currentFrame;
  });
  const frameAddButton = document.getElementById("frame-add");
  frameAddButton.addEventListener("click", () => {
    DataStore.addFrame();
    updateFrameTotal();
  });
  const frameRemoveButton = document.getElementById("frame-remove");
  frameRemoveButton.addEventListener("click", () => {
    if (currentSprite?.frameCount <= 1) {
      alert("You must have at least one frame");
      return;
    }
    DataStore.deleteFrame(currentFrame);
    currentFrame = Math.max(currentFrame - 1, 0);
    frameNumberInput.value = currentFrame + 1;
    updateFrameTotal();
    spriteEditor.frameIndex = currentFrame;
    spritePreview.frameIndex = currentFrame;
  });
  const fpsInput = document.getElementById("sprite-fps");
  function syncFpsFromStore() {
    fpsInput.value = String(DataStore.fps);
  }
  fpsInput.addEventListener("change", () => {
    DataStore.fps = fpsInput.value;
    syncFpsFromStore();
  });

  const frameCopyButton = document.getElementById("frame-copy");
  frameCopyButton.addEventListener("click", () => {
    const clipboardData = { ...DataStore.getFrame(currentFrame) };
    navigator.clipboard.writeText(JSON.stringify(clipboardData));
    alert("Frame copied to clipboard");
  });
  const framePasteButton = document.getElementById("frame-paste");
  framePasteButton.addEventListener("click", async () => {
    const currentFrameIsEmpty = currentSprite.frames[currentFrame].pixels.every(
      (pixel) => pixel === null,
    );
    if (!currentFrameIsEmpty) {
      if (!window.confirm("Overwrite current frame with clipboard data?")) {
        return;
      }
    }
    const clipboardData = await navigator.clipboard.readText();
    const frameToPaste = JSON.parse(clipboardData);
    DataStore.setFrame(currentFrame, { ...frameToPaste });
  });

  const historyList = document.querySelector("history-list");
  historyList.addEventListener("select", (event) => {
    const id = event.detail.id;
    DataStore.loadFromHistory(id);
    currentSprite = DataStore.currentSprite;
    historyList.items = DataStore.spriteHistory;
    spriteEditor.sprite = currentSprite;
    spritePreview.sprite = currentSprite;
    spriteEditor.frameIndex = currentFrame;
    spritePreview.frameIndex = currentFrame;
  });
  historyList.addEventListener("remove", (event) => {
    DataStore.deleteFromHistoryById(event.detail.id);
  });
  // end controls init

  // init service worker
  const updateNotification = document.querySelector("update-notification");

  window.addEventListener("sw-update-available", (event) => {
    console.log("Service worker update available, showing notification");
    updateNotification.show(event.detail.pendingWorker);
  });

  await serviceWorkerManager.register();
  // end service worker init

  // init data store
  DataStore.init();

  DataStore.addEventListener("change", async (evt) => {
    switch (evt.detail.changeType) {
      case "init":
        currentSprite = evt.detail.currentSprite;
        spriteEditor.sprite = currentSprite;
        spritePreview.sprite = currentSprite;

        // populate history list
        historyList.items = evt.detail.spriteHistory ?? [];
        updateFrameTotal();
        syncFpsFromStore();
        syncSpriteDimensionsFromStore();
        spriteEditor.frameIndex = currentFrame;
        spritePreview.frameIndex = currentFrame;
        break;
      case "add":
        if (evt.detail.affectedRecords?.includes("spriteHistory")) {
          historyList.items = evt.detail.spriteHistory ?? [];
        }
        break;
      case "update":
        if (evt.detail.affectedRecords?.includes("currentSprite")) {
          currentSprite = evt.detail.currentSprite;
          spriteEditor.sprite = currentSprite;
          spritePreview.sprite = currentSprite;
          const frameCount = currentSprite?.frameCount ?? 1;
          currentFrame = Math.min(Math.max(currentFrame, 0), frameCount - 1);
          frameNumberInput.max = frameCount;
          frameNumberInput.value = currentFrame + 1;
          updateFrameTotal();
          syncFpsFromStore();
          syncSpriteDimensionsFromStore();
          spriteEditor.frameIndex = currentFrame;
          spritePreview.frameIndex = currentFrame;
        }
        break;
      case "load":
        if (evt.detail.affectedRecords?.includes("spriteHistory")) {
          historyList.items = evt.detail.spriteHistory ?? [];
        }
        if (evt.detail.affectedRecords?.includes("currentSprite")) {
          currentSprite = evt.detail.currentSprite;
          spriteEditor.sprite = currentSprite;
          spritePreview.sprite = currentSprite;
          const frameCount = currentSprite?.frameCount ?? 1;
          currentFrame = Math.min(Math.max(currentFrame, 0), frameCount - 1);
          frameNumberInput.max = frameCount;
          frameNumberInput.value = currentFrame + 1;
          updateFrameTotal();
          syncFpsFromStore();
          syncSpriteDimensionsFromStore();
          spriteEditor.frameIndex = currentFrame;
          spritePreview.frameIndex = currentFrame;
        }
        break;
      case "delete":
        if (evt.detail.affectedRecords?.includes("spriteHistory")) {
          historyList.items = evt.detail.spriteHistory ?? [];
        }
        break;
      default:
        // no action to take otherwise
        break;
    }
  });
  // end data store init
});
