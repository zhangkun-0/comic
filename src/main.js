const svgNS = 'http://www.w3.org/2000/svg';

const state = {
  page: {
    width: 1000,
    height: 1600,
    marginVertical: 60,
    marginHorizontal: 60,
    borderThickness: 4,
    areaColor: '#5c9ded',
    gapColor: 'white',
  },
  split: {
    verticalGap: 16,
    horizontalGap: 24,
    active: false,
  },
  view: {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  },
  panels: [],
  panelCounter: 1,
  selectedPanelId: null,
  dialogues: [],
  dialogueCounter: 1,
  selectedDialogueId: null,
  layers: [],
  currentInteraction: null,
  areaSize: { width: 880, height: 1480 },
};

const elements = {
  pageWidth: document.getElementById('page-width'),
  pageHeight: document.getElementById('page-height'),
  marginVertical: document.getElementById('margin-vertical'),
  marginHorizontal: document.getElementById('margin-horizontal'),
  borderThickness: document.getElementById('border-thickness'),
  areaColor: document.getElementById('manga-area-color'),
  gapColor: document.getElementById('gap-color'),
  splitGapVertical: document.getElementById('split-gap-vertical'),
  splitGapHorizontal: document.getElementById('split-gap-horizontal'),
  toggleSplit: document.getElementById('toggle-split'),
  splitHint: document.getElementById('split-hint'),
  uploadImage: document.getElementById('upload-image'),
  hiddenFileInput: document.getElementById('hidden-file-input'),
  dialogButtons: document.querySelectorAll('[data-dialog-type]'),
  dialogFontSize: document.getElementById('dialog-font-size'),
  dialogPadding: document.getElementById('dialog-padding'),
  dialogStroke: document.getElementById('dialog-stroke'),
  exportFormat: document.getElementById('export-format'),
  exportQuality: document.getElementById('export-quality'),
  exportButton: document.getElementById('export-image'),
  splitIndicator: document.getElementById('split-mode-indicator'),
  zoomIndicator: document.getElementById('zoom-indicator'),
  pageSizeLabel: document.getElementById('page-size-label'),
  page: document.getElementById('page'),
  mangaAreaContainer: document.getElementById('manga-area-container'),
  svg: document.getElementById('manga-area'),
  canvas: document.getElementById('canvas'),
  canvasWrapper: document.getElementById('canvas-wrapper'),
  layerList: document.getElementById('layer-list'),
};

