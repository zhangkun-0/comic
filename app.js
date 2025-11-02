const state = {
  page: {
    width: 900,
    height: 1200,
    gapX: 24,
    gapY: 24
  },
  comicArea: {
    marginX: 80,
    marginY: 80,
    frameThickness: 6
  },
  slicing: {
    gapX: 24,
    gapY: 24
  },
  panels: [],
  bubbles: [],
  layers: [],
  selectedPanelId: null,
  selectedBubbleId: null,
  mode: 'view',
  comicAreaRect: null
};

const pageEl = document.getElementById('page');
const comicAreaEl = document.getElementById('comic-area');
const toggleDrawBtn = document.getElementById('toggle-draw');
const pageWidthInput = document.getElementById('page-width');
const pageHeightInput = document.getElementById('page-height');
const gapXInput = document.getElementById('gap-x');
const gapYInput = document.getElementById('gap-y');
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
const imageScaleInput = document.getElementById('image-scale');
const imageOffsetXInput = document.getElementById('image-offset-x');
const imageOffsetYInput = document.getElementById('image-offset-y');
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
const bubbleTextInput = document.getElementById('bubble-text');

let cutState = null;
let handleState = null;
let movingPanelState = null;
let movingBubbleState = null;

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function applyPageSettings() {
  const { width, height, gapX, gapY } = state.page;
  pageEl.style.width = `${width}px`;
  pageEl.style.height = `${height}px`;
  pageEl.style.setProperty('--gap-x', `${Math.max(gapX, 16)}px`);
  pageEl.style.setProperty('--gap-y', `${Math.max(gapY, 16)}px`);
  pageEl.style.setProperty('--frame-thickness', `${state.comicArea.frameThickness}px`);
  updateComicArea();
}

