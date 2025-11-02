const state = {
  page: {
    width: 1000,
    height: 1600
  },
  comicArea: {
    marginX: 60,
    marginY: 60,
    frameThickness: 4
  },
  slicing: {
    gapX: 16,
    gapY: 24
  },
  panels: [],
  bubbles: [],
  layers: [],
  selectedPanelId: null,
  selectedBubbleId: null,
  mode: 'view',
  comicAreaRect: null,
  gapColor: 'white'
};

const stageContainer = document.getElementById('stage-container');
const stageEl = document.getElementById('page-container');
const workspaceEl = document.querySelector('.workspace');
const pageEl = document.getElementById('page');
const comicAreaEl = document.getElementById('comic-area');
const gapColorSelect = document.getElementById('gap-color');
const pageSizeIndicatorEl = document.getElementById('page-size-indicator');
const toggleDrawBtn = document.getElementById('toggle-draw');
const pageWidthInput = document.getElementById('page-width');
const pageHeightInput = document.getElementById('page-height');
const areaMarginXInput = document.getElementById('area-margin-x');
const areaMarginYInput = document.getElementById('area-margin-y');
const frameThicknessInput = document.getElementById('frame-thickness');
const sliceGapXInput = document.getElementById('slice-gap-x');
const sliceGapYInput = document.getElementById('slice-gap-y');
const layerList = document.getElementById('layer-list');
const tooltip = document.getElementById('tooltip');
const SVG_NS = 'http://www.w3.org/2000/svg';

const deletePanelBtn = document.getElementById('delete-panel');
const panelImageInput = document.getElementById('panel-image');
const imageRotationInput = document.getElementById('image-rotation');
const imageFlipBtn = document.getElementById('image-flip');

const filterHueInput = document.getElementById('filter-hue');
const filterSaturationInput = document.getElementById('filter-saturation');
const filterContrastInput = document.getElementById('filter-contrast');

const addBubbleBtn = document.getElementById('add-bubble');
const deleteBubbleBtn = document.getElementById('delete-bubble');
const bubbleTypeSelect = document.getElementById('bubble-type');
const bubbleFontSizeInput = document.getElementById('bubble-font-size');
const bubblePaddingInput = document.getElementById('bubble-padding');
const bubbleStrokeInput = document.getElementById('bubble-stroke');
const bubbleTextInput = document.getElementById('bubble-text');

const exportFormatSelect = document.getElementById('export-format');
const exportQualitySelect = document.getElementById('export-quality');
const exportImageBtn = document.getElementById('export-image');

let cutState = null;
let handleState = null;
let movingPanelState = null;
let movingBubbleState = null;
let imageDragState = null;
let bubbleHandleState = null;

const viewport = {
  scale: 1,
  minScale: 0.3,
  maxScale: 3,
  translateX: 0,
  translateY: 0
};

let isPanning = false;
let panStart = null;
let panMoved = false;
let panJustEnded = false;
let userAdjustedViewport = false;

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function applyPageSettings() {
  const { width, height } = state.page;
  pageEl.style.width = `${width}px`;
  pageEl.style.height = `${height}px`;
  pageEl.style.setProperty('--frame-thickness', `${state.comicArea.frameThickness}px`);
  updateComicArea();
  updatePageSizeIndicator();
  applyGapColor();
  if (userAdjustedViewport) {
    applyViewportTransform();
  } else {
    centerViewport();
  }
}

function updatePageSizeIndicator() {
  if (!pageSizeIndicatorEl) return;
  const { width, height } = state.page;
  if (width > 0 && height > 0) {
    pageSizeIndicatorEl.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
    pageSizeIndicatorEl.style.display = 'block';
    positionPageSizeIndicator();
  } else {
    pageSizeIndicatorEl.style.display = 'none';
  }
}

function applyGapColor() {
  const color = state.gapColor === 'black' ? '#000000' : '#ffffff';
  document.documentElement.style.setProperty('--gap-color', color);
  pageEl.style.backgroundColor = color;
  if (stageContainer) {
    stageContainer.style.backgroundColor = color;
  }
  if (workspaceEl) {
    workspaceEl.style.backgroundColor = color;
  }
}

function positionPageSizeIndicator() {
  if (!pageSizeIndicatorEl || !stageContainer) return;
  if (pageSizeIndicatorEl.style.display === 'none') return;
  const scale = viewport.scale;
  const halfWidth = (state.page.width * scale) / 2;
  const left = viewport.translateX + halfWidth;
  const offset = 40;
  const top = viewport.translateY - offset;
  const minTop = 12;
  const clampedTop = Math.max(minTop, top);
  pageSizeIndicatorEl.style.left = `${left}px`;
  pageSizeIndicatorEl.style.top = `${clampedTop}px`;
}

function updateComicArea() {
  const { width, height } = state.page;
  const area = state.comicArea;
  const maxFrame = Math.max(1, Math.floor(Math.min(width, height) / 4));
  area.frameThickness = clampNumber(area.frameThickness, 1, maxFrame);
  frameThicknessInput.value = area.frameThickness.toString();

  const maxMarginX = Math.max(0, Math.floor(width / 2));
  const maxMarginY = Math.max(0, Math.floor(height / 2));
  area.marginX = clampNumber(area.marginX, 0, maxMarginX);
  area.marginY = clampNumber(area.marginY, 0, maxMarginY);
  areaMarginXInput.value = area.marginX.toString();
  areaMarginYInput.value = area.marginY.toString();

  const contentWidth = Math.max(0, width - 2 * area.marginX);
  const contentHeight = Math.max(0, height - 2 * area.marginY);

  comicAreaEl.style.left = `${area.marginX}px`;
  comicAreaEl.style.top = `${area.marginY}px`;
  comicAreaEl.style.width = `${contentWidth}px`;
  comicAreaEl.style.height = `${contentHeight}px`;

  pageEl.style.setProperty('--frame-thickness', `${area.frameThickness}px`);

  state.comicAreaRect = {
    left: area.marginX,
    top: area.marginY,
    right: area.marginX + contentWidth,
    bottom: area.marginY + contentHeight,
    width: contentWidth,
    height: contentHeight
  };

  if (cutState && cutState.overlay) {
    cutState.overlay.svg.setAttribute('width', width.toString());
    cutState.overlay.svg.setAttribute('height', height.toString());
    cutState.overlay.lines.forEach((line) => line.setAttribute('stroke-width', area.frameThickness.toString()));
  }

  refreshAllPanels();
}

function toggleDrawMode() {
  if (state.mode === 'cut') {
    state.mode = 'view';
    pageEl.dataset.mode = 'view';
    toggleDrawBtn.textContent = '开始切分格子';
    cancelCutState();
  } else {
    state.mode = 'cut';
    pageEl.dataset.mode = 'cut';
    toggleDrawBtn.textContent = '结束切分格子';
    cancelCutState();
    state.selectedPanelId = null;
    state.selectedBubbleId = null;
    removeHandles();
    enablePanelControls(false);
    enableBubbleControls(false);
    refreshLayers();
  }
}

toggleDrawBtn.addEventListener('click', toggleDrawMode);

if (stageContainer) {
  stageContainer.addEventListener('wheel', onStageWheel, { passive: false });
  stageContainer.addEventListener('mousedown', (event) => {
    if (event.target === stageContainer) {
      startPan(event);
    }
  });
  stageContainer.addEventListener('click', handleStageClick);
}

pageWidthInput.addEventListener('input', () => {
  state.page.width = clampNumber(parseInt(pageWidthInput.value, 10) || 1000, 200, 2000);
  applyPageSettings();
});

pageHeightInput.addEventListener('input', () => {
  state.page.height = clampNumber(parseInt(pageHeightInput.value, 10) || 1600, 200, 3000);
  applyPageSettings();
});

areaMarginYInput.addEventListener('input', () => {
  state.comicArea.marginY = parseInt(areaMarginYInput.value, 10) || 0;
  updateComicArea();
});

areaMarginXInput.addEventListener('input', () => {
  state.comicArea.marginX = parseInt(areaMarginXInput.value, 10) || 0;
  updateComicArea();
});

frameThicknessInput.addEventListener('input', () => {
  state.comicArea.frameThickness = parseInt(frameThicknessInput.value, 10) || 1;
  updateComicArea();
});

sliceGapXInput.addEventListener('input', () => {
  state.slicing.gapX = clampNumber(parseInt(sliceGapXInput.value, 10) || 0, 0, 400);
});