document.addEventListener('contextmenu', (event) => {
  const target = event.target;
  if (target.closest('#canvas')) {
    event.preventDefault();
  }
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createSvgElement(tag) {
  return document.createElementNS(svgNS, tag);
}

function polygonToPoints(points) {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function getPolygonBoundingBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function getPolygonCentroid(points) {
  const area = polygonArea(points);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * factor;
    cy += (current.y + next.y) * factor;
  }
  const scale = area === 0 ? 0 : 1 / (6 * area);
  return {
    x: cx * scale,
    y: cy * scale,
  };
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function ensureClockwise(points) {
  if (polygonArea(points) < 0) {
    return points.slice().reverse();
  }
  return points.slice();
}

function simplifyPolygon(points) {
  if (points.length <= 4) {
    return points;
  }
  const simplified = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const v1x = current.x - prev.x;
    const v1y = current.y - prev.y;
    const v2x = next.x - current.x;
    const v2y = next.y - current.y;
    const cross = v1x * v2y - v1y * v2x;
    if (Math.abs(cross) > 0.01) {
      simplified.push(current);
    }
  }
  return simplified.length >= 4 ? simplified : points;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function lineSide(point, start, end) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function segmentIntersection(p1, p2, q1, q2) {
  const s1x = p2.x - p1.x;
  const s1y = p2.y - p1.y;
  const s2x = q2.x - q1.x;
  const s2y = q2.y - q1.y;
  const denom = -s2x * s1y + s1x * s2y;
  if (Math.abs(denom) < 0.0001) {
    return null;
  }
  const s = (-s1y * (p1.x - q1.x) + s1x * (p1.y - q1.y)) / denom;
  const t = (s2x * (p1.y - q1.y) - s2y * (p1.x - q1.x)) / denom;
  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return {
      x: p1.x + t * s1x,
      y: p1.y + t * s1y,
    };
  }
  return null;
}

function colorToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updatePageSizeLabel() {
  elements.pageSizeLabel.textContent = `${state.page.width} × ${state.page.height}`;
}

function updateMangaAreaStyles() {
  const container = elements.mangaAreaContainer;
  container.style.inset = `${state.page.marginVertical}px ${state.page.marginHorizontal}px`;
  container.style.borderWidth = `${state.page.borderThickness}px`;
  container.style.background = colorToRgba(state.page.areaColor, 0.3);
}

function updatePageDimensions(resizePanels = true) {
  const { width, height, marginHorizontal, marginVertical } = state.page;
  elements.page.style.width = `${width}px`;
  elements.page.style.height = `${height}px`;
  updatePageSizeLabel();
  const newAreaWidth = Math.max(10, width - marginHorizontal * 2);
  const newAreaHeight = Math.max(10, height - marginVertical * 2);
  const prevArea = { ...state.areaSize };
  state.areaSize = { width: newAreaWidth, height: newAreaHeight };
  elements.svg.setAttribute('viewBox', `0 0 ${newAreaWidth} ${newAreaHeight}`);
  elements.svg.setAttribute('width', newAreaWidth);
  elements.svg.setAttribute('height', newAreaHeight);
  if (resizePanels && prevArea.width > 0 && prevArea.height > 0) {
    const scaleX = newAreaWidth / prevArea.width;
    const scaleY = newAreaHeight / prevArea.height;
    state.panels.forEach((panel) => {
      panel.points = panel.points.map((pt) => ({
        x: pt.x * scaleX,
        y: pt.y * scaleY,
      }));
      if (panel.imageData) {
        panel.imageData.offsetX *= scaleX;
        panel.imageData.offsetY *= scaleY;
        panel.imageData.scale *= Math.min(scaleX, scaleY);
      }
    });
    state.dialogues.forEach((dialogue) => {
      dialogue.x *= scaleX;
      dialogue.y *= scaleY;
      dialogue.width *= scaleX;
      dialogue.height *= scaleY;
      if (dialogue.pointerLength) {
        dialogue.pointerLength *= Math.max(scaleX, scaleY);
      }
    });
  }
  renderAll();
}

function updateGapColor() {
  elements.canvas.classList.toggle('gap-black', state.page.gapColor === 'black');
  elements.canvas.classList.toggle('gap-white', state.page.gapColor === 'white');
}

function resetPanels() {
  const { width, height } = state.areaSize;
  state.panels = [
    {
      id: state.panelCounter++,
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
      imageData: null,
    },
  ];
  state.layers = state.panels.map((panel) => ({ type: 'panel', id: panel.id }));
  state.selectedPanelId = state.panels[0].id;
  renderAll();
}

function getPanelById(id) {
  return state.panels.find((panel) => panel.id === id);
}

function getDialogueById(id) {
  return state.dialogues.find((dialog) => dialog.id === id);
}

function getPanelHandles(panel) {
  const handles = [];
  const points = panel.points;
  for (let i = 0; i < points.length; i++) {
    handles.push({ type: 'corner', index: i, position: points[i] });
  }
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    handles.push({
      type: 'midpoint',
      index: i,
      position: {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
      },
    });
  }
  return handles;
}

function createPanelGroup(panel, defs) {
  const group = createSvgElement('g');
  group.dataset.panelId = panel.id;
  group.classList.add('panel-group');
  if (panel.id === state.selectedPanelId) {
    group.classList.add('panel-selected');
  }

  const clipId = `panel-clip-${panel.id}`;
  const clipPath = createSvgElement('clipPath');
  clipPath.setAttribute('id', clipId);
  const clipPolygon = createSvgElement('polygon');
  clipPolygon.setAttribute('points', polygonToPoints(panel.points));
  clipPath.appendChild(clipPolygon);
  defs.appendChild(clipPath);

  if (panel.imageData) {
    const imageGroup = createSvgElement('g');
    imageGroup.setAttribute('clip-path', `url(#${clipId})`);
    const image = createSvgElement('image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', panel.imageData.src);
    const bbox = getPolygonBoundingBox(panel.points);
    const width = panel.imageData.naturalWidth * panel.imageData.scale;
    const height = panel.imageData.naturalHeight * panel.imageData.scale;
    const centerX = (bbox.minX + bbox.maxX) / 2;
    const centerY = (bbox.minY + bbox.maxY) / 2;
    const x = centerX - width / 2 + panel.imageData.offsetX;
    const y = centerY - height / 2 + panel.imageData.offsetY;
    image.setAttribute('x', x);
    image.setAttribute('y', y);
    image.setAttribute('width', width);
    image.setAttribute('height', height);
    image.classList.add('panel-image');
    image.dataset.panelId = panel.id;
    imageGroup.appendChild(image);
    group.appendChild(imageGroup);
  }

  const fillPolygon = createSvgElement('polygon');
  fillPolygon.setAttribute('points', polygonToPoints(panel.points));
  fillPolygon.classList.add('panel-fill');

  const borderPolygon = createSvgElement('polygon');
  borderPolygon.setAttribute('points', polygonToPoints(panel.points));
  borderPolygon.classList.add('panel-border');
  borderPolygon.style.strokeWidth = `${state.page.borderThickness}px`;

  group.appendChild(fillPolygon);
  group.appendChild(borderPolygon);

  const handles = getPanelHandles(panel);
  handles.forEach((handle, handleIndex) => {
    const circle = createSvgElement('circle');
    circle.setAttribute('cx', handle.position.x);
    circle.setAttribute('cy', handle.position.y);
    circle.setAttribute('r', handle.type === 'corner' ? 6 : 5);
    circle.classList.add('panel-handle');
    if (handle.type === 'midpoint') {
      circle.classList.add('midpoint');
    }
    circle.dataset.panelId = panel.id;
    circle.dataset.handleIndex = handleIndex;
    circle.dataset.handleType = handle.type;
    group.appendChild(circle);
  });

  const overlay = createSvgElement('polygon');
  overlay.setAttribute('points', polygonToPoints(panel.points));
  overlay.classList.add('panel-overlay');
  overlay.style.fill = 'transparent';
  overlay.style.cursor = 'pointer';
  overlay.dataset.panelId = panel.id;
  group.appendChild(overlay);

  return group;
}

function createDialogueGroup(dialogue) {
  const group = createSvgElement('g');
  group.classList.add('dialog-group');
  group.dataset.dialogId = dialogue.id;
  if (dialogue.id === state.selectedDialogueId) {
    group.classList.add('selected');
  }

  const shape = createDialogueShape(dialogue);
  group.appendChild(shape);

  const foreignObject = createSvgElement('foreignObject');
  foreignObject.setAttribute('x', dialogue.x - dialogue.width / 2 + dialogue.padding);
  foreignObject.setAttribute('y', dialogue.y - dialogue.height / 2 + dialogue.padding);
  foreignObject.setAttribute('width', Math.max(10, dialogue.width - dialogue.padding * 2));
  foreignObject.setAttribute('height', Math.max(10, dialogue.height - dialogue.padding * 2));
  const div = document.createElement('div');
  div.classList.add('dialog-text-container');
  div.style.width = '100%';
  div.style.height = '100%';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.textAlign = 'center';
  div.style.padding = '4px';
  const span = document.createElement('span');
  span.classList.add('dialog-text');
  span.style.fontSize = `${dialogue.fontSize}px`;
  span.style.lineHeight = '1.4';
  span.style.whiteSpace = 'pre-wrap';
  span.textContent = dialogue.text;
  div.appendChild(span);
  foreignObject.appendChild(div);
  group.appendChild(foreignObject);

  const handles = getDialogueHandles(dialogue);
  handles.forEach((handle, index) => {
    const circle = createSvgElement('circle');
    circle.classList.add('dialog-handle');
    circle.dataset.dialogId = dialogue.id;
    circle.dataset.handleIndex = index;
    circle.dataset.handleType = handle.type;
    circle.setAttribute('cx', handle.position.x);
    circle.setAttribute('cy', handle.position.y);
    circle.setAttribute('r', handle.type === 'pointer' ? 6 : 5);
    group.appendChild(circle);
  });

  return group;
}

function createDialogueShape(dialogue) {
  let shape;
  if (dialogue.type === 'ellipse') {
    shape = createSvgElement('ellipse');
    shape.setAttribute('cx', dialogue.x);
    shape.setAttribute('cy', dialogue.y);
    shape.setAttribute('rx', dialogue.width / 2);
    shape.setAttribute('ry', dialogue.height / 2);
  } else if (dialogue.type === 'rectangle') {
    shape = createSvgElement('rect');
    shape.setAttribute('x', dialogue.x - dialogue.width / 2);
    shape.setAttribute('y', dialogue.y - dialogue.height / 2);
    shape.setAttribute('width', dialogue.width);
    shape.setAttribute('height', dialogue.height);
    shape.setAttribute('rx', 12);
    shape.setAttribute('ry', 12);
  } else {
    shape = createSvgElement('path');
    const path = pointerDialoguePath(dialogue);
    shape.setAttribute('d', path);
  }
  shape.classList.add('dialog-shape');
  shape.style.strokeWidth = `${dialogue.strokeWidth}px`;
  return shape;
}

function pointerDialoguePath(dialogue) {
  const cx = dialogue.x;
  const cy = dialogue.y;
  const rx = dialogue.width / 2;
  const ry = dialogue.height / 2;
  const steps = 32;
  const points = [];
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) });
  }
  const pointerAngle = dialogue.pointerAngle;
  const pointerTip = {
    x: cx + Math.cos(pointerAngle) * (ry + dialogue.pointerLength),
    y: cy + Math.sin(pointerAngle) * (ry + dialogue.pointerLength),
  };
  const baseAngleOffset = (dialogue.pointerWidth || 20) / Math.max(rx, ry);
  const baseAngle1 = pointerAngle - baseAngleOffset;
  const baseAngle2 = pointerAngle + baseAngleOffset;
  const basePoint1 = {
    x: cx + rx * Math.cos(baseAngle1),
    y: cy + ry * Math.sin(baseAngle1),
  };
  const basePoint2 = {
    x: cx + rx * Math.cos(baseAngle2),
    y: cy + ry * Math.sin(baseAngle2),
  };
  let path = '';
  path += `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  path += ` L ${basePoint1.x} ${basePoint1.y}`;
  path += ` L ${pointerTip.x} ${pointerTip.y}`;
  path += ` L ${basePoint2.x} ${basePoint2.y}`;
  path += ' Z';
  return path;
}

function getDialogueHandles(dialogue) {
  const handles = [];
  const halfW = dialogue.width / 2;
  const halfH = dialogue.height / 2;
  handles.push({ type: 'corner', position: { x: dialogue.x - halfW, y: dialogue.y - halfH }, axis: 'both' });
  handles.push({ type: 'corner', position: { x: dialogue.x + halfW, y: dialogue.y - halfH }, axis: 'both' });
  handles.push({ type: 'corner', position: { x: dialogue.x + halfW, y: dialogue.y + halfH }, axis: 'both' });
  handles.push({ type: 'corner', position: { x: dialogue.x - halfW, y: dialogue.y + halfH }, axis: 'both' });
  if (dialogue.type === 'pointer') {
    const tip = {
      x: dialogue.x + Math.cos(dialogue.pointerAngle) * (dialogue.height / 2 + dialogue.pointerLength),
      y: dialogue.y + Math.sin(dialogue.pointerAngle) * (dialogue.height / 2 + dialogue.pointerLength),
    };
    handles.push({ type: 'pointer', position: tip });
  }
  return handles;
}

function renderLayers() {
  elements.layerList.innerHTML = '';
  state.layers.forEach((layer, index) => {
    const li = document.createElement('li');
    li.classList.add('layer-item');
    li.dataset.layerIndex = index;
    li.dataset.layerType = layer.type;
    li.dataset.layerId = layer.id;
    const label = document.createElement('span');
    if (layer.type === 'panel') {
      label.textContent = `格子 ${layer.id}`;
    } else {
      label.textContent = `对话框 ${layer.id}`;
    }
    li.appendChild(label);
    const controls = document.createElement('div');
    controls.classList.add('layer-controls');
    const up = document.createElement('button');
    up.textContent = '上移';
    up.addEventListener('click', () => moveLayer(index, -1));
    const down = document.createElement('button');
    down.textContent = '下移';
    down.addEventListener('click', () => moveLayer(index, 1));
    const remove = document.createElement('button');
    remove.textContent = '删除';
    remove.addEventListener('click', () => removeLayer(layer));
    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(remove);
    li.appendChild(controls);
    const isActive =
      (layer.type === 'panel' && layer.id === state.selectedPanelId) ||
      (layer.type === 'dialogue' && layer.id === state.selectedDialogueId);
    if (isActive) {
      li.classList.add('active');
    }
    li.addEventListener('click', () => selectLayer(layer));
    elements.layerList.appendChild(li);
  });
}

function renderAll() {
  updateMangaAreaStyles();
  const svg = elements.svg;
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
  const defs = createSvgElement('defs');
  svg.appendChild(defs);

  state.layers.forEach((layer) => {
    if (layer.type === 'panel') {
      const panel = getPanelById(layer.id);
      if (!panel) return;
      const group = createPanelGroup(panel, defs);
      svg.appendChild(group);
    } else if (layer.type === 'dialogue') {
      const dialogue = getDialogueById(layer.id);
      if (!dialogue) return;
      const group = createDialogueGroup(dialogue);
      svg.appendChild(group);
    }
  });

  if (state.split.active && state.currentInteraction?.type === 'split-preview') {
    svg.appendChild(state.currentInteraction.previewLine);
  }

  renderLayers();
  updateUploadButtonState();
  syncDialogueControls();
  updateZoomIndicator();
}

function moveLayer(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.layers.length) return;
  const layer = state.layers.splice(index, 1)[0];
  state.layers.splice(newIndex, 0, layer);
  renderAll();
}

function removeLayer(layer) {
  if (layer.type === 'panel') {
    const panelIndex = state.panels.findIndex((panel) => panel.id === layer.id);
    if (panelIndex !== -1) {
      state.panels.splice(panelIndex, 1);
    }
    if (state.selectedPanelId === layer.id) {
      state.selectedPanelId = state.panels[0]?.id ?? null;
    }
  } else {
    const dialogIndex = state.dialogues.findIndex((dialog) => dialog.id === layer.id);
    if (dialogIndex !== -1) {
      state.dialogues.splice(dialogIndex, 1);
    }
    if (state.selectedDialogueId === layer.id) {
      state.selectedDialogueId = state.dialogues[0]?.id ?? null;
    }
  }
  state.layers = state.layers.filter((l) => !(l.type === layer.type && l.id === layer.id));
  renderAll();
}

function selectLayer(layer) {
  if (layer.type === 'panel') {
    state.selectedPanelId = layer.id;
    state.selectedDialogueId = null;
  } else {
    state.selectedDialogueId = layer.id;
    state.selectedPanelId = null;
  }
  renderAll();
}

function updateUploadButtonState() {
  elements.uploadImage.disabled = !state.selectedPanelId;
}

function syncDialogueControls() {
  const dialogue = state.selectedDialogueId ? getDialogueById(state.selectedDialogueId) : null;
  if (!dialogue) return;
  elements.dialogFontSize.value = dialogue.fontSize;
  elements.dialogPadding.value = dialogue.padding;
  elements.dialogStroke.value = dialogue.strokeWidth;
}

function toggleSplitMode() {
  state.split.active = !state.split.active;
  elements.toggleSplit.textContent = state.split.active ? '退出切分模式' : '开始切分格子';
  elements.splitIndicator.textContent = state.split.active ? '当前模式：切分' : '当前模式：编辑';
  if (!state.split.active) {
    state.currentInteraction = null;
  }
}

function getPanelAtPoint(point) {
  const ordered = state.layers.slice().reverse();
  for (const layer of ordered) {
    if (layer.type !== 'panel') continue;
    const panel = getPanelById(layer.id);
    if (panel && pointInPolygon(point, panel.points)) {
      return panel;
    }
  }
  return null;
}

function splitPanel(panel, start, end) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance < 10) return;
  const direction = { x: end.x - start.x, y: end.y - start.y };
  const normal = { x: direction.y, y: -direction.x };
  const normalLength = Math.hypot(normal.x, normal.y) || 1;
  const nx = normal.x / normalLength;
  const ny = normal.y / normalLength;
  const isVerticalCut = Math.abs(direction.x) < Math.abs(direction.y);
  const gap = (isVerticalCut ? state.split.verticalGap : state.split.horizontalGap) || 0;
  const originalCentroid = getPolygonCentroid(panel.points);
  const originalImage = panel.imageData ? { ...panel.imageData } : null;

  const positive = [];
  const negative = [];
  let intersections = 0;

  for (let i = 0; i < panel.points.length; i++) {
    const current = panel.points[i];
    const next = panel.points[(i + 1) % panel.points.length];
    const currentSide = lineSide(current, start, end);
    const nextSide = lineSide(next, start, end);

    if (currentSide > 0) {
      positive.push({ ...current });
    } else if (currentSide < 0) {
      negative.push({ ...current });
    } else {
      positive.push({ ...current });
      negative.push({ ...current });
    }

    const inter = segmentIntersection(current, next, start, end);
    if (inter) {
      intersections += 1;
      positive.push({ x: inter.x + nx * (gap / 2), y: inter.y + ny * (gap / 2) });
      negative.push({ x: inter.x - nx * (gap / 2), y: inter.y - ny * (gap / 2) });
    }
  }

  if (intersections < 2 || positive.length < 3 || negative.length < 3) {
    return;
  }

  const simplifiedA = simplifyPolygon(ensureClockwise(positive));
  const simplifiedB = simplifyPolygon(ensureClockwise(negative));
  if (simplifiedA.length < 3 || simplifiedB.length < 3) {
    return;
  }

  const newPanelA = {
    id: state.panelCounter++,
    points: simplifiedA,
    imageData: null,
  };
  const newPanelB = {
    id: state.panelCounter++,
    points: simplifiedB,
    imageData: null,
  };
  if (originalImage) {
    if (pointInPolygon(originalCentroid, simplifiedA)) {
      newPanelA.imageData = originalImage;
    } else if (pointInPolygon(originalCentroid, simplifiedB)) {
      newPanelB.imageData = originalImage;
    }
  }
  const originalIndex = state.panels.findIndex((p) => p.id === panel.id);
  if (originalIndex !== -1) {
    state.panels.splice(originalIndex, 1, newPanelA, newPanelB);
  }
  const layerIndex = state.layers.findIndex((layer) => layer.type === 'panel' && layer.id === panel.id);
  if (layerIndex !== -1) {
    state.layers.splice(layerIndex, 1, { type: 'panel', id: newPanelA.id }, { type: 'panel', id: newPanelB.id });
  }
  state.selectedPanelId = newPanelA.id;
}

function handlePointerDown(event) {
  const rect = elements.mangaAreaContainer.getBoundingClientRect();
  const point = {
    x: (event.clientX - rect.left - state.view.offsetX) / state.view.zoom,
    y: (event.clientY - rect.top - state.view.offsetY) / state.view.zoom,
  };

  const target = event.target;
  if (state.split.active && event.button === 0) {
    const panel = getPanelAtPoint(point);
    if (!panel) return;
    const line = createSvgElement('line');
    line.setAttribute('id', 'split-preview-line');
    event.preventDefault();
    state.currentInteraction = {
      type: 'split-preview',
      panelId: panel.id,
      start: point,
      current: point,
      previewLine: line,
    };
    renderSplitPreview();
    return;
  }

  if (target.classList.contains('panel-handle')) {
    event.stopPropagation();
    event.preventDefault();
    const panelId = Number(target.dataset.panelId);
    const handleIndex = Number(target.dataset.handleIndex);
    const handleType = target.dataset.handleType;
    state.currentInteraction = {
      type: 'panel-handle',
      panelId,
      handleIndex,
      handleType,
      startPoint: point,
      originalPoints: getPanelById(panelId).points.map((p) => ({ ...p })),
    };
    return;
  }

  if (target.classList.contains('panel-overlay')) {
    const panelId = Number(target.dataset.panelId);
    state.selectedPanelId = panelId;
    state.selectedDialogueId = null;
    renderAll();
    if (event.button === 2) {
      state.currentInteraction = {
        type: 'panel-image-pan',
        panelId,
        lastPoint: point,
      };
    }
    return;
  }

  if (target.classList.contains('panel-image')) {
    const panelId = Number(target.dataset.panelId);
    state.selectedPanelId = panelId;
    state.selectedDialogueId = null;
    renderAll();
    if (event.button === 2) {
      event.preventDefault();
      const panel = getPanelById(panelId);
      if (panel?.imageData) {
        state.currentInteraction = {
          type: 'panel-image-pan',
          panelId,
          lastPoint: point,
        };
      }
    }
    return;
  }

  if (target.classList.contains('dialog-handle')) {
    event.stopPropagation();
    event.preventDefault();
    const dialogId = Number(target.dataset.dialogId);
    const handleIndex = Number(target.dataset.handleIndex);
    const handleType = target.dataset.handleType;
    state.currentInteraction = {
      type: 'dialog-handle',
      dialogId,
      handleIndex,
      handleType,
      startPoint: point,
      original: { ...getDialogueById(dialogId) },
    };
    return;
  }

  const dialogGroup = target.closest('.dialog-group');
  if (dialogGroup) {
    const dialogId = Number(dialogGroup.dataset.dialogId);
    state.selectedDialogueId = dialogId;
    state.selectedPanelId = null;
    renderAll();
    if (event.button === 2) {
      state.currentInteraction = {
        type: 'dialog-move',
        dialogId,
        startPoint: point,
        original: { ...getDialogueById(dialogId) },
      };
    } else if (event.button === 0 && event.detail === 2) {
      event.preventDefault();
      startDialogueEditing(dialogId);
    }
    return;
  }

  if (event.button === 0 && target.closest('#canvas')) {
    state.currentInteraction = {
      type: 'canvas-pan',
      startPoint: { x: event.clientX, y: event.clientY },
      originalOffset: { ...state.view },
    };
  }
}

function renderSplitPreview() {
  if (!state.currentInteraction || state.currentInteraction.type !== 'split-preview') return;
  const { previewLine, start, current } = state.currentInteraction;
  if (!previewLine.parentNode) {
    elements.svg.appendChild(previewLine);
  }
  previewLine.setAttribute('x1', start.x);
  previewLine.setAttribute('y1', start.y);
  previewLine.setAttribute('x2', current.x);
  previewLine.setAttribute('y2', current.y);
}

function handlePointerMove(event) {
  if (!state.currentInteraction) return;
  const rect = elements.mangaAreaContainer.getBoundingClientRect();
  const point = {
    x: (event.clientX - rect.left - state.view.offsetX) / state.view.zoom,
    y: (event.clientY - rect.top - state.view.offsetY) / state.view.zoom,
  };
  const interaction = state.currentInteraction;
  if (interaction.type === 'split-preview') {
    interaction.current = point;
    renderSplitPreview();
    return;
  }
  if (interaction.type === 'panel-handle') {
    const panel = getPanelById(interaction.panelId);
    if (!panel) return;
    const handles = getPanelHandles({ points: interaction.originalPoints });
    const handle = handles[interaction.handleIndex];
    const deltaX = point.x - interaction.startPoint.x;
    const deltaY = point.y - interaction.startPoint.y;
    const newPoints = interaction.originalPoints.map((pt) => ({ ...pt }));
    if (handle.type === 'corner') {
      newPoints[handle.index] = {
        x: clamp(handle.position.x + deltaX, 0, state.areaSize.width),
        y: clamp(handle.position.y + deltaY, 0, state.areaSize.height),
      };
    } else {
      const currentIndex = handle.index;
      const nextIndex = (handle.index + 1) % interaction.originalPoints.length;
      const edge = {
        start: interaction.originalPoints[currentIndex],
        end: interaction.originalPoints[nextIndex],
      };
      const horizontal = Math.abs(edge.start.x - edge.end.x) < Math.abs(edge.start.y - edge.end.y);
      if (horizontal) {
        const clamped = clamp(handle.position.x + deltaX, 0, state.areaSize.width);
        const dx = clamped - handle.position.x;
        newPoints[currentIndex].x += dx;
        newPoints[nextIndex].x += dx;
      } else {
        const clamped = clamp(handle.position.y + deltaY, 0, state.areaSize.height);
        const dy = clamped - handle.position.y;
        newPoints[currentIndex].y += dy;
        newPoints[nextIndex].y += dy;
      }
    }
    panel.points = ensureClockwise(newPoints);
    renderAll();
    return;
  }
  if (interaction.type === 'panel-image-pan') {
    const panel = getPanelById(interaction.panelId);
    if (!panel || !panel.imageData) return;
    const dx = (point.x - interaction.lastPoint.x);
    const dy = (point.y - interaction.lastPoint.y);
    panel.imageData.offsetX += dx;
    panel.imageData.offsetY += dy;
    interaction.lastPoint = point;
    renderAll();
    return;
  }
  if (interaction.type === 'dialog-handle') {
    const dialogue = getDialogueById(interaction.dialogId);
    if (!dialogue) return;
    const original = interaction.original;
    const deltaX = point.x - interaction.startPoint.x;
    const deltaY = point.y - interaction.startPoint.y;
    if (interaction.handleType === 'pointer') {
      const angle = Math.atan2(point.y - dialogue.y, point.x - dialogue.x);
      const step = (5 * Math.PI) / 180;
      dialogue.pointerAngle = Math.round(angle / step) * step;
      dialogue.pointerLength = Math.max(10, Math.hypot(point.x - dialogue.x, point.y - dialogue.y) - dialogue.height / 2);
    } else {
      const index = interaction.handleIndex;
      const signX = index === 0 || index === 3 ? -1 : 1;
      const signY = index <= 1 ? -1 : 1;
      const newWidth = Math.max(40, original.width + deltaX * signX * 2);
      const newHeight = Math.max(40, original.height + deltaY * signY * 2);
      dialogue.width = clamp(newWidth, 40, state.areaSize.width);
      dialogue.height = clamp(newHeight, 40, state.areaSize.height);
      dialogue.x = clamp(original.x + deltaX / 2, 0, state.areaSize.width);
      dialogue.y = clamp(original.y + deltaY / 2, 0, state.areaSize.height);
    }
    renderAll();
    return;
  }
  if (interaction.type === 'dialog-move') {
    const dialogue = getDialogueById(interaction.dialogId);
    if (!dialogue) return;
    const deltaX = point.x - interaction.startPoint.x;
    const deltaY = point.y - interaction.startPoint.y;
    dialogue.x = clamp(interaction.original.x + deltaX, 0, state.areaSize.width);
    dialogue.y = clamp(interaction.original.y + deltaY, 0, state.areaSize.height);
    renderAll();
    return;
  }
  if (interaction.type === 'canvas-pan') {
    const dx = event.clientX - interaction.startPoint.x;
    const dy = event.clientY - interaction.startPoint.y;
    state.view.offsetX = interaction.originalOffset.offsetX + dx;
    state.view.offsetY = interaction.originalOffset.offsetY + dy;
    applyViewTransform();
    return;
  }
}

function handlePointerUp(event) {
  if (!state.currentInteraction) return;
  const interaction = state.currentInteraction;
  if (interaction.type === 'split-preview' && event.button === 0) {
    const rect = elements.mangaAreaContainer.getBoundingClientRect();
    const end = {
      x: (event.clientX - rect.left - state.view.offsetX) / state.view.zoom,
      y: (event.clientY - rect.top - state.view.offsetY) / state.view.zoom,
    };
    const panel = getPanelById(interaction.panelId);
    if (panel) {
      splitPanel(panel, interaction.start, end);
      renderAll();
    }
  }
  state.currentInteraction = null;
  renderAll();
}

function applyViewTransform() {
  const transform = `translate(${state.view.offsetX}px, ${state.view.offsetY}px) scale(${state.view.zoom})`;
  elements.page.style.transform = transform;
  updateZoomIndicator();
}

function updateZoomIndicator() {
  elements.zoomIndicator.textContent = `缩放：${Math.round(state.view.zoom * 100)}%`;
}

function handleWheel(event) {
  if (!event.target.closest('#canvas')) return;
  const targetImage = event.target.classList?.contains('panel-image');
  if (targetImage) {
    event.preventDefault();
    const panelId = Number(event.target.dataset.panelId);
    const panel = getPanelById(panelId);
    if (!panel?.imageData) return;
    const delta = event.deltaY < 0 ? 1.05 : 0.95;
    const newScale = clamp(panel.imageData.scale * delta, 0.05, 8);
    panel.imageData.scale = newScale;
    renderAll();
  } else {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.05 : 0.95;
    state.view.zoom = clamp(state.view.zoom * delta, 0.2, 4);
    applyViewTransform();
  }
}

function handleImageUpload(panel, file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const bbox = getPolygonBoundingBox(panel.points);
      const scale = Math.min(bbox.width / img.width, bbox.height / img.height);
      panel.imageData = {
        src: e.target.result,
        scale,
        offsetX: 0,
        offsetY: 0,
        naturalWidth: img.width,
        naturalHeight: img.height,
      };
      renderAll();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setupImageUpload() {
  elements.uploadImage.addEventListener('click', () => {
    if (!state.selectedPanelId) return;
    elements.hiddenFileInput.value = '';
    elements.hiddenFileInput.click();
  });
  elements.hiddenFileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const panel = getPanelById(state.selectedPanelId);
    if (!panel) return;
    handleImageUpload(panel, file);
  });
}

function addDialogue(type) {
  const dialogue = {
    id: state.dialogueCounter++,
    type,
    x: state.areaSize.width / 2,
    y: state.areaSize.height / 2,
    width: 220,
    height: 140,
    fontSize: Number(elements.dialogFontSize.value) || 18,
    padding: Number(elements.dialogPadding.value) || 16,
    strokeWidth: Number(elements.dialogStroke.value) || 5,
    text: '双击编辑文字',
    pointerAngle: -Math.PI / 2,
    pointerLength: 40,
    pointerWidth: 20,
  };
  state.dialogues.push(dialogue);
  state.layers.push({ type: 'dialogue', id: dialogue.id });
  state.selectedDialogueId = dialogue.id;
  state.selectedPanelId = null;
  renderAll();
}

function setupDialogueControls() {
  elements.dialogButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.dialogType;
      addDialogue(type);
    });
  });

  const updateSelectedDialogues = () => {
    const dialogue = state.selectedDialogueId ? getDialogueById(state.selectedDialogueId) : null;
    if (!dialogue) return;
    dialogue.fontSize = Number(elements.dialogFontSize.value) || dialogue.fontSize;
    dialogue.padding = Number(elements.dialogPadding.value) || dialogue.padding;
    dialogue.strokeWidth = Number(elements.dialogStroke.value) || dialogue.strokeWidth;
    renderAll();
  };

  elements.dialogFontSize.addEventListener('change', updateSelectedDialogues);
  elements.dialogPadding.addEventListener('change', updateSelectedDialogues);
  elements.dialogStroke.addEventListener('change', updateSelectedDialogues);
}

function startDialogueEditing(dialogId) {
  const dialogue = getDialogueById(dialogId);
  if (!dialogue) return;
  const point = elements.svg.createSVGPoint();
  point.x = dialogue.x - dialogue.width / 2;
  point.y = dialogue.y - dialogue.height / 2;
  const matrix = elements.svg.getScreenCTM();
  if (!matrix) return;
  const topLeft = point.matrixTransform(matrix);
  const bottomRightPoint = elements.svg.createSVGPoint();
  bottomRightPoint.x = dialogue.x + dialogue.width / 2;
  bottomRightPoint.y = dialogue.y + dialogue.height / 2;
  const bottomRight = bottomRightPoint.matrixTransform(matrix);
  const rect = {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
  const textarea = document.createElement('textarea');
  textarea.value = dialogue.text;
  textarea.classList.add('editing-textbox');
  textarea.style.left = `${rect.left}px`;
  textarea.style.top = `${rect.top}px`;
  textarea.style.width = `${rect.width}px`;
  textarea.style.height = `${rect.height}px`;
  document.body.appendChild(textarea);
  textarea.focus();
  const finish = () => {
    dialogue.text = textarea.value;
    textarea.remove();
    renderAll();
  };
  textarea.addEventListener('blur', finish);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.metaKey) {
      textarea.blur();
    } else if (event.key === 'Escape') {
      textarea.value = dialogue.text;
      textarea.blur();
    }
  });
}

function setupPageControls() {
  elements.pageWidth.addEventListener('change', () => {
    state.page.width = Math.max(200, Number(elements.pageWidth.value) || 1000);
    updatePageDimensions(true);
  });
  elements.pageHeight.addEventListener('change', () => {
    state.page.height = Math.max(200, Number(elements.pageHeight.value) || 1600);
    updatePageDimensions(true);
  });
  elements.marginVertical.addEventListener('change', () => {
    state.page.marginVertical = Math.max(0, Number(elements.marginVertical.value) || 0);
    updatePageDimensions(true);
  });
  elements.marginHorizontal.addEventListener('change', () => {
    state.page.marginHorizontal = Math.max(0, Number(elements.marginHorizontal.value) || 0);
    updatePageDimensions(true);
  });
  elements.borderThickness.addEventListener('change', () => {
    state.page.borderThickness = Math.max(1, Number(elements.borderThickness.value) || 4);
    renderAll();
  });
  elements.areaColor.addEventListener('change', () => {
    state.page.areaColor = elements.areaColor.value;
    updateMangaAreaStyles();
  });
  elements.gapColor.addEventListener('change', () => {
    state.page.gapColor = elements.gapColor.value;
    updateGapColor();
  });
  elements.splitGapVertical.addEventListener('change', () => {
    state.split.verticalGap = Math.max(0, Number(elements.splitGapVertical.value) || 0);
  });
  elements.splitGapHorizontal.addEventListener('change', () => {
    state.split.horizontalGap = Math.max(0, Number(elements.splitGapHorizontal.value) || 0);
  });
  elements.toggleSplit.addEventListener('click', () => {
    toggleSplitMode();
    renderAll();
  });
}

function setupExport() {
  elements.exportButton.addEventListener('click', async () => {
    const format = elements.exportFormat.value;
    const quality = Number(elements.exportQuality.value) || 1;
    elements.page.classList.add('exporting');
    try {
      const canvas = await html2canvas(elements.page, {
        backgroundColor: state.page.gapColor === 'white' ? '#ffffff' : '#000000',
        scale: 2,
      });
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, quality);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `manga-page.${format}`;
      link.click();
    } catch (error) {
      console.error(error);
    } finally {
      elements.page.classList.remove('exporting');
    }
  });
}

function updateViewBox() {
  const { width, height } = state.areaSize;
  elements.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  elements.svg.setAttribute('width', width);
  elements.svg.setAttribute('height', height);
}

function setupCanvasEvents() {
  elements.svg.addEventListener('pointerdown', handlePointerDown);
  elements.svg.addEventListener('pointermove', handlePointerMove);
  elements.page.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('#manga-area')) return;
    event.preventDefault();
    state.currentInteraction = {
      type: 'canvas-pan',
      startPoint: { x: event.clientX, y: event.clientY },
      originalOffset: { ...state.view },
    };
  });
  elements.canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('#manga-area')) return;
    event.preventDefault();
    state.currentInteraction = {
      type: 'canvas-pan',
      startPoint: { x: event.clientX, y: event.clientY },
      originalOffset: { ...state.view },
    };
  });
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  elements.canvas.addEventListener('wheel', handleWheel, { passive: false });
}

function initialize() {
  updatePageDimensions(false);
  updateGapColor();
  resetPanels();
  setupPageControls();
  setupImageUpload();
  setupDialogueControls();
  setupExport();
  setupCanvasEvents();
  applyViewTransform();
}

initialize();