function updateComicArea() {
  const { width, height } = state.page;
  const area = state.comicArea;
  const maxFrame = Math.max(1, Math.floor(Math.min(width, height) / 4));
  area.frameThickness = clampNumber(area.frameThickness, 1, maxFrame);
  frameThicknessInput.value = area.frameThickness.toString();

  const maxMarginX = Math.max(0, Math.floor(width / 2 - area.frameThickness));
  const maxMarginY = Math.max(0, Math.floor(height / 2 - area.frameThickness));
  area.marginX = clampNumber(area.marginX, 0, maxMarginX);
  area.marginY = clampNumber(area.marginY, 0, maxMarginY);
  areaMarginXInput.value = area.marginX.toString();
  areaMarginYInput.value = area.marginY.toString();

  const contentWidth = Math.max(0, width - 2 * area.marginX - 2 * area.frameThickness);
  const contentHeight = Math.max(0, height - 2 * area.marginY - 2 * area.frameThickness);

  comicAreaEl.style.left = `${area.marginX}px`;
  comicAreaEl.style.top = `${area.marginY}px`;
  comicAreaEl.style.width = `${contentWidth}px`;
  comicAreaEl.style.height = `${contentHeight}px`;
  comicAreaEl.style.borderWidth = `${area.frameThickness}px`;

  pageEl.style.setProperty('--frame-thickness', `${area.frameThickness}px`);

  state.comicAreaRect = {
    left: area.marginX + area.frameThickness,
    top: area.marginY + area.frameThickness,
    right: area.marginX + area.frameThickness + contentWidth,
    bottom: area.marginY + area.frameThickness + contentHeight,
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

pageWidthInput.addEventListener('input', () => {
  state.page.width = clampNumber(parseInt(pageWidthInput.value, 10) || 900, 200, 2000);
  applyPageSettings();
});

pageHeightInput.addEventListener('input', () => {
  state.page.height = clampNumber(parseInt(pageHeightInput.value, 10) || 1200, 200, 3000);
  applyPageSettings();
});

gapXInput.addEventListener('input', () => {
  state.page.gapX = clampNumber(parseInt(gapXInput.value, 10) || 0, 0, 400);
  applyPageSettings();
});

gapYInput.addEventListener('input', () => {
  state.page.gapY = clampNumber(parseInt(gapYInput.value, 10) || 0, 0, 400);
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

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    <div class="image-wrapper">
      <div class="placeholder">双击或在左侧上传图片</div>
      <img class="panel-image" alt="">
    </div>
  `;
  panelEl.addEventListener('click', (event) => event.stopPropagation());
  panelEl.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    selectPanel(id);
    if (event.target.classList.contains('handle')) {
      return;
    }
    startMovingPanel(panel, event);
  });
  panelEl.addEventListener('dblclick', () => {
    selectPanel(id);
    panelImageInput.click();
  });

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
  imgEl.style.pointerEvents = 'none';
  imgEl.style.userSelect = 'none';
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
  if (state.mode !== 'cut') {
    if (!event.target.closest('.panel') && !event.target.closest('.bubble')) {
      clearSelection();
    }
    return;
  }
  startCut(event);
});

function startCut(event) {
  const areaRect = state.comicAreaRect;
  if (!areaRect || areaRect.width <= 0 || areaRect.height <= 0) {
    return;
  }
  cancelCutState();
  const rect = pageEl.getBoundingClientRect();
  const x = clampNumber(event.clientX - rect.left, areaRect.left, areaRect.right);
  const y = clampNumber(event.clientY - rect.top, areaRect.top, areaRect.bottom);

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
  const rect = pageEl.getBoundingClientRect();
  const x = clampNumber(event.clientX - rect.left, areaRect.left, areaRect.right);
  const y = clampNumber(event.clientY - rect.top, areaRect.top, areaRect.bottom);
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
  const rect = pageEl.getBoundingClientRect();
  const x = clampNumber(event.clientX - rect.left, areaRect.left, areaRect.right);
  const y = clampNumber(event.clientY - rect.top, areaRect.top, areaRect.bottom);
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
  handleState = {
    panelId: panel.id,
    type: handleInfo.type,
    index: handleInfo.index ?? null,
    edge: handleInfo.edge ?? null,
    startX: event.clientX,
    startY: event.clientY,
    originalPoints: panel.points.map((point) => ({ ...point }))
  };
  document.addEventListener('mousemove', onHandleMove);
  document.addEventListener('mouseup', stopHandleDrag);
}

function onHandleMove(event) {
  if (!handleState) return;
  const panel = state.panels.find((p) => p.id === handleState.panelId);
  if (!panel) return;
  const areaRect = state.comicAreaRect;
  if (!areaRect) return;
  const rect = pageEl.getBoundingClientRect();
  if (handleState.type === 'corner' && handleState.index !== null) {
    const x = clampNumber(event.clientX - rect.left, areaRect.left, areaRect.right);
    const y = clampNumber(event.clientY - rect.top, areaRect.top, areaRect.bottom);
    panel.points[handleState.index] = { x, y };
    updatePanelElement(panel);
    showTooltip(event.clientX, event.clientY, `${Math.round(x)}, ${Math.round(y)}`);
    return;
  }

  const dx = event.clientX - handleState.startX;
  const dy = event.clientY - handleState.startY;
  const newPoints = handleState.originalPoints.map((point) => ({ ...point }));

  if (handleState.type === 'edge') {
    if (handleState.edge === 'top') {
      [0, 1].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: handleState.originalPoints[idx].x + dx,
          y: handleState.originalPoints[idx].y + dy
        });
      });
    } else if (handleState.edge === 'right') {
      [1, 2].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: handleState.originalPoints[idx].x + dx,
          y: handleState.originalPoints[idx].y + dy
        });
      });
    } else if (handleState.edge === 'bottom') {
      [2, 3].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: handleState.originalPoints[idx].x + dx,
          y: handleState.originalPoints[idx].y + dy
        });
      });
    } else if (handleState.edge === 'left') {
      [3, 0].forEach((idx) => {
        newPoints[idx] = clampPointToArea({
          x: handleState.originalPoints[idx].x + dx,
          y: handleState.originalPoints[idx].y + dy
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
  enablePanelControls(false);
  const bubble = state.bubbles.find((b) => b.id === id);
  if (bubble) {
    syncBubbleControls(bubble);
    enableBubbleControls(true);
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
  enablePanelControls(false);
  enableBubbleControls(false);
  refreshLayers();
}

function enablePanelControls(enabled) {
  [deletePanelBtn, panelImageInput, imageScaleInput, imageOffsetXInput, imageOffsetYInput, imageRotationInput, imageFlipBtn, filterHueInput, filterSaturationInput, filterContrastInput].forEach((el) => {
    el.disabled = !enabled;
  });
}

function enableBubbleControls(enabled) {
  [deleteBubbleBtn, bubbleTypeSelect, bubbleFontSizeInput, bubblePaddingInput, bubbleTextInput].forEach((el) => {
    el.disabled = !enabled;
  });
}

deletePanelBtn.addEventListener('click', () => {
  if (!state.selectedPanelId) return;
  const index = state.panels.findIndex((p) => p.id === state.selectedPanelId);
  if (index >= 0) {
    state.panels[index].element.remove();
    state.panels.splice(index, 1);
  }
  state.layers = state.layers.filter((layer) => !(layer.type === 'panel' && layer.id === state.selectedPanelId));
  state.selectedPanelId = null;
  removeHandles();
  refreshLayers();
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

imageScaleInput.addEventListener('input', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.scale = parseFloat(imageScaleInput.value) || 1;
  applyImageTransform(panel);
});

imageOffsetXInput.addEventListener('input', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.offsetX = parseFloat(imageOffsetXInput.value) || 0;
  applyImageTransform(panel);
});

imageOffsetYInput.addEventListener('input', () => {
  const panel = getSelectedPanel();
  if (!panel) return;
  panel.image.offsetY = parseFloat(imageOffsetYInput.value) || 0;
  applyImageTransform(panel);
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
  imageScaleInput.value = panel.image.scale.toString();
  imageOffsetXInput.value = panel.image.offsetX.toString();
  imageOffsetYInput.value = panel.image.offsetY.toString();
  imageRotationInput.value = panel.image.rotation.toString();
  filterHueInput.value = panel.image.hue.toString();
  filterSaturationInput.value = panel.image.saturation.toString();
  filterContrastInput.value = panel.image.contrast.toString();
}

function getSelectedPanel() {
  return state.panels.find((panel) => panel.id === state.selectedPanelId) || null;
}

function startMovingPanel(panel, event) {
  movingPanelState = {
    panelId: panel.id,
    startX: event.clientX,
    startY: event.clientY,
    originalPoints: panel.points.map((p) => ({ ...p }))
  };
  document.addEventListener('mousemove', movePanel);
  document.addEventListener('mouseup', stopMovingPanel);
}

function movePanel(event) {
  if (!movingPanelState) return;
  const panel = state.panels.find((p) => p.id === movingPanelState.panelId);
  if (!panel) return;
  const dx = event.clientX - movingPanelState.startX;
  const dy = event.clientY - movingPanelState.startY;
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
  const bubble = {
    id,
    type: 'ellipse',
    x: 120,
    y: 120,
    width: 220,
    height: 160,
    fontSize: 24,
    padding: 16,
    text: '请输入对白'
  };
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble ellipse';
  bubbleEl.dataset.id = id;
  bubbleEl.style.left = `${bubble.x}px`;
  bubbleEl.style.top = `${bubble.y}px`;
  bubbleEl.style.width = `${bubble.width}px`;
  bubbleEl.style.height = `${bubble.height}px`;
  bubbleEl.style.padding = `${bubble.padding}px`;
  const content = document.createElement('div');
  content.className = 'bubble-content';
  content.contentEditable = 'true';
  content.style.fontSize = `${bubble.fontSize}px`;
  content.textContent = bubble.text;
  content.addEventListener('input', () => {
    bubble.text = content.textContent || '';
    bubbleTextInput.value = bubble.text;
  });
  bubbleEl.appendChild(content);
  bubbleEl.addEventListener('click', (event) => event.stopPropagation());
  bubbleEl.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    selectBubble(id);
    if (event.target.closest('.bubble-content')) {
      return;
    }
    startMovingBubble(bubble, event);
  });
  bubbleEl.addEventListener('mouseup', () => {
    bubble.width = bubbleEl.offsetWidth;
    bubble.height = bubbleEl.offsetHeight;
  });
  pageEl.appendChild(bubbleEl);
  bubble.element = bubbleEl;
  bubble.contentEl = content;
  state.bubbles.push(bubble);
  state.layers.push({ type: 'bubble', id });
  refreshLayers();
  selectBubble(id);
}

addBubbleBtn.addEventListener('click', addBubble);

deleteBubbleBtn.addEventListener('click', () => {
  if (!state.selectedBubbleId) return;
  const index = state.bubbles.findIndex((b) => b.id === state.selectedBubbleId);
  if (index >= 0) {
    state.bubbles[index].element.remove();
    state.bubbles.splice(index, 1);
  }
  state.layers = state.layers.filter((layer) => !(layer.type === 'bubble' && layer.id === state.selectedBubbleId));
  state.selectedBubbleId = null;
  refreshLayers();
});

bubbleTypeSelect.addEventListener('change', () => {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.type = bubbleTypeSelect.value;
  bubble.element.classList.remove('ellipse', 'rectangle', 'cloud');
  bubble.element.classList.add(bubble.type);
});

bubbleFontSizeInput.addEventListener('input', () => {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.fontSize = parseInt(bubbleFontSizeInput.value, 10) || 16;
  bubble.contentEl.style.fontSize = `${bubble.fontSize}px`;
});

bubblePaddingInput.addEventListener('input', () => {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.padding = parseInt(bubblePaddingInput.value, 10) || 0;
  bubble.element.style.padding = `${bubble.padding}px`;
});

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
}

function startMovingBubble(bubble, event) {
  movingBubbleState = {
    id: bubble.id,
    startX: event.clientX,
    startY: event.clientY,
    originalX: bubble.x,
    originalY: bubble.y
  };
  document.addEventListener('mousemove', onBubbleMove);
  document.addEventListener('mouseup', stopMovingBubble);
}

function onBubbleMove(event) {
  if (!movingBubbleState) return;
  const bubble = state.bubbles.find((b) => b.id === movingBubbleState.id);
  if (!bubble) return;
  const dx = event.clientX - movingBubbleState.startX;
  const dy = event.clientY - movingBubbleState.startY;
  const x = clampNumber(movingBubbleState.originalX + dx, 0, state.page.width - bubble.element.offsetWidth);
  const y = clampNumber(movingBubbleState.originalY + dy, 0, state.page.height - bubble.element.offsetHeight);
  bubble.x = x;
  bubble.y = y;
  bubble.element.style.left = `${x}px`;
  bubble.element.style.top = `${y}px`;
}

function stopMovingBubble() {
  movingBubbleState = null;
  document.removeEventListener('mousemove', onBubbleMove);
  document.removeEventListener('mouseup', stopMovingBubble);
}

pageEl.addEventListener('click', () => {
  if (state.mode === 'view') {
    clearSelection();
  }
});

function refreshBubbles() {
  state.bubbles.forEach((bubble) => {
    bubble.element.style.left = `${bubble.x}px`;
    bubble.element.style.top = `${bubble.y}px`;
    bubble.element.style.width = `${bubble.width}px`;
    bubble.element.style.height = `${bubble.height}px`;
    bubble.element.style.padding = `${bubble.padding}px`;
    bubble.contentEl.style.fontSize = `${bubble.fontSize}px`;
    bubble.element.classList.remove('ellipse', 'rectangle', 'cloud');
    bubble.element.classList.add(bubble.type);
  });
}

function init() {
  applyPageSettings();
  enablePanelControls(false);
  enableBubbleControls(false);
}

init();

window.addEventListener('resize', () => {
  if (state.selectedPanelId) {
    const panel = getSelectedPanel();
    if (panel) updateHandles(panel);
  }
});