sliceGapYInput.addEventListener('input', () => {
  state.slicing.gapY = clampNumber(parseInt(sliceGapYInput.value, 10) || 0, 0, 400);
});

if (gapColorSelect) {
  gapColorSelect.value = state.gapColor;
  gapColorSelect.addEventListener('change', () => {
    state.gapColor = gapColorSelect.value === 'black' ? 'black' : 'white';
    applyGapColor();
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyViewportTransform() {
  if (!stageEl) return;
  stageEl.style.transform = `translate(${viewport.translateX}px, ${viewport.translateY}px) scale(${viewport.scale})`;
  positionPageSizeIndicator();
}

function centerViewport(force = false) {
  if (!stageContainer || !stageEl) return;
  const rect = stageContainer.getBoundingClientRect();
  if ((userAdjustedViewport && !force) || rect.width === 0 || rect.height === 0) {
    applyViewportTransform();
    return;
  }
  viewport.translateX = (rect.width - state.page.width * viewport.scale) / 2;
  viewport.translateY = (rect.height - state.page.height * viewport.scale) / 2;
  applyViewportTransform();
}

function clientToContainerPoint(clientX, clientY) {
  if (!stageContainer) {
    return { x: clientX, y: clientY };
  }
  const rect = stageContainer.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function clientToPagePoint(clientX, clientY) {
  const containerPoint = clientToContainerPoint(clientX, clientY);
  return {
    x: (containerPoint.x - viewport.translateX) / viewport.scale,
    y: (containerPoint.y - viewport.translateY) / viewport.scale
  };
}

function onStageWheel(event) {
  if (!stageContainer) return;
  if (event.target instanceof HTMLElement && event.target.closest('.image-wrapper')) {
    return;
  }
  event.preventDefault();
  const containerPoint = clientToContainerPoint(event.clientX, event.clientY);
  const worldX = (containerPoint.x - viewport.translateX) / viewport.scale;
  const worldY = (containerPoint.y - viewport.translateY) / viewport.scale;
  const delta = -event.deltaY;
  const scaleFactor = Math.exp(delta * 0.0015);
  const newScale = clampNumber(viewport.scale * scaleFactor, viewport.minScale, viewport.maxScale);
  const clampedScale = Number.isFinite(newScale) ? newScale : viewport.scale;
  viewport.scale = clampedScale;
  viewport.translateX = containerPoint.x - worldX * viewport.scale;
  viewport.translateY = containerPoint.y - worldY * viewport.scale;
  userAdjustedViewport = true;
  applyViewportTransform();
}

function shouldStartPan(event) {
  if (event.button !== 0) return false;
  if (state.mode === 'cut') return false;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('.panel, .bubble, .handle')) {
    return false;
  }
  return true;
}

function startPan(event) {
  if (!shouldStartPan(event)) return;
  isPanning = true;
  panMoved = false;
  panJustEnded = false;
  panStart = {
    clientX: event.clientX,
    clientY: event.clientY,
    translateX: viewport.translateX,
    translateY: viewport.translateY
  };
  stageContainer.classList.add('grabbing');
  document.addEventListener('mousemove', onPanMove);
  document.addEventListener('mouseup', stopPan);
  event.preventDefault();
}

function onPanMove(event) {
  if (!isPanning || !panStart) return;
  const dx = event.clientX - panStart.clientX;
  const dy = event.clientY - panStart.clientY;
  if (!panMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
    panMoved = true;
  }
  viewport.translateX = panStart.translateX + dx;
  viewport.translateY = panStart.translateY + dy;
  userAdjustedViewport = true;
  applyViewportTransform();
}

function stopPan() {
  if (!isPanning) return;
  document.removeEventListener('mousemove', onPanMove);
  document.removeEventListener('mouseup', stopPan);
  stageContainer.classList.remove('grabbing');
  isPanning = false;
  panJustEnded = panMoved;
  panStart = null;
  panMoved = false;
}

function handleStageClick(event) {
  if (panJustEnded) {
    panJustEnded = false;
    return;
  }
  if (state.mode === 'cut') {
    panJustEnded = false;
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('.panel, .bubble, .handle')) {
    panJustEnded = false;
    return;
  }
  clearSelection();
  panJustEnded = false;
}

function createPanel(points, layerIndex = state.layers.length, options = {}) {
  const { select = true, refreshLayers: shouldRefresh = true } = options;
  const id = createId();
  const panel = {
    id,
    points,
    element: null,
    image: {
      src: '',
      baseScale: 1,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      flipX: false,
      hue: 0,
      saturation: 100,
      contrast: 100,
      naturalWidth: 0,
      naturalHeight: 0
    }
  };

  const panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.dataset.id = id;
  panelEl.innerHTML = `
    <svg class="panel-outline" preserveAspectRatio="none">
      <polygon points="" />
    </svg>
    <div class="image-wrapper">
      <div class="placeholder">双击或在左侧上传图片</div>
      <div class="image-positioner">
        <img class="panel-image" alt="">
      </div>
    </div>
  `;
  panelEl.addEventListener('click', (event) => event.stopPropagation());
  panelEl.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    if (event.button !== 0 && event.button !== 2) {
      return;
    }
    selectPanel(id);
    if (event.target.classList.contains('handle') || event.button !== 0) {
      return;
    }
    startMovingPanel(panel, event);
  });
  panelEl.addEventListener('dblclick', () => {
    selectPanel(id);
    panelImageInput.click();
  });

  const outlineSvg = panelEl.querySelector('.panel-outline');
  outlineSvg.setAttribute('overflow', 'visible');
  const outlinePolygon = outlineSvg.querySelector('polygon');
  panel.outline = { svg: outlineSvg, polygon: outlinePolygon };

  const imageWrapper = panelEl.querySelector('.image-wrapper');
  const imgEl = panelEl.querySelector('img');
  imageWrapper.addEventListener('wheel', (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectPanel(id);
    if (!panel.image.src) return;
    handlePanelImageWheel(panel, event);
  }, { passive: false });
  imageWrapper.addEventListener('contextmenu', (event) => event.preventDefault());
  imageWrapper.addEventListener('mousedown', (event) => {
    if (event.button === 2 && panel.image.src) {
      event.preventDefault();
      selectPanel(id);
      startImageDrag(panel, event);
    }
  });

  imgEl.draggable = false;

  panel.element = panelEl;
  pageEl.appendChild(panelEl);
  state.panels.push(panel);
  const insertIndex = Math.max(0, Math.min(layerIndex, state.layers.length));
  state.layers.splice(insertIndex, 0, { type: 'panel', id });
  updatePanelElement(panel);
  if (shouldRefresh) {
    refreshLayers();
  }
  if (select) {
    selectPanel(id);
  }
  return panel;
}

function updatePanelElement(panel) {
  if (state.comicAreaRect) {
    panel.points = panel.points.map((point) => clampPointToArea(point));
  }
  const metrics = computePanelMetrics(panel.points);
  const { minX, minY, width, height, clipPath } = metrics;
  panel.metrics = metrics;
  const el = panel.element;
  el.style.left = `${minX}px`;
  el.style.top = `${minY}px`;
  el.style.width = `${Math.max(width, 1)}px`;
  el.style.height = `${Math.max(height, 1)}px`;
  el.style.clipPath = clipPath;
  if (panel.outline) {
    const localPoints = panel.points.map((point) => ({
      x: point.x - minX,
      y: point.y - minY
    }));
    const { svg, polygon } = panel.outline;
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    svg.setAttribute('viewBox', `0 0 ${safeWidth} ${safeHeight}`);
    polygon.setAttribute('points', localPoints.map((point) => `${point.x},${point.y}`).join(' '));
  }
  recomputeBaseScale(panel);
  updatePanelImage(panel);
  if (state.selectedPanelId === panel.id) {
    updateHandles(panel);
  }
}

function updatePanelImage(panel) {
  const imgEl = panel.element.querySelector('img');
  const placeholder = panel.element.querySelector('.placeholder');
  if (!panel.image.src) {
    imgEl.src = '';
    placeholder.style.display = 'grid';
    imgEl.style.display = 'none';
    return;
  }

  if (imgEl.src !== panel.image.src) {
    imgEl.onload = () => {
      const { width, height } = panel.metrics;
      if (width && height) {
        const fitScale = Math.max(width / imgEl.naturalWidth, height / imgEl.naturalHeight);
        panel.image.baseScale = fitScale;
        panel.image.scale = 1;
        panel.image.offsetX = 0;
        panel.image.offsetY = 0;
        panel.image.rotation = 0;
        panel.image.flipX = false;
        panel.image.naturalWidth = imgEl.naturalWidth;
        panel.image.naturalHeight = imgEl.naturalHeight;
        syncImageControls(panel);
        applyImageTransform(panel);
      }
    };
    imgEl.src = panel.image.src;
  }
  placeholder.style.display = 'none';
  imgEl.style.display = 'block';
  applyImageTransform(panel);
}

function applyImageTransform(panel) {
  const imgEl = panel.element.querySelector('img');
  const { baseScale, scale, offsetX, offsetY, rotation, flipX, hue, saturation, contrast } = panel.image;
  const actualScaleX = (flipX ? -1 : 1) * baseScale * scale;
  const actualScaleY = baseScale * scale;
  imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${actualScaleX}, ${actualScaleY})`;
  imgEl.style.filter = `hue-rotate(${hue}deg) saturate(${saturation}%) contrast(${contrast}%)`;
  imgEl.style.userSelect = 'none';
}

function handlePanelImageWheel(panel, event) {
  const delta = -event.deltaY;
  const scaleFactor = Math.exp(delta * 0.0015);
  const newScale = clampNumber(panel.image.scale * scaleFactor, 0.2, 5);
  if (!Number.isFinite(newScale)) return;
  panel.image.scale = newScale;
  applyImageTransform(panel);
}

function startImageDrag(panel, event) {
  const startPoint = clientToPagePoint(event.clientX, event.clientY);
  imageDragState = {
    panelId: panel.id,
    startX: startPoint.x,
    startY: startPoint.y,
    originOffsetX: panel.image.offsetX,
    originOffsetY: panel.image.offsetY
  };
  document.addEventListener('mousemove', onImageDragMove);
  document.addEventListener('mouseup', stopImageDrag);
}

function onImageDragMove(event) {
  if (!imageDragState) return;
  const panel = state.panels.find((p) => p.id === imageDragState.panelId);
  if (!panel) return;
  const point = clientToPagePoint(event.clientX, event.clientY);
  const dx = point.x - imageDragState.startX;
  const dy = point.y - imageDragState.startY;
  panel.image.offsetX = imageDragState.originOffsetX + dx;
  panel.image.offsetY = imageDragState.originOffsetY + dy;
  applyImageTransform(panel);
}

function stopImageDrag() {
  if (!imageDragState) return;
  imageDragState = null;
  document.removeEventListener('mousemove', onImageDragMove);
  document.removeEventListener('mouseup', stopImageDrag);
}

function recomputeBaseScale(panel) {
  if (!panel.image.src || !panel.image.naturalWidth || !panel.image.naturalHeight) {
    return;
  }
  const { width, height } = panel.metrics || {};
  if (!width || !height) return;
  const actualScale = panel.image.baseScale * panel.image.scale;
  const newBase = Math.max(width / panel.image.naturalWidth, height / panel.image.naturalHeight);
  if (!Number.isFinite(newBase) || newBase <= 0) return;
  panel.image.baseScale = newBase;
  panel.image.scale = actualScale / newBase;
  if (state.selectedPanelId === panel.id) {
    syncImageControls(panel);
  }
}

function computePanelMetrics(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const clipParts = points.map((point) => {
    const xPercent = width === 0 ? 0 : ((point.x - minX) / (width || 1)) * 100;
    const yPercent = height === 0 ? 0 : ((point.y - minY) / (height || 1)) * 100;
    return `${xPercent}% ${yPercent}%`;
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    clipPath: `polygon(${clipParts.join(', ')})`
  };
}

pageEl.addEventListener('mousedown', (event) => {
  if (state.mode === 'cut') {
    startCut(event);
    return;
  }
  if (shouldStartPan(event)) {
    startPan(event);
    return;
  }
  if (
    !event.target.closest('.panel') &&
    !event.target.closest('.bubble') &&
    !event.target.closest('.handle')
  ) {
    clearSelection();
  }
});

function startCut(event) {
  const areaRect = state.comicAreaRect;
  if (!areaRect || areaRect.width <= 0 || areaRect.height <= 0) {
    return;
  }
  cancelCutState();
  const startPoint = clientToPagePoint(event.clientX, event.clientY);
  const x = clampNumber(startPoint.x, areaRect.left, areaRect.right);
  const y = clampNumber(startPoint.y, areaRect.top, areaRect.bottom);

  const basePanel = findPanelAtPoint(x, y);
  const basePoints = basePanel ? basePanel.points.map((p) => ({ ...p })) : getAreaPolygon();
  if (!basePoints) {
    return;
  }

  let layerIndex;
  if (basePanel) {
    layerIndex = state.layers.findIndex((layer) => layer.type === 'panel' && layer.id === basePanel.id);
  } else {
    const bubbleIndex = state.layers.findIndex((layer) => layer.type === 'bubble');
    layerIndex = bubbleIndex === -1 ? state.layers.length : bubbleIndex;
  }
  if (layerIndex < 0) {
    layerIndex = 0;
  }

  cutState = {
    startX: x,
    startY: y,
    currentX: x,
    currentY: y,
    orientation: null,
    basePoints,
    panel: basePanel,
    layerIndex,
    overlay: createCutOverlay()
  };

  pageEl.appendChild(cutState.overlay.svg);
  updateCutOverlay();
  document.addEventListener('mousemove', onCutMove);
  document.addEventListener('mouseup', finishCut);
}

function onCutMove(event) {
  if (!cutState) return;
  const areaRect = state.comicAreaRect;
  if (!areaRect) return;
  const point = clientToPagePoint(event.clientX, event.clientY);
  const x = clampNumber(point.x, areaRect.left, areaRect.right);
  const y = clampNumber(point.y, areaRect.top, areaRect.bottom);
  cutState.currentX = x;
  cutState.currentY = y;

  if (!cutState.orientation) {
    const dx = x - cutState.startX;
    const dy = y - cutState.startY;
    if (Math.hypot(dx, dy) > 4) {
      cutState.orientation = Math.abs(dy) >= Math.abs(dx) ? 'horizontal' : 'vertical';
    }
  }
  updateCutOverlay();
}

function finishCut(event) {
  document.removeEventListener('mousemove', onCutMove);
  document.removeEventListener('mouseup', finishCut);
  if (!cutState) return;
  const areaRect = state.comicAreaRect;
  if (!areaRect) {
    cancelCutState();
    return;
  }
  const point = clientToPagePoint(event.clientX, event.clientY);
  const x = clampNumber(point.x, areaRect.left, areaRect.right);
  const y = clampNumber(point.y, areaRect.top, areaRect.bottom);
  cutState.currentX = x;
  cutState.currentY = y;
  if (!cutState.orientation) {
    cancelCutState();
    return;
  }
  const geometry = computeSplitGeometry(cutState.basePoints, cutState.orientation, x, y);
  if (!geometry) {
    cancelCutState();
    return;
  }
  applySplitGeometry(cutState, geometry);
  cancelCutState();
}

function createCutOverlay() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('cut-overlay');
  svg.setAttribute('width', state.page.width.toString());
  svg.setAttribute('height', state.page.height.toString());
  svg.style.position = 'absolute';
  svg.style.left = '0px';
  svg.style.top = '0px';
  svg.style.pointerEvents = 'none';
  svg.style.display = 'none';

  const polygon = document.createElementNS(SVG_NS, 'polygon');
  polygon.setAttribute('fill', 'rgba(59, 130, 246, 0.3)');
  polygon.setAttribute('points', '');
  svg.appendChild(polygon);

  const lineA = document.createElementNS(SVG_NS, 'line');
  const lineB = document.createElementNS(SVG_NS, 'line');
  [lineA, lineB].forEach((line) => {
    line.setAttribute('stroke', '#000');
    line.setAttribute('stroke-width', state.comicArea.frameThickness.toString());
    line.setAttribute('stroke-linecap', 'square');
    svg.appendChild(line);
  });

  return { svg, polygon, lines: [lineA, lineB] };
}

function updateCutOverlay() {
  if (!cutState || !cutState.overlay) return;
  if (!cutState.orientation) {
    cutState.overlay.svg.style.display = 'none';
    return;
  }
  const geometry = computeSplitGeometry(
    cutState.basePoints,
    cutState.orientation,
    cutState.currentX,
    cutState.currentY
  );
  if (!geometry) {
    cutState.overlay.svg.style.display = 'none';
    return;
  }
  cutState.overlay.svg.style.display = 'block';
  cutState.overlay.polygon.setAttribute('points', geometry.gapPolygon.map(formatPoint).join(' '));
  cutState.overlay.lines[0].setAttribute('x1', geometry.edgeLines[0][0].x);
  cutState.overlay.lines[0].setAttribute('y1', geometry.edgeLines[0][0].y);
  cutState.overlay.lines[0].setAttribute('x2', geometry.edgeLines[0][1].x);
  cutState.overlay.lines[0].setAttribute('y2', geometry.edgeLines[0][1].y);
  cutState.overlay.lines[1].setAttribute('x1', geometry.edgeLines[1][0].x);
  cutState.overlay.lines[1].setAttribute('y1', geometry.edgeLines[1][0].y);
  cutState.overlay.lines[1].setAttribute('x2', geometry.edgeLines[1][1].x);
  cutState.overlay.lines[1].setAttribute('y2', geometry.edgeLines[1][1].y);
}

function cancelCutState() {
  document.removeEventListener('mousemove', onCutMove);
  document.removeEventListener('mouseup', finishCut);
  if (cutState && cutState.overlay) {
    cutState.overlay.svg.remove();
  }
  cutState = null;
}

function computeSplitGeometry(points, orientation, x, y) {
  const param = computeSplitParam(points, orientation, x, y);
  if (param === null) return null;
  const gap = orientation === 'horizontal' ? state.slicing.gapY : state.slicing.gapX;
  return buildSplitGeometry(points, orientation, param, gap);
}

function computeSplitParam(points, orientation, x, y) {
  if (orientation === 'horizontal') {
    const leftParam = projectParam(points[0], points[3], y, 'y');
    const rightParam = projectParam(points[1], points[2], y, 'y');
    const params = [leftParam, rightParam].filter((value) => Number.isFinite(value));
    if (!params.length) return null;
    const average = params.reduce((sum, value) => sum + value, 0) / params.length;
    return clampParam(average);
  }
  const topParam = projectParam(points[0], points[1], x, 'x');
  const bottomParam = projectParam(points[3], points[2], x, 'x');
  const params = [topParam, bottomParam].filter((value) => Number.isFinite(value));
  if (!params.length) return null;
  const average = params.reduce((sum, value) => sum + value, 0) / params.length;
  return clampParam(average);
}

function buildSplitGeometry(points, orientation, param, gap) {
  const safeParam = clampParam(param);
  if (safeParam === null) {
    return null;
  }
  const safeGap = Math.max(0, gap);
  const minExtent = 30;

  if (orientation === 'horizontal') {
    const leftLength = distanceBetween(points[0], points[3]);
    const rightLength = distanceBetween(points[1], points[2]);
    const averageLength = (leftLength + rightLength) / 2;
    if (averageLength <= safeGap + 1) {
      return null;
    }
    let upperParam = safeParam;
    let lowerParam = safeParam;
    if (safeGap > 0) {
      const halfRatio = (safeGap / (averageLength || 1)) / 2;
      upperParam = clampParam(safeParam - halfRatio);
      lowerParam = clampParam(safeParam + halfRatio);
      if (upperParam === null || lowerParam === null || lowerParam <= upperParam) {
        return null;
      }
    }

    const topPanel = [
      points[0],
      points[1],
      interpolatePoint(points[1], points[2], upperParam),
      interpolatePoint(points[0], points[3], upperParam)
    ];
    const bottomPanel = [
      interpolatePoint(points[0], points[3], lowerParam),
      interpolatePoint(points[1], points[2], lowerParam),
      points[2],
      points[3]
    ];

    const topSpan = averageEdgeDistance(points[0], points[1], topPanel[3], topPanel[2]);
    const bottomSpan = averageEdgeDistance(bottomPanel[0], bottomPanel[1], points[3], points[2]);
    if (topSpan < minExtent || bottomSpan < minExtent) {
      return null;
    }

    const gapPolygon = [topPanel[3], topPanel[2], bottomPanel[1], bottomPanel[0]];
    return {
      first: topPanel,
      second: bottomPanel,
      gapPolygon,
      edgeLines: [
        [topPanel[3], topPanel[2]],
        [bottomPanel[0], bottomPanel[1]]
      ]
    };
  }

  const topLength = distanceBetween(points[0], points[1]);
  const bottomLength = distanceBetween(points[3], points[2]);
  const averageLength = (topLength + bottomLength) / 2;
  if (averageLength <= safeGap + 1) {
    return null;
  }

  let leftParam = safeParam;
  let rightParam = safeParam;
  if (safeGap > 0) {
    const halfRatio = (safeGap / (averageLength || 1)) / 2;
    leftParam = clampParam(safeParam - halfRatio);
    rightParam = clampParam(safeParam + halfRatio);
    if (leftParam === null || rightParam === null || rightParam <= leftParam) {
      return null;
    }
  }

  const leftPanel = [
    points[0],
    interpolatePoint(points[0], points[1], leftParam),
    interpolatePoint(points[3], points[2], leftParam),
    points[3]
  ];
  const rightPanel = [
    interpolatePoint(points[0], points[1], rightParam),
    points[1],
    points[2],
    interpolatePoint(points[3], points[2], rightParam)
  ];

  const leftSpan = averageEdgeDistance(points[0], points[3], leftPanel[1], leftPanel[2]);
  const rightSpan = averageEdgeDistance(rightPanel[0], rightPanel[3], points[1], points[2]);
  if (leftSpan < minExtent || rightSpan < minExtent) {
    return null;
  }

  const gapPolygon = [leftPanel[1], rightPanel[0], rightPanel[3], leftPanel[2]];
  return {
    first: leftPanel,
    second: rightPanel,
    gapPolygon,
    edgeLines: [
      [leftPanel[1], leftPanel[2]],
      [rightPanel[0], rightPanel[3]]
    ]
  };
}

function applySplitGeometry(stateInfo, geometry) {
  const insertIndex = Math.max(0, Math.min(stateInfo.layerIndex, state.layers.length));
  if (stateInfo.panel) {
    removePanelById(stateInfo.panel.id);
  }

  state.selectedPanelId = null;
  state.selectedBubbleId = null;
  removeHandles();
  enablePanelControls(false);
  enableBubbleControls(false);

  createPanel(geometry.first, insertIndex, { select: false, refreshLayers: false });
  createPanel(geometry.second, insertIndex + 1, { select: false, refreshLayers: false });
  state.mode = 'cut';
  pageEl.dataset.mode = 'cut';
  toggleDrawBtn.textContent = '结束切分格子';
  refreshLayers();
}

function removePanelById(id) {
  const index = state.panels.findIndex((panel) => panel.id === id);
  if (index >= 0) {
    state.panels[index].element.remove();
    state.panels.splice(index, 1);
  }
  state.layers = state.layers.filter((layer) => !(layer.type === 'panel' && layer.id === id));
}

function projectParam(a, b, value, axis) {
  const delta = axis === 'y' ? b.y - a.y : b.x - a.x;
  if (Math.abs(delta) < 1e-6) return null;
  const start = axis === 'y' ? a.y : a.x;
  return (value - start) / delta;
}

function clampParam(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function interpolatePoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averageEdgeDistance(a1, a2, b1, b2) {
  return (distanceBetween(a1, b1) + distanceBetween(a2, b2)) / 2;
}

function clampPointToArea(point) {
  const rect = state.comicAreaRect;
  if (!rect) return { ...point };
  return {
    x: clampNumber(point.x, rect.left, rect.right),
    y: clampNumber(point.y, rect.top, rect.bottom)
  };
}

function formatPoint(point) {
  return `${point.x},${point.y}`;
}

function findPanelAtPoint(x, y) {
  for (let i = state.layers.length - 1; i >= 0; i -= 1) {
    const layer = state.layers[i];
    if (layer.type !== 'panel') continue;
    const panel = state.panels.find((p) => p.id === layer.id);
    if (panel && pointInPolygon({ x, y }, panel.points)) {
      return panel;
    }
  }
  return null;
}

function getAreaPolygon() {
  const rect = state.comicAreaRect;
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom }
  ];
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function updateHandles(panel) {
  removeHandles();
  const corners = [0, 1, 2, 3];
  corners.forEach((index) => {
    const handle = document.createElement('div');
    handle.className = `handle corner-${index}`;
    handle.dataset.type = 'corner';
    handle.dataset.index = index.toString();
    const point = panel.points[index];
    handle.style.left = `${point.x}px`;
    handle.style.top = `${point.y}px`;
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      startHandleDrag(panel, { type: 'corner', index }, event);
    });
    pageEl.appendChild(handle);
  });

  const edges = [
    { name: 'top', indices: [0, 1], className: 'edge-horizontal' },
    { name: 'right', indices: [1, 2], className: 'edge-vertical' },
    { name: 'bottom', indices: [2, 3], className: 'edge-horizontal' },
    { name: 'left', indices: [3, 0], className: 'edge-vertical' }
  ];
  edges.forEach((edge) => {
    const handle = document.createElement('div');
    handle.className = `handle ${edge.className}`;
    handle.dataset.type = 'edge';
    handle.dataset.edge = edge.name;
    const pointA = panel.points[edge.indices[0]];
    const pointB = panel.points[edge.indices[1]];
    handle.style.left = `${(pointA.x + pointB.x) / 2}px`;
    handle.style.top = `${(pointA.y + pointB.y) / 2}px`;
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      startHandleDrag(panel, { type: 'edge', edge: edge.name }, event);
    });
    pageEl.appendChild(handle);
  });
}

function removeHandles() {
  document.querySelectorAll('.handle').forEach((handle) => handle.remove());
}

function startHandleDrag(panel, handleInfo, event) {
  const startPoint = clientToPagePoint(event.clientX, event.clientY);
  handleState = {
    panelId: panel.id,
    type: handleInfo.type,
    index: handleInfo.index ?? null,
    edge: handleInfo.edge ?? null,
    startX: startPoint.x,
    startY: startPoint.y,
    originalPoints: panel.points.map((point) => ({ ...point }))
  };
  document.addEventListener('mousemove', onHandleMove);
  document.addEventListener('mouseup', stopHandleDrag);
  event.preventDefault();
}

function onHandleMove(event) {
  if (!handleState) return;
  const panel = state.panels.find((p) => p.id === handleState.panelId);
  if (!panel) return;
  const areaRect = state.comicAreaRect;
  if (!areaRect) return;
  if (handleState.type === 'corner' && handleState.index !== null) {
    const point = clientToPagePoint(event.clientX, event.clientY);
    const x = clampNumber(point.x, areaRect.left, areaRect.right);
    const y = clampNumber(point.y, areaRect.top, areaRect.bottom);
    panel.points[handleState.index] = { x, y };
    updatePanelElement(panel);
    showTooltip(event.clientX, event.clientY, `${Math.round(x)}, ${Math.round(y)}`);
    return;
  }

  const point = clientToPagePoint(event.clientX, event.clientY);
  const dx = point.x - handleState.startX;
  const dy = point.y - handleState.startY;
  const newPoints = handleState.originalPoints.map((point) => ({ ...point }));

  if (handleState.type === 'edge') {
    if (handleState.edge === 'top') {
      const newY = clampNumber(handleState.originalPoints[0].y + dy, areaRect.top, areaRect.bottom);
      [0, 1].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: handleState.originalPoints[idx].x,
          y: newY
        });
      });
    } else if (handleState.edge === 'right') {
      const newX = clampNumber(handleState.originalPoints[1].x + dx, areaRect.left, areaRect.right);
      [1, 2].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: newX,
          y: handleState.originalPoints[idx].y
        });
      });
    } else if (handleState.edge === 'bottom') {
      const newY = clampNumber(handleState.originalPoints[2].y + dy, areaRect.top, areaRect.bottom);
      [2, 3].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: handleState.originalPoints[idx].x,
          y: newY
        });
      });
    } else if (handleState.edge === 'left') {
      const newX = clampNumber(handleState.originalPoints[3].x + dx, areaRect.left, areaRect.right);
      [3, 0].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: newX,
          y: handleState.originalPoints[idx].y
        });
      });
    }
    panel.points = newPoints;
    updatePanelElement(panel);
    const indices = handleState.edge === 'top' ? [0, 1]
      : handleState.edge === 'right' ? [1, 2]
        : handleState.edge === 'bottom' ? [2, 3]
          : [3, 0];
    const pointA = panel.points[indices[0]];
    const pointB = panel.points[indices[1]];
    const midX = (pointA.x + pointB.x) / 2;
    const midY = (pointA.y + pointB.y) / 2;
    showTooltip(event.clientX, event.clientY, `${Math.round(midX)}, ${Math.round(midY)}`);
  }
}

function stopHandleDrag() {
  tooltip.hidden = true;
  tooltip.style.opacity = 0;
  handleState = null;
  document.removeEventListener('mousemove', onHandleMove);
  document.removeEventListener('mouseup', stopHandleDrag);
}

function showTooltip(x, y, text) {
  tooltip.textContent = text;
  tooltip.style.left = `${x + 12}px`;
  tooltip.style.top = `${y + 12}px`;
  tooltip.hidden = false;
  requestAnimationFrame(() => {
    tooltip.style.opacity = 1;
  });
}

function selectPanel(id) {
  state.selectedPanelId = id;
  state.selectedBubbleId = null;
  state.mode = 'view';
  toggleDrawBtn.textContent = '开始切分格子';
  pageEl.dataset.mode = 'view';
  Array.from(document.querySelectorAll('.panel')).forEach((panelEl) => {
    panelEl.classList.toggle('selected', panelEl.dataset.id === id);
  });
  Array.from(document.querySelectorAll('.bubble')).forEach((bubbleEl) => {
    bubbleEl.classList.remove('selected');
  });
  removeBubbleHandles();
  const panel = state.panels.find((p) => p.id === id);
  if (panel) {
    updateHandles(panel);
    syncImageControls(panel);
    enablePanelControls(true);
  }
  enableBubbleControls(false);
  refreshLayers();
}

function selectBubble(id) {
  state.selectedBubbleId = id;
  state.selectedPanelId = null;
  state.mode = 'view';
  pageEl.dataset.mode = 'view';
  Array.from(document.querySelectorAll('.panel')).forEach((panelEl) => {
    panelEl.classList.remove('selected');
  });
  Array.from(document.querySelectorAll('.bubble')).forEach((bubbleEl) => {
    bubbleEl.classList.toggle('selected', bubbleEl.dataset.id === id);
  });
  removeHandles();
  removeBubbleHandles();
  enablePanelControls(false);
  stopEditingAllBubbles();
  const bubble = state.bubbles.find((b) => b.id === id);
  if (bubble) {
    syncBubbleControls(bubble);
    enableBubbleControls(true);
    updateBubbleHandles(bubble);
  }
  refreshLayers();
}

function clearSelection() {
  state.selectedPanelId = null;
  state.selectedBubbleId = null;
  state.mode = 'view';
  toggleDrawBtn.textContent = '开始切分格子';
  pageEl.dataset.mode = 'view';
  Array.from(document.querySelectorAll('.panel')).forEach((panelEl) => panelEl.classList.remove('selected'));
  Array.from(document.querySelectorAll('.bubble')).forEach((bubbleEl) => bubbleEl.classList.remove('selected'));
  removeHandles();
  removeBubbleHandles();
  enablePanelControls(false);
  enableBubbleControls(false);
  stopEditingAllBubbles();
  refreshLayers();
}

function enablePanelControls(enabled) {
  [deletePanelBtn, panelImageInput, imageRotationInput, imageFlipBtn, filterHueInput, filterSaturationInput, filterContrastInput].forEach((el) => {
    el.disabled = !enabled;
  });
}

function enableBubbleControls(enabled) {
  [deleteBubbleBtn, bubbleTypeSelect, bubbleFontSizeInput, bubblePaddingInput, bubbleStrokeInput, bubbleTextInput].forEach((el
  ) => {
    if (!el) return;
    el.disabled = !enabled;
  });
}

function deletePanelById(id) {
  if (!id) return;
  const index = state.panels.findIndex((p) => p.id === id);
  if (index >= 0) {
    state.panels[index].element.remove();
    state.panels.splice(index, 1);
  }
  state.layers = state.layers.filter((layer) => !(layer.type === 'panel' && layer.id === id));
  if (state.selectedPanelId === id) {
    state.selectedPanelId = null;
    removeHandles();
    enablePanelControls(false);
  }
  refreshLayers();
}

function deleteBubbleById(id) {
  if (!id) return;
  const index = state.bubbles.findIndex((b) => b.id === id);
  if (index >= 0) {
    state.bubbles[index].element.remove();
    state.bubbles.splice(index, 1);
  }
  state.layers = state.layers.filter((layer) => !(layer.type === 'bubble' && layer.id === id));
  if (state.selectedBubbleId === id) {
    state.selectedBubbleId = null;
    removeBubbleHandles();
    enableBubbleControls(false);
  }
  refreshLayers();
}

deletePanelBtn.addEventListener('click', () => {
  if (!state.selectedPanelId) return;
  deletePanelById(state.selectedPanelId);
});

panelImageInput.addEventListener('change', (event) => {
  const panel = getSelectedPanel();
  if (!panel) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    panel.image.src = String(loadEvent.target?.result || '');
    updatePanelImage(panel);
  };
  reader.readAsDataURL(file);
  panelImageInput.value = '';
});

imageRotationInput.addEventListener('input', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.rotation = parseFloat(imageRotationInput.value) || 0;
  applyImageTransform(panel);
});

imageFlipBtn.addEventListener('click', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.flipX = !panel.image.flipX;
  applyImageTransform(panel);
});

filterHueInput.addEventListener('input', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.hue = parseInt(filterHueInput.value, 10) || 0;
  applyImageTransform(panel);
});

filterSaturationInput.addEventListener('input', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.saturation = parseInt(filterSaturationInput.value, 10) || 100;
  applyImageTransform(panel);
});

filterContrastInput.addEventListener('input', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.contrast = parseInt(filterContrastInput.value, 10) || 100;
  applyImageTransform(panel);
});

function syncImageControls(panel) {
  imageRotationInput.value = panel.image.rotation.toString();
  filterHueInput.value = panel.image.hue.toString();
  filterSaturationInput.value = panel.image.saturation.toString();
  filterContrastInput.value = panel.image.contrast.toString();
}

function getSelectedPanel() {
  return state.panels.find((panel) => panel.id === state.selectedPanelId) || null;
}

function startMovingPanel(panel, event) {
  const startPoint = clientToPagePoint(event.clientX, event.clientY);
  movingPanelState = {
    panelId: panel.id,
    startX: startPoint.x,
    startY: startPoint.y,
    originalPoints: panel.points.map((p) => ({ ...p }))
  };
  document.addEventListener('mousemove', movePanel);
  document.addEventListener('mouseup', stopMovingPanel);
  event.preventDefault();
}

function movePanel(event) {
  if (!movingPanelState) return;
  const panel = state.panels.find((p) => p.id === movingPanelState.panelId);
  if (!panel) return;
  const point = clientToPagePoint(event.clientX, event.clientY);
  const dx = point.x - movingPanelState.startX;
  const dy = point.y - movingPanelState.startY;
  const areaRect = state.comicAreaRect;
  if (areaRect) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    movingPanelState.originalPoints.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
    const clampedDx = clampNumber(dx, areaRect.left - minX, areaRect.right - maxX);
    const clampedDy = clampNumber(dy, areaRect.top - minY, areaRect.bottom - maxY);
    panel.points = movingPanelState.originalPoints.map((point) => ({
      x: point.x + clampedDx,
      y: point.y + clampedDy
    }));
  } else {
    panel.points = movingPanelState.originalPoints.map((point) => ({
      x: clampNumber(point.x + dx, 0, state.page.width),
      y: clampNumber(point.y + dy, 0, state.page.height)
    }));
  }
  updatePanelElement(panel);
}

function stopMovingPanel() {
  movingPanelState = null;
  document.removeEventListener('mousemove', movePanel);
  document.removeEventListener('mouseup', stopMovingPanel);
}

function refreshAllPanels() {
  state.panels.forEach((panel) => updatePanelElement(panel));
}

function refreshLayers() {
  layerList.innerHTML = '';
  const items = [...state.layers];
  items.forEach((layer, index) => {
    const li = document.createElement('li');
    li.dataset.index = index.toString();
    const isSelected = (layer.type === 'panel' && layer.id === state.selectedPanelId) ||
      (layer.type === 'bubble' && layer.id === state.selectedBubbleId);
    li.classList.toggle('active', isSelected);
    li.innerHTML = `
      <span>${layer.type === 'panel' ? '格子' : '对话框'} ${index + 1}</span>
      <span class="layer-actions">
        <button type="button" data-action="up">上移</button>
        <button type="button" data-action="down">下移</button>
        <button type="button" data-action="delete">删除</button>
      </span>
    `;
    li.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.action) {
        event.stopPropagation();
        if (target.dataset.action === 'up') {
          moveLayer(index, index - 1);
        } else if (target.dataset.action === 'down') {
          moveLayer(index, index + 1);
        } else if (target.dataset.action === 'delete') {
          if (layer.type === 'panel') {
            deletePanelById(layer.id);
          } else {
            deleteBubbleById(layer.id);
          }
        }
        return;
      }
      if (layer.type === 'panel') {
        selectPanel(layer.id);
      } else {
        selectBubble(layer.id);
      }
    });
    layerList.appendChild(li);
  });
  applyLayerZIndices();
}

function moveLayer(from, to) {
  if (to < 0 || to >= state.layers.length) return;
  const [item] = state.layers.splice(from, 1);
  state.layers.splice(to, 0, item);
  refreshLayers();
}

function applyLayerZIndices() {
  state.layers.forEach((layer, index) => {
    const zIndex = 10 + index;
    if (layer.type === 'panel') {
      const panel = state.panels.find((p) => p.id === layer.id);
      if (panel) panel.element.style.zIndex = zIndex.toString();
    } else {
      const bubble = state.bubbles.find((b) => b.id === layer.id);
      if (bubble) bubble.element.style.zIndex = zIndex.toString();
    }
  });
}

function addBubble() {
  const id = createId();
  const width = 220;
  const height = 160;
  const bubble = {
    id,
    type: 'ellipse',
    x: 120,
    y: 120,
    width,
    height,
    fontSize: 24,
    padding: 16,
    text: '请输入对白',
    strokeWidth: 5,
    tail: { x: 120 + width / 2, y: 120 + height + 40 }
  };

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  bubbleEl.dataset.id = id;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('bubble-svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('overflow', 'visible');
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.classList.add('bubble-shape');
  svg.appendChild(shape);
  bubbleEl.appendChild(svg);

  const content = document.createElement('div');
  content.className = 'bubble-content';
  content.contentEditable = 'false';
  content.style.fontSize = `${bubble.fontSize}px`;
  content.textContent = bubble.text;
  content.addEventListener('input', () => {
    bubble.text = content.textContent || '';
    bubbleTextInput.value = bubble.text;
  });
  content.addEventListener('blur', () => {
    content.contentEditable = 'false';
  });
  bubbleEl.appendChild(content);

  bubbleEl.addEventListener('click', (event) => {
    event.stopPropagation();
    selectBubble(id);
  });
  bubbleEl.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
      event.preventDefault();
      selectBubble(id);
      startMovingBubble(bubble, event);
    }
  });
  bubbleEl.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  bubbleEl.addEventListener('dblclick', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.bubble-handle')) return;
    event.stopPropagation();
    selectBubble(id);
    startBubbleEditing(bubble);
  });

  bubble.element = bubbleEl;
  bubble.contentEl = content;
  bubble.svgEl = svg;
  bubble.shapeEl = shape;

  pageEl.appendChild(bubbleEl);
  state.bubbles.push(bubble);
  state.layers.push({ type: 'bubble', id });
  updateBubbleElement(bubble);
  refreshLayers();
  selectBubble(id);
}

addBubbleBtn.addEventListener('click', addBubble);

deleteBubbleBtn.addEventListener('click', () => {
  if (!state.selectedBubbleId) return;
  deleteBubbleById(state.selectedBubbleId);
});

bubbleTypeSelect.addEventListener('change', () => {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.type = bubbleTypeSelect.value;
  if (bubble.type === 'pointer') {
    ensureBubbleTail(bubble);
  }
  updateBubbleElement(bubble);
});

bubbleFontSizeInput.addEventListener('input', () => {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.fontSize = parseInt(bubbleFontSizeInput.value, 10) || 16;
  updateBubbleElement(bubble);
});

bubblePaddingInput.addEventListener('input', () => {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.padding = parseInt(bubblePaddingInput.value, 10) || 0;
  updateBubbleElement(bubble);
});

if (bubbleStrokeInput) {
  bubbleStrokeInput.addEventListener('input', () => {
    const bubble = getSelectedBubble();
    if (!bubble) return;
    bubble.strokeWidth = clampNumber(parseInt(bubbleStrokeInput.value, 10) || 1, 1, 20);
    updateBubbleElement(bubble);
  });
}

bubbleTextInput.addEventListener('input', () => {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.text = bubbleTextInput.value;
  bubble.contentEl.textContent = bubble.text;
});

function getSelectedBubble() {
  return state.bubbles.find((bubble) => bubble.id === state.selectedBubbleId) || null;
}

function syncBubbleControls(bubble) {
  bubbleTypeSelect.value = bubble.type;
  bubbleFontSizeInput.value = bubble.fontSize.toString();
  bubblePaddingInput.value = bubble.padding.toString();
  bubbleTextInput.value = bubble.text;
  if (bubbleStrokeInput) {
    bubbleStrokeInput.value = (bubble.strokeWidth || 5).toString();
  }
}

function stopEditingAllBubbles() {
  state.bubbles.forEach((bubble) => {
    if (bubble.contentEl) {
      bubble.contentEl.contentEditable = 'false';
      bubble.contentEl.blur();
    }
  });
}

function startBubbleEditing(bubble) {
  if (!bubble || !bubble.contentEl) return;
  stopEditingAllBubbles();
  bubble.contentEl.contentEditable = 'true';
  bubble.contentEl.focus();
  const selection = window.getSelection();
  if (selection && bubble.contentEl.firstChild) {
    const range = document.createRange();
    range.selectNodeContents(bubble.contentEl);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function startMovingBubble(bubble, event) {
  const startPoint = clientToPagePoint(event.clientX, event.clientY);
  movingBubbleState = {
    id: bubble.id,
    startX: startPoint.x,
    startY: startPoint.y,
    originalX: bubble.x,
    originalY: bubble.y
  };
  document.addEventListener('mousemove', onBubbleMove);
  document.addEventListener('mouseup', stopMovingBubble);
  event.preventDefault();
}

function onBubbleMove(event) {
  if (!movingBubbleState) return;
  const bubble = state.bubbles.find((b) => b.id === movingBubbleState.id);
  if (!bubble) return;
  const point = clientToPagePoint(event.clientX, event.clientY);
  const dx = point.x - movingBubbleState.startX;
  const dy = point.y - movingBubbleState.startY;
  const newX = clampNumber(movingBubbleState.originalX + dx, 0, state.page.width - bubble.width);
  const newY = clampNumber(movingBubbleState.originalY + dy, 0, state.page.height - bubble.height);
  const offsetX = newX - bubble.x;
  const offsetY = newY - bubble.y;
  bubble.x = newX;
  bubble.y = newY;
  if (bubble.tail) {
    bubble.tail = {
      x: bubble.tail.x + offsetX,
      y: bubble.tail.y + offsetY
    };
  }
  updateBubbleElement(bubble);
}

function stopMovingBubble() {
  movingBubbleState = null;
  document.removeEventListener('mousemove', onBubbleMove);
  document.removeEventListener('mouseup', stopMovingBubble);
}

function ensureBubbleTail(bubble) {
  if (!bubble.tail) {
    bubble.tail = {
      x: bubble.x + bubble.width / 2,
      y: bubble.y + bubble.height + 40
    };
  }
}

function updateBubbleElement(bubble) {
  if (!bubble.element || !bubble.contentEl || !bubble.svgEl || !bubble.shapeEl) return;
  bubble.strokeWidth = clampNumber(bubble.strokeWidth || 5, 1, 20);
  bubble.element.style.left = `${bubble.x}px`;
  bubble.element.style.top = `${bubble.y}px`;
  bubble.element.style.width = `${bubble.width}px`;
  bubble.element.style.height = `${bubble.height}px`;
  bubble.element.style.padding = `${bubble.padding}px`;
  bubble.element.dataset.type = bubble.type;
  bubble.contentEl.style.fontSize = `${bubble.fontSize}px`;
  bubble.shapeEl.style.strokeWidth = `${bubble.strokeWidth}px`;

  const width = Math.max(bubble.width, 40);
  const height = Math.max(bubble.height, 40);
  bubble.svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  bubble.svgEl.setAttribute('preserveAspectRatio', 'none');
  bubble.svgEl.setAttribute('overflow', 'visible');
  bubble.shapeEl.setAttribute('d', buildBubblePath(bubble, width, height));
  bubble.svgEl.style.left = '0px';
  bubble.svgEl.style.top = '0px';
  bubble.svgEl.style.width = `${width}px`;
  bubble.svgEl.style.height = `${height}px`;
  try {
    const bbox = bubble.shapeEl.getBBox();
    if (bbox) {
      const extraLeft = Math.max(0, -bbox.x);
      const extraTop = Math.max(0, -bbox.y);
      const extraRight = Math.max(0, bbox.x + bbox.width - width);
      const extraBottom = Math.max(0, bbox.y + bbox.height - height);
      if (extraLeft || extraTop || extraRight || extraBottom) {
        bubble.svgEl.style.left = `${-extraLeft}px`;
        bubble.svgEl.style.top = `${-extraTop}px`;
        bubble.svgEl.style.width = `${width + extraLeft + extraRight}px`;
        bubble.svgEl.style.height = `${height + extraTop + extraBottom}px`;
      }
    }
  } catch (error) {
    // ignore getBBox issues in hidden states
  }

  if (state.selectedBubbleId === bubble.id) {
    updateBubbleHandles(bubble);
  }
}

function buildBubblePath(bubble, width, height) {
  if (bubble.type === 'rectangle') {
    return buildRectanglePath(width, height);
  }
  if (bubble.type === 'pointer') {
    ensureBubbleTail(bubble);
    return buildPointerPath(bubble, width, height);
  }
  return buildEllipsePath(width, height);
}

function buildEllipsePath(width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  return [
    `M ${cx - rx} ${cy}`,
    `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`,
    `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`,
    'Z'
  ].join(' ');
}

function buildRectanglePath(width, height) {
  const r = Math.min(30, width / 4, height / 4);
  const right = width;
  const bottom = height;
  return [
    `M ${r} 0`,
    `H ${right - r}`,
    `Q ${right} 0 ${right} ${r}`,
    `V ${bottom - r}`,
    `Q ${right} ${bottom} ${right - r} ${bottom}`,
    `H ${r}`,
    `Q 0 ${bottom} 0 ${bottom - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    'Z'
  ].join(' ');
}

