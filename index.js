import { serviceWorkerManager } from "/src/ServiceWorkerManager.js";
import "/components/UpdateNotification.js";
import DataStore from "/src/DataStore.js";
import { hexToRgb, rgbToHex } from "/src/utils.js";

const TOOLS = {
  PENCIL: "pencil",
  ERASER: "eraser",
};

const whenLoaded = Promise.all([
  customElements.whenDefined("update-notification"),
]);

whenLoaded.then(async () => {
  let currentSprite = null;
  let cellWidth = 0;
  let cellHeight = 0;
  let isPlaying = false;
  let currentFrame = 0;
  let currentColor = "#000000";
  let currentTool = TOOLS.PENCIL;
  let currentToolButton = null;

  // init canvases
  const canvas = document.getElementById("canvas");
  const preview = document.getElementById("preview");
  const ctx = canvas.getContext("2d");
  const previewCtx = preview.getContext("2d");

  function setupCanvasForHighDPI() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.scale(dpr, dpr);

    const previewRect = preview.getBoundingClientRect();
    preview.width = previewRect.width * dpr;
    preview.height = previewRect.height * dpr;
    preview.style.width = previewRect.width + "px";
    preview.style.height = previewRect.height + "px";
    previewCtx.scale(dpr, dpr);
  }

  setupCanvasForHighDPI();
  // end canvas init

  // init controls
  const pencilButton = document.getElementById("pencil");
  const colorPicker = document.getElementById("color-picker");
  const eraserButton = document.getElementById("eraser");
  colorPicker.addEventListener("change", (event) => {
    currentColor = event.target.value;
  });
  currentToolButton = pencilButton;
  pencilButton.addEventListener("click", () => {
    currentToolButton.classList.remove("active");
    currentTool = TOOLS.PENCIL;
    pencilButton.classList.add("active");
    currentToolButton = pencilButton;
  });
  eraserButton.addEventListener("click", () => {
    currentToolButton.classList.remove("active");
    currentTool = TOOLS.ERASER;
    eraserButton.classList.add("active");
    currentToolButton = eraserButton;
  });

  const frameNumberInput = document.getElementById("frame-number");
  frameNumberInput.max = currentSprite?.frameCount ?? 1;
  frameNumberInput.min = 1;
  frameNumberInput.value = currentFrame + 1;

  frameNumberInput.addEventListener("change", (event) => {
    currentFrame = event.target.value - 1;
    render();
  });
  const frameTotalSpan = document.getElementById("frame-total");
  function updateFrameTotal() {
    frameTotalSpan.textContent = currentSprite?.frameCount ?? 1;
  }
  const framePreviousButton = document.getElementById("frame-previous");
  framePreviousButton.addEventListener("click", () => {
    currentFrame = Math.max(currentFrame - 1, 0);
    frameNumberInput.value = currentFrame + 1;
    render();
  });
  const frameNextButton = document.getElementById("frame-next");
  frameNextButton.addEventListener("click", () => {
    currentFrame = Math.min(currentFrame + 1, currentSprite?.frameCount - 1);
    frameNumberInput.value = currentFrame + 1;
    render();
  });
  const frameAddButton = document.getElementById("frame-add");
  frameAddButton.addEventListener("click", () => {
    DataStore.addFrame();
    updateFrameTotal();
    render();
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
    render();
  });
  const frameCopyButton = document.getElementById("frame-copy");
  frameCopyButton.addEventListener("click", () => {
    const clipboardData = { ...DataStore.getFrame(currentFrame) };
    navigator.clipboard.writeText(JSON.stringify(clipboardData));
    alert("Frame copied to clipboard");
  });
  const framePasteButton = document.getElementById("frame-paste");
  framePasteButton.addEventListener("click", async () => {
    const currentFrameIsEmpty = currentSprite.frames[currentFrame].pixels.every(pixel => pixel === null);
    if (!currentFrameIsEmpty) {
      if (!window.confirm("Overwrite current frame with clipboard data?")) {
        return;
      }
    }
    const clipboardData = await navigator.clipboard.readText();
    const frameToPaste = JSON.parse(clipboardData);
    DataStore.setFrame(currentFrame, { ...frameToPaste });
    render();
  });

  const historyList = document.getElementById("history");
  historyList.addEventListener("click", (event) => {
    const li = event.target.closest("li");
    if (li) {
      alert("TODO: Load from history");
    }
  });
  // end controls init

  function drawPixel(pixelX, pixelY) {
    const pixelIndex = pixelX + pixelY * currentSprite.width;
    DataStore.setPixel(currentFrame, pixelIndex, hexToRgb(currentColor));
    render();
  }

  function erasePixel(pixelX, pixelY) {
    const pixelIndex = pixelX + pixelY * currentSprite.width;
    DataStore.setPixel(currentFrame, pixelIndex, null);
    render();
  }

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const pixelX = Math.floor(x / cellWidth);
    const pixelY = Math.floor(y / cellHeight);
    switch (currentTool) {
      case TOOLS.PENCIL:
        drawPixel(pixelX, pixelY);
        break;
      case TOOLS.ERASER:
        erasePixel(pixelX, pixelY);
        break;
    }
  });

  // init grid based on current canvas size and provided sprite size
  function recalculateGrid() {
    const rect = canvas?.getBoundingClientRect();
    if (!rect || !currentSprite) return;
    cellWidth = rect.width / currentSprite.width;
    cellHeight = rect.height / currentSprite.height;
  }

  // we want canvas to be relative to the viewport, and we want it to maintain the same aspect ratio
  // this isn't a great solution, but it's a quick fix for now
  function handleViewportChange() {
    // use 60% of viewport size as the ideal
    const width = (window.innerWidth / 100) * 60;
    const height = (window.innerHeight / 100) * 60;
    // use the smaller of the two as the target size to keep it in the viewport
    const targetSize = Math.min(width, height);
    canvas.style.width = targetSize + "px";
    canvas.style.height = targetSize + "px";
    canvas.width = targetSize;
    canvas.height = targetSize;
    recalculateGrid();
    render();
  }

  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);
  window.addEventListener("fullscreenchange", handleViewportChange);
  window.addEventListener("devicePixelRatioChange", setupCanvasForHighDPI);

  function render() {
    if (!currentSprite) return;
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // draw grid
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 1;
    for (let i = 0; i < currentSprite.width; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellWidth, 0);
      ctx.lineTo(i * cellWidth, rect.height);
      ctx.stroke();
    }
    for (let j = 0; j < currentSprite.height; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * cellHeight);
      ctx.lineTo(rect.width, j * cellHeight);
      ctx.stroke();
    }

    // draw current frame
    for (let i = 0; i < currentSprite.frames[currentFrame].pixels.length; i++) {
      const pixel = currentSprite.frames[currentFrame].pixels[i];
      if (pixel === null) continue;
      const pixelX = i % currentSprite.width;
      const pixelY = Math.floor(i / currentSprite.width);
      ctx.fillStyle = rgbToHex(pixel);
      ctx.fillRect(
        pixelX * cellWidth,
        pixelY * cellHeight,
        cellWidth,
        cellHeight,
      );
    }

    // draw preview
    previewCtx.clearRect(0, 0, preview.width, preview.height);
    const previewPixelWidth =
      preview.width / currentSprite.width / window.devicePixelRatio;
    const previewPixelHeight =
      preview.height / currentSprite.height / window.devicePixelRatio;

    for (let i = 0; i < currentSprite.frames[currentFrame].pixels.length; i++) {
      const pixel = currentSprite.frames[currentFrame].pixels[i];
      if (pixel === null) continue;
      const pixelX = i % currentSprite.width;
      const pixelY = Math.floor(i / currentSprite.width);
      previewCtx.fillStyle = rgbToHex(pixel);
      previewCtx.fillRect(
        pixelX * previewPixelWidth,
        pixelY * previewPixelHeight,
        previewPixelWidth,
        previewPixelHeight,
      );
    }
  }
  // end render function

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

        // populate history list
        const history = evt.detail.spriteHistory;
        if (history.length > 0) {
          historyList.innerHTML = history.map(sprite => `<li>${sprite.id}</li>`).join("");
        } else {
          historyList.innerHTML = "<li>No history</li>";
        }
        recalculateGrid();
        updateFrameTotal();
        render();
        break;
      case "add":
        break;
      case "delete":
      default:
        // no action to take otherwise
        break;
    }
  });
  // end data store init
});