function buildPointerPath(bubble, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const tail = bubble.tail ? {
    x: bubble.tail.x - bubble.x,
    y: bubble.tail.y - bubble.y
  } : { x: cx, y: height + 40 };
  let localTailX = tail.x;
  let localTailY = tail.y;
  const diffX = localTailX - cx;
  const diffY = localTailY - cy;
  const normX = diffX / (rx || 1);
  const normY = diffY / (ry || 1);
  const normLength = Math.hypot(normX, normY);
  if (normLength < 1.05) {
    const scale = 1.05 / Math.max(normLength, 0.0001);
    localTailX = cx + diffX * scale;
    localTailY = cy + diffY * scale;
    bubble.tail = {
      x: bubble.x + localTailX,
      y: bubble.y + localTailY
    };
  }
  const startAngle = -Math.PI / 2;
  const spread = (5 * Math.PI) / 180;
  let theta = Math.atan2(localTailY - cy, localTailX - cx);
  if (!Number.isFinite(theta)) {
    theta = Math.PI / 2;
  }
  const normalizeForward = (angle, base) => {
    let value = angle;
    while (value <= base) {
      value += Math.PI * 2;
    }
    return value;
  };
  const pointAt = (angle) => ({
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle)
  });
  const angle1 = normalizeForward(theta - spread / 2, startAngle);
  const angle2 = normalizeForward(theta + spread / 2, angle1);
  const topPoint = pointAt(startAngle);
  const base1 = pointAt(angle1);
  const base2 = pointAt(angle2);
  const delta1 = angle1 - startAngle;
  const delta2 = (startAngle + Math.PI * 2) - angle2;
  const largeArc1 = delta1 > Math.PI ? 1 : 0;
  const largeArc2 = delta2 > Math.PI ? 1 : 0;
  return [
    `M ${topPoint.x} ${topPoint.y}`,
    `A ${rx} ${ry} 0 ${largeArc1} 1 ${base1.x} ${base1.y}`,
    `L ${localTailX} ${localTailY}`,
    `L ${base2.x} ${base2.y}`,
    `A ${rx} ${ry} 0 ${largeArc2} 1 ${topPoint.x} ${topPoint.y}`,
    'Z'
  ].join(' ');
}

function updateBubbleHandles(bubble) {
  removeBubbleHandles();
  const { x, y, width, height } = bubble;
  const corners = [
    { name: 'nw', x, y },
    { name: 'ne', x: x + width, y },
    { name: 'se', x: x + width, y: y + height },
    { name: 'sw', x, y: y + height }
  ];
  corners.forEach((corner) => {
    const handle = document.createElement('div');
    handle.className = `bubble-handle corner-${corner.name}`;
    handle.dataset.type = 'corner';
    handle.dataset.position = corner.name;
    handle.style.left = `${corner.x}px`;
    handle.style.top = `${corner.y}px`;
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      startBubbleHandleDrag(bubble, { type: 'corner', position: corner.name }, event);
    });
    pageEl.appendChild(handle);
  });

  const edges = [
    { name: 'top', x: x + width / 2, y, className: 'edge-horizontal' },
    { name: 'right', x: x + width, y: y + height / 2, className: 'edge-vertical' },
    { name: 'bottom', x: x + width / 2, y: y + height, className: 'edge-horizontal' },
    { name: 'left', x, y: y + height / 2, className: 'edge-vertical' }
  ];
  edges.forEach((edge) => {
    const handle = document.createElement('div');
    handle.className = `bubble-handle ${edge.className}`;
    handle.dataset.type = 'edge';
    handle.dataset.position = edge.name;
    handle.style.left = `${edge.x}px`;
    handle.style.top = `${edge.y}px`;
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      startBubbleHandleDrag(bubble, { type: 'edge', position: edge.name }, event);
    });
    pageEl.appendChild(handle);
  });

  if (bubble.type === 'pointer') {
    ensureBubbleTail(bubble);
    const tailHandle = document.createElement('div');
    tailHandle.className = 'bubble-handle tail';
    tailHandle.dataset.type = 'tail';
    tailHandle.style.left = `${bubble.tail.x}px`;
    tailHandle.style.top = `${bubble.tail.y}px`;
    tailHandle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      startBubbleHandleDrag(bubble, { type: 'tail', position: 'tail' }, event);
    });
    pageEl.appendChild(tailHandle);
  }
}

function removeBubbleHandles() {
  document.querySelectorAll('.bubble-handle').forEach((handle) => handle.remove());
}

function startBubbleHandleDrag(bubble, info, event) {
  const startPoint = clientToPagePoint(event.clientX, event.clientY);
  bubbleHandleState = {
    id: bubble.id,
    type: info.type,
    position: info.position,
    startX: startPoint.x,
    startY: startPoint.y,
    original: {
      x: bubble.x,
      y: bubble.y,
      width: bubble.width,
      height: bubble.height,
      tail: bubble.tail ? { ...bubble.tail } : null
    }
  };
  document.addEventListener('mousemove', onBubbleHandleMove);
  document.addEventListener('mouseup', stopBubbleHandleDrag);
  event.preventDefault();
}

function onBubbleHandleMove(event) {
  if (!bubbleHandleState) return;
  const bubble = state.bubbles.find((b) => b.id === bubbleHandleState.id);
  if (!bubble) return;
  const { type, position, original } = bubbleHandleState;
  const point = clientToPagePoint(event.clientX, event.clientY);
  const dx = point.x - bubbleHandleState.startX;
  const dy = point.y - bubbleHandleState.startY;
  const minWidth = 120;
  const minHeight = 80;
  let changed = false;

  if (type === 'corner') {
    if (position === 'nw') {
      let newX = clampNumber(original.x + dx, 0, original.x + original.width - minWidth);
      let newY = clampNumber(original.y + dy, 0, original.y + original.height - minHeight);
      bubble.x = newX;
      bubble.y = newY;
      bubble.width = clampNumber(original.width + (original.x - newX), minWidth, state.page.width - bubble.x);
      bubble.height = clampNumber(original.height + (original.y - newY), minHeight, state.page.height - bubble.y);
      changed = true;
    } else if (position === 'ne') {
      bubble.y = clampNumber(original.y + dy, 0, original.y + original.height - minHeight);
      bubble.height = clampNumber(original.height + (original.y - bubble.y), minHeight, state.page.height - bubble.y);
      bubble.width = clampNumber(original.width + dx, minWidth, state.page.width - original.x);
      changed = true;
    } else if (position === 'se') {
      bubble.width = clampNumber(original.width + dx, minWidth, state.page.width - original.x);
      bubble.height = clampNumber(original.height + dy, minHeight, state.page.height - original.y);
      changed = true;
    } else if (position === 'sw') {
      bubble.x = clampNumber(original.x + dx, 0, original.x + original.width - minWidth);
      bubble.width = clampNumber(original.width + (original.x - bubble.x), minWidth, state.page.width - bubble.x);
      bubble.height = clampNumber(original.height + dy, minHeight, state.page.height - original.y);
      changed = true;
    }
  } else if (type === 'edge') {
    if (position === 'top') {
      bubble.y = clampNumber(original.y + dy, 0, original.y + original.height - minHeight);
      bubble.height = clampNumber(original.height + (original.y - bubble.y), minHeight, state.page.height - bubble.y);
      changed = true;
    } else if (position === 'right') {
      bubble.width = clampNumber(original.width + dx, minWidth, state.page.width - original.x);
      changed = true;
    } else if (position === 'bottom') {
      bubble.height = clampNumber(original.height + dy, minHeight, state.page.height - original.y);
      changed = true;
    } else if (position === 'left') {
      bubble.x = clampNumber(original.x + dx, 0, original.x + original.width - minWidth);
      bubble.width = clampNumber(original.width + (original.x - bubble.x), minWidth, state.page.width - bubble.x);
      changed = true;
    }
  } else if (type === 'tail' && bubble.type === 'pointer') {
    ensureBubbleTail(bubble);
    const maxX = state.page.width;
    const maxY = state.page.height;
    bubble.tail = {
      x: clampNumber((original.tail?.x || bubble.tail.x) + dx, 0, maxX),
      y: clampNumber((original.tail?.y || bubble.tail.y) + dy, 0, maxY)
    };
    changed = true;
  }

  if (changed) {
    updateBubbleElement(bubble);
  }
}

function stopBubbleHandleDrag() {
  bubbleHandleState = null;
  document.removeEventListener('mousemove', onBubbleHandleMove);
  document.removeEventListener('mouseup', stopBubbleHandleDrag);
}

function refreshBubbles() {
  state.bubbles.forEach((bubble) => {
    updateBubbleElement(bubble);
  });
}

function init() {
  applyPageSettings();
  enablePanelControls(false);
  enableBubbleControls(false);
  requestAnimationFrame(() => centerViewport());
}

init();

if (exportImageBtn) {
  exportImageBtn.addEventListener('click', async () => {
    if (typeof window.html2canvas !== 'function') {
      console.warn('html2canvas not available');
      return;
    }
    exportImageBtn.disabled = true;
    const nodesToHide = Array.from(document.querySelectorAll('.handle, .bubble-handle, #tooltip, #page-size-indicator'));
    const previousVisibility = nodesToHide.map((node) => node.style.visibility);
    nodesToHide.forEach((node) => {
      node.style.visibility = 'hidden';
    });
    try {
      const format = exportFormatSelect.value === 'jpg' ? 'jpg' : 'png';
      const quality = clampNumber(parseFloat(exportQualitySelect.value) || 1, 0.1, 1);
      const canvas = await window.html2canvas(pageEl, {
        backgroundColor: state.gapColor === 'black' ? '#000000' : '#ffffff',
        scale: 2
      });
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const dataUrl = format === 'jpg'
        ? canvas.toDataURL(mime, quality)
        : canvas.toDataURL(mime);
      const link = document.createElement('a');
      link.download = `comic-${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to export image', error);
    } finally {
      nodesToHide.forEach((node, index) => {
        node.style.visibility = previousVisibility[index];
      });
      exportImageBtn.disabled = false;
    }
  });
}

window.addEventListener('resize', () => {
  if (!userAdjustedViewport) {
    centerViewport(true);
  } else {
    applyViewportTransform();
  }
  if (state.selectedPanelId) {
    const panel = getSelectedPanel();
    if (panel) updateHandles(panel);
  }
});
