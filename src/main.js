const svgNS = 'http://www.w3.org/2000/svg';

const elements = {
  importButton: document.getElementById('import-image'),
  hiddenImageInput: document.getElementById('hidden-image-input'),
  bubbleType: document.getElementById('bubble-type'),
  strokeWidth: document.getElementById('stroke-width'),
  insertBubble: document.getElementById('insert-bubble'),
  removeBubble: document.getElementById('remove-bubble'),
  viewport: document.getElementById('viewport'),
  scene: document.getElementById('scene'),
  bubbleLayer: document.getElementById('bubble-layer'),
  baseImage: document.getElementById('base-image'),
  pageFrameLayer: document.getElementById('page-frame-layer'),
  pageFrame: document.getElementById('page-frame'),
  panelLayer: document.getElementById('panel-layer'),
  placeholder: document.getElementById('placeholder'),
  selectionOverlay: document.getElementById('selection-overlay'),
  inlineEditor: document.getElementById('inline-editor'),
  zoomIndicator: document.getElementById('zoom-indicator'),
  positionIndicator: document.getElementById('position-indicator'),
  fontFamily: document.getElementById('font-family'),
  fontSize: document.getElementById('font-size'),
  toggleBold: document.getElementById('toggle-bold'),
  textContent: document.getElementById('text-content'),
  autoWrapToggle: document.getElementById('toggle-auto-wrap'),
  lineLength: document.getElementById('line-length'),
  lineLengthValue: document.getElementById('line-length-value'),
  frameMarginX: document.getElementById('frame-margin-x'),
  frameMarginY: document.getElementById('frame-margin-y'),
  panelStroke: document.getElementById('panel-stroke'),
  panelGapX: document.getElementById('panel-gap-x'),
  panelGapY: document.getElementById('panel-gap-y'),
  panelBackground: document.getElementById('panel-background'),
  panelRotation: document.getElementById('panel-rotation'),
  panelRotationValue: document.getElementById('panel-rotation-value'),
  undo: document.getElementById('undo'),
  exportFormat: document.getElementById('export-format'),
  exportButton: document.getElementById('export'),
  measureBox: document.getElementById('measure-box'),
  hiddenPanelImageInput: document.getElementById('hidden-panel-image-input'),
};

const HANDLE_DIRECTIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CONTROL_PADDING = 28;
const MIN_BODY_SIZE = 80;
const SPEECH_TAIL_ANGLE_DEGREES = 8;
const TRAILING_PUNCTUATION = new Set(['，', ',', '。', '.', '、', '！', '!', '？', '?', '；', ';', '：', ':']);
const MIN_PANEL_SIZE = 80;
const PANEL_SPLIT_DRAG_THRESHOLD = 16;
const PANEL_MOVE_THRESHOLD = 6;
const PANEL_GESTURE_DECISION_DISTANCE = 12;
const PANEL_EDGE_MOVE_MARGIN = 28;

const state = {
  canvas: { width: 1200, height: 1600 },
  image: { src: '', width: 0, height: 0 },
  viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
  bubbles: [],
  nextBubbleId: 1,
  selectedBubbleId: null,
  defaultStrokeWidth: 4,
  fontFamily: elements.fontFamily.value,
  fontSize: Number(elements.fontSize.value),
  bold: false,
  autoWrap: {
    enabled: true,
    charactersPerLine: 5,
  },
  history: [],
  historyIndex: -1,
  interaction: null,
  inlineEditingBubbleId: null,
  panels: {
    pageFrame: null,
    root: null,
    nextId: 1,
    selectedId: null,
    strokeWidth: 4,
    gapX: 16,
    gapY: 24,
    marginX: 60,
    marginY: 60,
    outerColor: '#ffffff',
    pendingImagePanelId: null,
  },
};

function getBubbleRawText(bubble) {
  if (typeof bubble.rawText !== 'string') {
    bubble.rawText = typeof bubble.text === 'string' ? bubble.text : '';
  }
  return bubble.rawText;
}

function setBubbleRawText(bubble, value) {
  bubble.rawText = value;
}

function getBubbleDisplayText(bubble) {
  const raw = getBubbleRawText(bubble);
  if (!raw) return '';
  if (!state.autoWrap.enabled) {
    return raw;
  }
  return applyAutoWrap(raw, state.autoWrap.charactersPerLine);
}

function updateBubbleText(bubble, rawText, options = {}) {
  const normalized = (rawText ?? '').replace(/\r\n?/g, '\n');
  setBubbleRawText(bubble, normalized);
  if (options.autoFit !== false) {
    autoFitBubbleToText(bubble, options.fitOptions || {});
  }
}

function applyAutoWrap(text, lineLength) {
  if (!text) return '';
  const maxPerLine = clamp(Math.floor(lineLength) || 5, 1, 20);
  const lines = [];
  let current = '';
  let count = 0;
  const flush = () => {
    lines.push(current);
    current = '';
    count = 0;
  };
  for (const char of text) {
    if (char === '\n') {
      flush();
      continue;
    }
    if (TRAILING_PUNCTUATION.has(char)) {
      if (!current) {
        let attached = false;
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          if (lines[index]) {
            lines[index] += char;
            attached = true;
            break;
          }
        }
        if (!attached) {
          current += char;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (count >= maxPerLine) {
      flush();
    }
    current += char;
    count += 1;
  }
  if (current) {
    lines.push(current);
  }
  return lines.join('\n');
}

function rawIndexFromDisplay(text, displayIndex) {
  let raw = 0;
  for (let i = 0; i < displayIndex && i < text.length; i += 1) {
    if (text[i] !== '\n') {
      raw += 1;
    }
  }
  return raw;
}

function displayIndexFromRaw(text, rawIndex) {
  if (rawIndex <= 0) return 0;
  let raw = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\n') {
      raw += 1;
      if (raw === rawIndex) {
        return i + 1;
      }
    }
  }
  return text.length;
}

function getPanelState() {
  return state.panels;
}

function ensurePageFrame() {
  const panels = getPanelState();
  if (!state.canvas.width || !state.canvas.height) {
    panels.pageFrame = null;
    panels.root = null;
    return;
  }
  const maxMarginX = Math.max(0, Math.floor(state.canvas.width / 2 - MIN_PANEL_SIZE));
  const maxMarginY = Math.max(0, Math.floor(state.canvas.height / 2 - MIN_PANEL_SIZE));
  panels.marginX = clamp(panels.marginX, 0, maxMarginX);
  panels.marginY = clamp(panels.marginY, 0, maxMarginY);
  const width = Math.max(MIN_PANEL_SIZE, state.canvas.width - panels.marginX * 2);
  const height = Math.max(MIN_PANEL_SIZE, state.canvas.height - panels.marginY * 2);
  panels.pageFrame = {
    x: panels.marginX,
    y: panels.marginY,
    width,
    height,
  };
  if (!panels.root) {
    panels.root = createPanelLeaf();
  }
}

function createPanelLeaf() {
  return {
    id: `panel-${state.panels.nextId++}`,
    type: 'leaf',
    parent: null,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    image: null,
  };
}

function collectPanelLeaves(node, result = []) {
  if (!node) return result;
  if (node.type === 'leaf') {
    result.push(node);
    return result;
  }
  node.children.forEach((child) => collectPanelLeaves(child, result));
  return result;
}

function findPanelById(node, id) {
  if (!node) return null;
  if (node.type === 'leaf') {
    return node.id === id ? node : null;
  }
  for (const child of node.children) {
    const found = findPanelById(child, id);
    if (found) return found;
  }
  return null;
}

function layoutPanelTree() {
  const panels = getPanelState();
  if (!panels.pageFrame || !panels.root) return;
  layoutPanelNode(panels.root, panels.pageFrame);
}

function layoutPanelNode(node, bounds) {
  const panels = getPanelState();
  node.rect = { ...bounds };
  if (node.type === 'leaf') {
    return;
  }
  const gapX = Math.max(0, panels.gapX);
  const gapY = Math.max(0, panels.gapY);
  if (node.orientation === 'vertical') {
    const usable = Math.max(0, bounds.width - gapX);
    let ratio = clamp(node.ratio ?? 0.5, 0.05, 0.95);
    let widthA = usable * ratio;
    let widthB = usable - widthA;
    if (widthA < MIN_PANEL_SIZE) {
      widthA = MIN_PANEL_SIZE;
      widthB = Math.max(MIN_PANEL_SIZE, usable - widthA);
      ratio = usable > 0 ? widthA / usable : 0.5;
    }
    if (widthB < MIN_PANEL_SIZE) {
      widthB = MIN_PANEL_SIZE;
      widthA = Math.max(MIN_PANEL_SIZE, usable - widthB);
      ratio = usable > 0 ? widthA / usable : 0.5;
    }
    node.ratio = ratio;
    const childA = node.children[0];
    const childB = node.children[1];
    const boundsA = {
      x: bounds.x,
      y: bounds.y,
      width: widthA,
      height: bounds.height,
    };
    const boundsB = {
      x: bounds.x + widthA + gapX,
      y: bounds.y,
      width: Math.max(0, bounds.width - widthA - gapX),
      height: bounds.height,
    };
    layoutPanelNode(childA, boundsA);
    layoutPanelNode(childB, boundsB);
    return;
  }
  const usable = Math.max(0, bounds.height - gapY);
  let ratio = clamp(node.ratio ?? 0.5, 0.05, 0.95);
  let heightA = usable * ratio;
  let heightB = usable - heightA;
  if (heightA < MIN_PANEL_SIZE) {
    heightA = MIN_PANEL_SIZE;
    heightB = Math.max(MIN_PANEL_SIZE, usable - heightA);
    ratio = usable > 0 ? heightA / usable : 0.5;
  }
  if (heightB < MIN_PANEL_SIZE) {
    heightB = MIN_PANEL_SIZE;
    heightA = Math.max(MIN_PANEL_SIZE, usable - heightB);
    ratio = usable > 0 ? heightA / usable : 0.5;
  }
  node.ratio = ratio;
  const childA = node.children[0];
  const childB = node.children[1];
  const boundsA = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: heightA,
  };
  const boundsB = {
    x: bounds.x,
    y: bounds.y + heightA + gapY,
    width: bounds.width,
    height: Math.max(0, bounds.height - heightA - gapY),
  };
  layoutPanelNode(childA, boundsA);
  layoutPanelNode(childB, boundsB);
}

function getSelectedPanel() {
  const panels = getPanelState();
  if (!panels.selectedId) return null;
  return findPanelById(panels.root, panels.selectedId);
}

function setSelectedPanel(id) {
  const panels = getPanelState();
  if (panels.selectedId === id) {
    updatePanelRotationControl();
    updatePanelOverlay();
    return;
  }
  if (id) {
    setSelectedBubble(null);
  }
  panels.selectedId = id;
  updatePanelRotationControl();
  render();
}

function getPanelHandlePosition(rect, direction) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const positions = {
    n: { x: centerX, y: rect.y },
    s: { x: centerX, y: rect.y + rect.height },
    e: { x: rect.x + rect.width, y: centerY },
    w: { x: rect.x, y: centerY },
    nw: { x: rect.x, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y },
    se: { x: rect.x + rect.width, y: rect.y + rect.height },
    sw: { x: rect.x, y: rect.y + rect.height },
  };
  return positions[direction];
}

function updatePanelOverlay() {
  if (!panelOverlay.container) return;
  const panel = getSelectedPanel();
  if (!panel) {
    panelOverlay.container.classList.add('hidden');
    if (!state.selectedBubbleId) {
      elements.positionIndicator.textContent = '';
    }
    return;
  }
  panelOverlay.container.classList.remove('hidden');
  const rect = panel.rect;
  const topLeft = worldToScreen({ x: rect.x, y: rect.y });
  const bottomRight = worldToScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
  panelOverlay.box.style.left = `${topLeft.x}px`;
  panelOverlay.box.style.top = `${topLeft.y}px`;
  panelOverlay.box.style.width = `${Math.max(0, bottomRight.x - topLeft.x)}px`;
  panelOverlay.box.style.height = `${Math.max(0, bottomRight.y - topLeft.y)}px`;
  elements.positionIndicator.textContent = `格框：(${rect.x.toFixed(0)}, ${rect.y.toFixed(0)}) 尺寸：${rect.width.toFixed(0)}×${rect.height.toFixed(0)}`;
  HANDLE_DIRECTIONS.forEach((dir) => {
    const handle = panelOverlay.handles.get(dir);
    if (!handle) return;
    const pos = getPanelHandlePosition(rect, dir);
    const screen = worldToScreen(pos);
    handle.style.left = `${screen.x}px`;
    handle.style.top = `${screen.y}px`;
  });
}

function getPanelBoundaryController(panel, side) {
  let current = panel;
  while (current && current.parent) {
    const parent = current.parent;
    const index = parent.children.indexOf(current);
    if (side === 'left' && parent.orientation === 'vertical' && index === 1) {
      return { node: parent, orientation: 'vertical', index, side };
    }
    if (side === 'right' && parent.orientation === 'vertical' && index === 0) {
      return { node: parent, orientation: 'vertical', index, side };
    }
    if (side === 'top' && parent.orientation === 'horizontal' && index === 1) {
      return { node: parent, orientation: 'horizontal', index, side };
    }
    if (side === 'bottom' && parent.orientation === 'horizontal' && index === 0) {
      return { node: parent, orientation: 'horizontal', index, side };
    }
    current = parent;
  }
  return null;
}

function setPanelBoundaryPosition(controller, newPosition) {
  if (!controller) return;
  const { node, orientation, side } = controller;
  const panels = getPanelState();
  const gap = orientation === 'vertical' ? panels.gapX : panels.gapY;
  const rect = node.rect;
  const total = orientation === 'vertical' ? rect.width - gap : rect.height - gap;
  if (total <= 0) return;
  const minRatio = Math.min(0.5, MIN_PANEL_SIZE / Math.max(total, 1));
  if (orientation === 'vertical') {
    if (side === 'right') {
      const width = clamp(newPosition - rect.x, MIN_PANEL_SIZE, total - MIN_PANEL_SIZE);
      node.ratio = clamp(width / total, minRatio, 1 - minRatio);
    } else if (side === 'left') {
      const rightEdge = rect.x + rect.width;
      const rightWidth = clamp(rightEdge - gap - newPosition, MIN_PANEL_SIZE, total - MIN_PANEL_SIZE);
      const leftWidth = total - rightWidth;
      node.ratio = clamp(leftWidth / total, minRatio, 1 - minRatio);
    }
  } else {
    if (side === 'bottom') {
      const height = clamp(newPosition - rect.y, MIN_PANEL_SIZE, total - MIN_PANEL_SIZE);
      node.ratio = clamp(height / total, minRatio, 1 - minRatio);
    } else if (side === 'top') {
      const bottomEdge = rect.y + rect.height;
      const bottomHeight = clamp(bottomEdge - gap - newPosition, MIN_PANEL_SIZE, total - MIN_PANEL_SIZE);
      const topHeight = total - bottomHeight;
      node.ratio = clamp(topHeight / total, minRatio, 1 - minRatio);
    }
  }
}

function splitPanel(panel, orientation, splitPoint) {
  const panels = getPanelState();
  const usableWidth = panel.rect.width - panels.gapX;
  const usableHeight = panel.rect.height - panels.gapY;
  if (orientation === 'vertical' && usableWidth < MIN_PANEL_SIZE * 2) return false;
  if (orientation === 'horizontal' && usableHeight < MIN_PANEL_SIZE * 2) return false;
  const parent = panel.parent;
  const splitNode = {
    type: 'split',
    orientation,
    ratio: 0.5,
    children: [],
    parent,
    rect: { ...panel.rect },
  };
  const first = panel;
  const second = createPanelLeaf();
  first.parent = splitNode;
  second.parent = splitNode;
  if (orientation === 'vertical') {
    const usable = Math.max(1, panel.rect.width - panels.gapX);
    const local = clamp(splitPoint.x - panel.rect.x, MIN_PANEL_SIZE, panel.rect.width - MIN_PANEL_SIZE);
    const ratio = clamp((local - panels.gapX / 2) / usable, MIN_PANEL_SIZE / usable, 1 - MIN_PANEL_SIZE / usable);
    splitNode.ratio = ratio;
    splitNode.children = [first, second];
  } else {
    const usable = Math.max(1, panel.rect.height - panels.gapY);
    const local = clamp(splitPoint.y - panel.rect.y, MIN_PANEL_SIZE, panel.rect.height - MIN_PANEL_SIZE);
    const ratio = clamp((local - panels.gapY / 2) / usable, MIN_PANEL_SIZE / usable, 1 - MIN_PANEL_SIZE / usable);
    splitNode.ratio = ratio;
    splitNode.children = [first, second];
  }
  if (parent) {
    const index = parent.children.indexOf(panel);
    parent.children[index] = splitNode;
  } else {
    panels.root = splitNode;
  }
  second.image = null;
  layoutPanelTree();
  setSelectedPanel(first.id);
  return true;
}

function movePanel(panel, deltaX, deltaY) {
  const originalRect = { ...panel.rect };
  const leftController = getPanelBoundaryController(panel, 'left');
  const rightController = getPanelBoundaryController(panel, 'right');
  const topController = getPanelBoundaryController(panel, 'top');
  const bottomController = getPanelBoundaryController(panel, 'bottom');
  const nextLeft = originalRect.x + deltaX;
  const nextRight = originalRect.x + originalRect.width + deltaX;
  const nextTop = originalRect.y + deltaY;
  const nextBottom = originalRect.y + originalRect.height + deltaY;
  if (leftController && rightController) {
    setPanelBoundaryPosition(leftController, nextLeft);
    setPanelBoundaryPosition(rightController, nextRight);
  }
  if (topController && bottomController) {
    setPanelBoundaryPosition(topController, nextTop);
    setPanelBoundaryPosition(bottomController, nextBottom);
  }
  layoutPanelTree();
}

function determinePanelGestureIntent(panel, worldPoint, event) {
  if (event.altKey || event.metaKey) {
    return 'move';
  }
  const rect = panel.rect;
  const distanceToEdge = Math.min(
    Math.abs(worldPoint.x - rect.x),
    Math.abs(worldPoint.x - (rect.x + rect.width)),
    Math.abs(worldPoint.y - rect.y),
    Math.abs(worldPoint.y - (rect.y + rect.height)),
  );
  if (distanceToEdge <= PANEL_EDGE_MOVE_MARGIN) {
    return 'move';
  }
  return 'split';
}

function handlePanelPointerDown(event) {
  const panelElement = event.target.closest('.panel');
  if (!panelElement) {
    if (event.button === 0) {
      setSelectedPanel(null);
    }
    return;
  }
  const panelId = panelElement.dataset.panelId;
  const panel = findPanelById(state.panels.root, panelId);
  if (!panel) return;
  setSelectedPanel(panel.id);
  const worldPoint = screenToWorld({ x: event.clientX, y: event.clientY });
  if (event.button === 2) {
    if (panel.image && panel.image.src) {
      event.preventDefault();
      state.interaction = {
        type: 'panel-image-pan',
        pointerId: event.pointerId,
        panelId: panel.id,
        startX: event.clientX,
        startY: event.clientY,
        imageStart: {
          offsetX: panel.image.offsetX || 0,
          offsetY: panel.image.offsetY || 0,
        },
      };
      try {
        elements.viewport.setPointerCapture(event.pointerId);
      } catch (error) {
        /* ignore */
      }
    }
    return;
  }
  if (event.button !== 0) return;
  event.preventDefault();
  const intent = determinePanelGestureIntent(panel, worldPoint, event);
  state.interaction = {
    type: 'panel-gesture',
    pointerId: event.pointerId,
    panelId: panel.id,
    startX: event.clientX,
    startY: event.clientY,
    startPoint: worldPoint,
    intent,
  };
  try {
    elements.viewport.setPointerCapture(event.pointerId);
  } catch (error) {
    /* ignore */
  }
}

function handlePanelContextMenu(event) {
  if (event.target.closest('.panel')) {
    event.preventDefault();
  }
}

function handlePanelDoubleClick(event) {
  const panelElement = event.target.closest('.panel');
  if (!panelElement) return;
  event.preventDefault();
  const panelId = panelElement.dataset.panelId;
  const panel = findPanelById(state.panels.root, panelId);
  if (!panel) return;
  setSelectedPanel(panel.id);
  state.panels.pendingImagePanelId = panel.id;
  const input = elements.hiddenPanelImageInput;
  if (!input) return;
  input.value = '';
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch (error) {
      // ignore and fallback
    }
  }
  input.click();
}

function startPanelOverlayMove(event) {
  if (event.button !== 0) return;
  const panel = getSelectedPanel();
  if (!panel) return;
  event.preventDefault();
  event.stopPropagation();
  state.interaction = {
    type: 'panel-move',
    pointerId: event.pointerId,
    panelId: panel.id,
    startX: event.clientX,
    startY: event.clientY,
    appliedX: 0,
    appliedY: 0,
  };
  try {
    elements.viewport.setPointerCapture(event.pointerId);
  } catch (error) {
    /* ignore */
  }
}

function handlePanelWheel(event) {
  const panelElement = event.target.closest('.panel');
  if (!panelElement) return;
  const panelId = panelElement.dataset.panelId;
  const panel = findPanelById(state.panels.root, panelId);
  if (!panel || !panel.image) return;
  event.preventDefault();
  const scale = panel.image.scale ?? 1;
  const factor = Math.exp(-event.deltaY * 0.0015);
  const newScale = clamp(scale * factor, 0.1, 10);
  panel.image.scale = newScale;
  renderPanels();
  updatePanelOverlay();
  scheduleHistoryCommit();
}

function handlePanelImageSelection(event) {
  const [file] = event.target.files;
  event.target.value = '';
  const panelId = state.panels.pendingImagePanelId;
  state.panels.pendingImagePanelId = null;
  if (!file || !panelId) return;
  readFileAsDataURL(file)
    .then((dataUrl) => loadPanelImage(panelId, dataUrl))
    .catch((error) => {
      console.error('加载格框图片失败', error);
    });
}

function loadPanelImage(panelId, dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const panel = findPanelById(state.panels.root, panelId);
      if (panel) {
        panel.image = {
          src: dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          scale: Math.min(panel.rect.width / img.naturalWidth, panel.rect.height / img.naturalHeight) || 1,
          rotation: 0,
          offsetX: 0,
          offsetY: 0,
        };
        setSelectedPanel(panel.id);
        scheduleHistoryCommit();
      }
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function updatePanelRotationControl() {
  const panel = getSelectedPanel();
  if (!panel || !panel.image) {
    elements.panelRotation.value = '0';
    elements.panelRotation.disabled = true;
    elements.panelRotationValue.textContent = '0';
    return;
  }
  const rotation = panel.image.rotation ?? 0;
  elements.panelRotation.disabled = false;
  elements.panelRotation.value = `${rotation}`;
  elements.panelRotationValue.textContent = `${Math.round(rotation)}`;
}

function updatePanelControlsAvailability() {
  const enabled = Boolean(state.image && state.image.src);
  const controls = [
    elements.frameMarginX,
    elements.frameMarginY,
    elements.panelStroke,
    elements.panelGapX,
    elements.panelGapY,
    elements.panelBackground,
  ];
  controls.forEach((control) => {
    if (control) {
      control.disabled = !enabled;
    }
  });
  if (!enabled && elements.panelRotation) {
    elements.panelRotation.disabled = true;
    elements.panelRotation.value = '0';
    if (elements.panelRotationValue) {
      elements.panelRotationValue.textContent = '0';
    }
  }
}

function handlePanelRotationInput() {
  const panel = getSelectedPanel();
  if (!panel || !panel.image) return;
  const value = clamp(Number(elements.panelRotation.value) || 0, -180, 180);
  panel.image.rotation = value;
  elements.panelRotationValue.textContent = `${Math.round(value)}`;
  renderPanels();
  updatePanelOverlay();
  scheduleHistoryCommit();
}

function handlePanelMarginInput() {
  const panels = getPanelState();
  const marginX = clamp(Number(elements.frameMarginX.value) || panels.marginX, 0, state.canvas.width / 2);
  const marginY = clamp(Number(elements.frameMarginY.value) || panels.marginY, 0, state.canvas.height / 2);
  panels.marginX = marginX;
  panels.marginY = marginY;
  elements.frameMarginX.value = `${marginX}`;
  elements.frameMarginY.value = `${marginY}`;
  ensurePageFrame();
  layoutPanelTree();
  render();
  scheduleHistoryCommit();
}

function handlePanelStrokeInput() {
  const panels = getPanelState();
  const stroke = clamp(Number(elements.panelStroke.value) || panels.strokeWidth, 1, 60);
  panels.strokeWidth = stroke;
  elements.panelStroke.value = `${stroke}`;
  renderPanels();
  scheduleHistoryCommit();
}

function handlePanelGapInput() {
  const panels = getPanelState();
  panels.gapX = clamp(Number(elements.panelGapX.value) || panels.gapX, 0, 400);
  panels.gapY = clamp(Number(elements.panelGapY.value) || panels.gapY, 0, 400);
  elements.panelGapX.value = `${panels.gapX}`;
  elements.panelGapY.value = `${panels.gapY}`;
  layoutPanelTree();
  render();
  scheduleHistoryCommit();
}

function handlePanelBackgroundInput() {
  const panels = getPanelState();
  panels.outerColor = elements.panelBackground.value;
  renderPanels();
  scheduleHistoryCommit();
}

function startPanelResize(event, direction) {
  event.preventDefault();
  event.stopPropagation();
  const panel = getSelectedPanel();
  if (!panel) return;
  const controllers = {
    left: direction.includes('w') ? getPanelBoundaryController(panel, 'left') : null,
    right: direction.includes('e') ? getPanelBoundaryController(panel, 'right') : null,
    top: direction.includes('n') ? getPanelBoundaryController(panel, 'top') : null,
    bottom: direction.includes('s') ? getPanelBoundaryController(panel, 'bottom') : null,
  };
  state.interaction = {
    type: 'panel-resize',
    pointerId: event.pointerId,
    panelId: panel.id,
    direction,
    startX: event.clientX,
    startY: event.clientY,
    startRect: { ...panel.rect },
    controllers,
  };
  try {
    elements.viewport.setPointerCapture(event.pointerId);
  } catch (error) {
    /* ignore */
  }
}

function serializePanelNode(node) {
  if (!node) return null;
  if (node.type === 'leaf') {
    return {
      type: 'leaf',
      id: node.id,
      image: node.image
        ? {
            ...node.image,
          }
        : null,
    };
  }
  return {
    type: 'split',
    orientation: node.orientation,
    ratio: node.ratio,
    children: node.children.map((child) => serializePanelNode(child)),
  };
}

function restorePanelNode(data, parent = null) {
  if (!data) return null;
  if (data.type === 'leaf') {
    return {
      id: data.id,
      type: 'leaf',
      parent,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      image: data.image
        ? {
            ...data.image,
          }
        : null,
    };
  }
  const node = {
    type: 'split',
    orientation: data.orientation,
    ratio: data.ratio,
    parent,
    children: [],
    rect: { x: 0, y: 0, width: 0, height: 0 },
  };
  node.children = data.children.map((child) => restorePanelNode(child, node));
  return node;
}

function serializePanels() {
  const panels = getPanelState();
  return {
    nextId: panels.nextId,
    selectedId: panels.selectedId,
    strokeWidth: panels.strokeWidth,
    gapX: panels.gapX,
    gapY: panels.gapY,
    marginX: panels.marginX,
    marginY: panels.marginY,
    outerColor: panels.outerColor,
    root: serializePanelNode(panels.root),
  };
}

function restorePanels(snapshot) {
  const panels = getPanelState();
  if (!snapshot) {
    panels.pageFrame = null;
    panels.root = null;
    panels.selectedId = null;
    panelElements.clear();
    renderPanels();
    updatePanelOverlay();
    updatePanelRotationControl();
    updatePanelControlsAvailability();
    return;
  }
  panels.nextId = snapshot.nextId;
  panels.selectedId = snapshot.selectedId;
  panels.strokeWidth = snapshot.strokeWidth;
  panels.gapX = snapshot.gapX;
  panels.gapY = snapshot.gapY;
  panels.marginX = snapshot.marginX;
  panels.marginY = snapshot.marginY;
  panels.outerColor = snapshot.outerColor;
  panels.root = restorePanelNode(snapshot.root);
  ensurePageFrame();
  layoutPanelTree();
  renderPanels();
  updatePanelOverlay();
  updatePanelRotationControl();
  elements.frameMarginX.value = `${panels.marginX}`;
  elements.frameMarginY.value = `${panels.marginY}`;
  elements.panelStroke.value = `${panels.strokeWidth}`;
  elements.panelGapX.value = `${panels.gapX}`;
  elements.panelGapY.value = `${panels.gapY}`;
  elements.panelBackground.value = panels.outerColor;
  updatePanelControlsAvailability();
}

const overlay = {
  box: null,
  handles: new Map(),
  tailHandle: null,
};

const panelOverlay = {
  container: null,
  box: null,
  handles: new Map(),
};

const panelElements = new Map();

let imagePickerInFlight = false;

function init() {
  setupSelectionOverlay();
  setupPanelOverlay();
  attachEvents();
  updateAutoWrapControls();
  updatePanelControlsAvailability();
  updatePanelRotationControl();
  updateSceneSize(state.canvas.width, state.canvas.height);
  fitViewport();
  updateSceneTransform();
  pushHistory();
  render();
}

function setupSelectionOverlay() {
  overlay.box = document.createElement('div');
  overlay.box.className = 'selection-box';
  elements.selectionOverlay.appendChild(overlay.box);

  HANDLE_DIRECTIONS.forEach((dir) => {
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.dataset.direction = dir;
    handle.addEventListener('pointerdown', (event) => startResize(event, dir));
    elements.selectionOverlay.appendChild(handle);
    overlay.handles.set(dir, handle);
  });

  overlay.tailHandle = document.createElement('div');
  overlay.tailHandle.id = 'tail-handle';
  overlay.tailHandle.addEventListener('pointerdown', startTailDrag);
  elements.selectionOverlay.appendChild(overlay.tailHandle);
}

function setupPanelOverlay() {
  panelOverlay.container = document.createElement('div');
  panelOverlay.container.id = 'panel-selection-overlay';
  panelOverlay.box = document.createElement('div');
  panelOverlay.box.className = 'selection-box';
  panelOverlay.box.addEventListener('pointerdown', startPanelOverlayMove);
  panelOverlay.container.appendChild(panelOverlay.box);
  HANDLE_DIRECTIONS.forEach((dir) => {
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.dataset.direction = dir;
    handle.addEventListener('pointerdown', (event) => startPanelResize(event, dir));
    panelOverlay.container.appendChild(handle);
    panelOverlay.handles.set(dir, handle);
  });
  panelOverlay.container.classList.add('hidden');
  elements.viewport.appendChild(panelOverlay.container);
}

function attachEvents() {
  elements.importButton.addEventListener('click', handleImportButtonClick);
  elements.hiddenImageInput.addEventListener('change', handleImageSelection);
  elements.insertBubble.addEventListener('click', insertBubbleFromControls);
  elements.removeBubble.addEventListener('click', removeSelectedBubble);
  elements.strokeWidth.addEventListener('change', handleStrokeChange);
  elements.fontFamily.addEventListener('change', handleFontFamilyChange);
  elements.fontSize.addEventListener('change', handleFontSizeChange);
  elements.toggleBold.addEventListener('click', toggleBold);
  elements.textContent.addEventListener('input', handleTextInput);
  elements.autoWrapToggle.addEventListener('click', toggleAutoWrap);
  elements.lineLength.addEventListener('input', handleLineLengthInput);
  elements.frameMarginX.addEventListener('change', handlePanelMarginInput);
  elements.frameMarginY.addEventListener('change', handlePanelMarginInput);
  elements.panelStroke.addEventListener('change', handlePanelStrokeInput);
  elements.panelGapX.addEventListener('change', handlePanelGapInput);
  elements.panelGapY.addEventListener('change', handlePanelGapInput);
  elements.panelBackground.addEventListener('change', handlePanelBackgroundInput);
  elements.panelRotation.addEventListener('input', handlePanelRotationInput);
  elements.undo.addEventListener('click', undo);
  elements.exportButton.addEventListener('click', exportArtwork);

  elements.viewport.addEventListener('wheel', handleWheel, { passive: false });
  elements.viewport.addEventListener('pointerdown', handleViewportPointerDown);
  elements.viewport.addEventListener('dblclick', handleViewportDoubleClick);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);

  elements.bubbleLayer.addEventListener('pointerdown', handleBubblePointerDown);
  elements.bubbleLayer.addEventListener('dblclick', handleBubbleDoubleClick);

  elements.panelLayer.addEventListener('pointerdown', handlePanelPointerDown);
  elements.panelLayer.addEventListener('dblclick', handlePanelDoubleClick);
  elements.panelLayer.addEventListener('contextmenu', handlePanelContextMenu);
  elements.panelLayer.addEventListener('wheel', handlePanelWheel, { passive: false });

  elements.hiddenPanelImageInput.addEventListener('change', handlePanelImageSelection);

  document.addEventListener('keydown', handleKeyDown);
}

function handleImportButtonClick() {
  openImagePicker();
}

function handleViewportDoubleClick(event) {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-bubble-id]')) {
    return;
  }
  if (state.inlineEditingBubbleId) {
    return;
  }
  openImagePicker();
}

function handleImageSelection(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  readFileAsDataURL(file)
    .then((dataUrl) => loadImage(dataUrl))
    .catch((error) => {
      console.error('读取图片失败', error);
    });
}

function openImagePicker() {
  if (imagePickerInFlight) {
    return;
  }
  imagePickerInFlight = true;
  try {
    const input = elements.hiddenImageInput;
    if (!input) {
      return;
    }
    input.value = '';
    let pickerShown = false;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        pickerShown = true;
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        console.warn('showPicker 不可用，回退到 click()', error);
      }
    }
    if (!pickerShown) {
      input.click();
    }
  } finally {
    imagePickerInFlight = false;
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('无法解析为 DataURL'));
      }
    };
    reader.onerror = () => {
      reject(reader.error || new Error('文件读取失败'));
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  const img = new Image();
  img.onload = () => {
    state.image = { src: dataUrl, width: img.naturalWidth, height: img.naturalHeight };
    elements.baseImage.src = dataUrl;
    elements.baseImage.width = img.naturalWidth;
    elements.baseImage.height = img.naturalHeight;
    updateSceneSize(img.naturalWidth, img.naturalHeight);
    fitViewport();
    elements.placeholder.style.display = 'none';
    ensurePageFrame();
    layoutPanelTree();
    updatePanelControlsAvailability();
    pushHistory();
    render();
  };
  img.src = dataUrl;
}

function updateSceneSize(width, height) {
  state.canvas.width = width;
  state.canvas.height = height;
  elements.scene.style.width = `${width}px`;
  elements.scene.style.height = `${height}px`;
  elements.bubbleLayer.setAttribute('width', width);
  elements.bubbleLayer.setAttribute('height', height);
  elements.bubbleLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  elements.pageFrameLayer.style.width = `${width}px`;
  elements.pageFrameLayer.style.height = `${height}px`;
  elements.panelLayer.style.width = `${width}px`;
  elements.panelLayer.style.height = `${height}px`;
}

function fitViewport() {
  const { clientWidth, clientHeight } = elements.viewport;
  const scaleX = clientWidth / state.canvas.width;
  const scaleY = clientHeight / state.canvas.height;
  const zoom = Math.min(scaleX, scaleY) * 0.9;
  state.viewport.zoom = clamp(zoom || 1, 0.1, 4);
  const offsetX = (clientWidth - state.canvas.width * state.viewport.zoom) / 2;
  const offsetY = (clientHeight - state.canvas.height * state.viewport.zoom) / 2;
  state.viewport.offsetX = offsetX;
  state.viewport.offsetY = offsetY;
  updateSceneTransform();
}

function updateSceneTransform() {
  const { zoom, offsetX, offsetY } = state.viewport;
  elements.scene.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
  elements.zoomIndicator.textContent = `缩放：${Math.round(zoom * 100)}%`;
  updateSelectionOverlay();
}

function worldToScreen(point) {
  const { zoom, offsetX, offsetY } = state.viewport;
  return {
    x: offsetX + point.x * zoom,
    y: offsetY + point.y * zoom,
  };
}

function screenToWorld(point) {
  const { zoom, offsetX, offsetY } = state.viewport;
  return {
    x: (point.x - offsetX) / zoom,
    y: (point.y - offsetY) / zoom,
  };
}

function screenDeltaToWorld(deltaX, deltaY) {
  const { zoom } = state.viewport;
  return {
    x: deltaX / zoom,
    y: deltaY / zoom,
  };
}

function insertBubbleFromControls() {
  const type = elements.bubbleType.value;
  insertBubble(type);
}

function insertBubble(type) {
  const width = Math.max(320, state.canvas.width * 0.3);
  const height = Math.max(220, state.canvas.height * 0.2);
  const x = (state.canvas.width - width) / 2;
  const y = (state.canvas.height - height) / 2;
  const bubble = {
    id: `bubble-${state.nextBubbleId++}`,
    type,
    x,
    y,
    width,
    height,
    padding: Math.max(36, Math.min(width, height) * 0.18),
    strokeWidth: Number(elements.strokeWidth.value) || state.defaultStrokeWidth,
    fontFamily: state.fontFamily,
    fontSize: state.fontSize,
    bold: state.bold,
    text: '',
    rawText: '',
    tail: createDefaultTail(type, x, y, width, height),
  };
  state.bubbles.push(bubble);
  setSelectedBubble(bubble.id);
  pushHistory();
  render();
}

function createDefaultTail(type, x, y, width, height) {
  const base = { anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: 0.45 } };
  if (type === 'speech-left') {
    base.anchor = { x: 0, y: 0.15 };
    base.offset = { x: -0.45, y: 0.2 };
  } else if (type === 'speech-right') {
    base.anchor = { x: 1, y: 0.15 };
    base.offset = { x: 0.45, y: 0.2 };
  } else if (type === 'thought') {
    base.anchor = { x: 0.5, y: 1 };
    base.offset = { x: 0, y: 0.55 };
  } else if (type === 'thought-left') {
    base.anchor = { x: 0.15, y: 1 };
    base.offset = { x: -0.55, y: 0.35 };
  } else if (type === 'thought-right') {
    base.anchor = { x: 0.85, y: 1 };
    base.offset = { x: 0.55, y: 0.35 };
  }
  if (type.startsWith('speech') || type.startsWith('thought')) {
    return base;
  }
  return null;
}

function setSelectedBubble(id) {
  if (state.inlineEditingBubbleId && state.inlineEditingBubbleId !== id) {
    elements.inlineEditor.blur();
  }
  if (id) {
    state.panels.selectedId = null;
    updatePanelRotationControl();
    updatePanelOverlay();
  }
  state.selectedBubbleId = id;
  updateControlsFromSelection();
  render();
}

function getSelectedBubble() {
  return state.bubbles.find((bubble) => bubble.id === state.selectedBubbleId) || null;
}

function removeSelectedBubble() {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  state.bubbles = state.bubbles.filter((item) => item.id !== bubble.id);
  state.selectedBubbleId = null;
  pushHistory();
  render();
  updateControlsFromSelection();
}

function handleStrokeChange() {
  const value = Number(elements.strokeWidth.value) || state.defaultStrokeWidth;
  state.defaultStrokeWidth = value;
  const bubble = getSelectedBubble();
  if (bubble) {
    bubble.strokeWidth = value;
    pushHistory();
    render();
  }
}

function handleFontFamilyChange() {
  state.fontFamily = elements.fontFamily.value;
  const bubble = getSelectedBubble();
  if (bubble) {
    bubble.fontFamily = state.fontFamily;
    autoFitBubbleToText(bubble);
    pushHistory();
    render();
  }
}

function handleFontSizeChange() {
  const size = clamp(Number(elements.fontSize.value) || state.fontSize, 10, 200);
  elements.fontSize.value = size;
  state.fontSize = size;
  const bubble = getSelectedBubble();
  if (bubble) {
    bubble.fontSize = size;
    autoFitBubbleToText(bubble);
    pushHistory();
    render();
  }
}

function toggleBold() {
  state.bold = !state.bold;
  elements.toggleBold.dataset.active = state.bold ? 'true' : 'false';
  const bubble = getSelectedBubble();
  if (bubble) {
    bubble.bold = state.bold;
    autoFitBubbleToText(bubble);
    pushHistory();
    render();
  }
}

function updateAutoWrapControls() {
  if (elements.autoWrapToggle) {
    elements.autoWrapToggle.dataset.enabled = state.autoWrap.enabled ? 'true' : 'false';
    elements.autoWrapToggle.textContent = state.autoWrap.enabled ? '关闭自动换行' : '开启自动换行';
  }
  if (elements.lineLength) {
    elements.lineLength.disabled = !state.autoWrap.enabled;
    elements.lineLength.value = String(state.autoWrap.charactersPerLine);
  }
  if (elements.lineLengthValue) {
    elements.lineLengthValue.textContent = String(state.autoWrap.charactersPerLine);
  }
}

function refitAllBubblesToText() {
  state.bubbles.forEach((bubble) => {
    autoFitBubbleToText(bubble);
  });
  render();
  if (state.inlineEditingBubbleId) {
    const editing = state.bubbles.find((item) => item.id === state.inlineEditingBubbleId);
    if (editing) {
      openInlineEditor(editing);
    }
  }
}

function toggleAutoWrap() {
  state.autoWrap.enabled = !state.autoWrap.enabled;
  updateAutoWrapControls();
  refitAllBubblesToText();
  updateControlsFromSelection();
  pushHistory();
}

function handleLineLengthInput() {
  const value = clamp(Number(elements.lineLength.value) || state.autoWrap.charactersPerLine, 4, 10);
  state.autoWrap.charactersPerLine = value;
  updateAutoWrapControls();
  if (state.autoWrap.enabled) {
    refitAllBubblesToText();
  } else {
    render();
  }
  scheduleHistoryCommit();
}

function handleTextInput() {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  updateBubbleText(bubble, elements.textContent.value);
  render();
  if (state.inlineEditingBubbleId === bubble.id) {
    openInlineEditor(bubble);
  }
  scheduleHistoryCommit();
}

let historyCommitTimer = null;
function scheduleHistoryCommit() {
  clearTimeout(historyCommitTimer);
  historyCommitTimer = setTimeout(() => {
    pushHistory();
  }, 400);
}

function handleWheel(event) {
  event.preventDefault();
  if (!state.canvas.width || !state.canvas.height) return;
  const { offsetX, offsetY, deltaY } = event;
  const currentZoom = state.viewport.zoom;
  const factor = Math.exp(-deltaY * 0.0015);
  const newZoom = clamp(currentZoom * factor, 0.1, 6);
  const worldX = (offsetX - state.viewport.offsetX) / currentZoom;
  const worldY = (offsetY - state.viewport.offsetY) / currentZoom;
  state.viewport.zoom = newZoom;
  state.viewport.offsetX = offsetX - worldX * newZoom;
  state.viewport.offsetY = offsetY - worldY * newZoom;
  updateSceneTransform();
}

function handleViewportPointerDown(event) {
  if (event.button !== 0) return;
  const target = event.target;
  if (target.closest('[data-bubble-id]')) {
    return;
  }
  if (state.selectedBubbleId) {
    setSelectedBubble(null);
  }
  if (state.inlineEditingBubbleId) {
    elements.inlineEditor.blur();
  }
  state.interaction = {
    type: 'pan',
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: state.viewport.offsetX,
    offsetY: state.viewport.offsetY,
  };
  elements.viewport.setPointerCapture(event.pointerId);
}

function handleBubblePointerDown(event) {
  if (event.button !== 0) return;
  const bubbleElement = event.target.closest('[data-bubble-id]');
  if (!bubbleElement) return;
  event.stopPropagation();
  const bubbleId = bubbleElement.dataset.bubbleId;
  const bubble = state.bubbles.find((item) => item.id === bubbleId);
  if (!bubble) return;
  setSelectedBubble(bubble.id);
  state.interaction = {
    type: 'move-bubble',
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    bubbleId: bubble.id,
    bubbleStart: { x: bubble.x, y: bubble.y },
  };
  window.getSelection()?.removeAllRanges();
  elements.viewport.setPointerCapture(event.pointerId);
}

function handleBubbleDoubleClick(event) {
  const bubbleElement = event.target.closest('[data-bubble-id]');
  if (!bubbleElement) return;
  event.stopPropagation();
  const bubbleId = bubbleElement.dataset.bubbleId;
  const bubble = state.bubbles.find((item) => item.id === bubbleId);
  if (!bubble) return;
  setSelectedBubble(bubble.id);
  openInlineEditor(bubble);
}

function startResize(event, direction) {
  event.preventDefault();
  event.stopPropagation();
  const bubble = getSelectedBubble();
  if (!bubble) return;
  state.interaction = {
    type: 'resize',
    pointerId: event.pointerId,
    direction,
    bubbleId: bubble.id,
    bubbleStart: { x: bubble.x, y: bubble.y, width: bubble.width, height: bubble.height },
    startX: event.clientX,
    startY: event.clientY,
    tailSnapshot: bubble.tail
      ? {
          anchor: { ...bubble.tail.anchor },
          offset: { ...bubble.tail.offset },
        }
      : null,
  };
  elements.viewport.setPointerCapture(event.pointerId);
}

function startTailDrag(event) {
  event.preventDefault();
  event.stopPropagation();
  const bubble = getSelectedBubble();
  if (!bubble || !bubble.tail) return;
  state.interaction = {
    type: 'tail',
    pointerId: event.pointerId,
    bubbleId: bubble.id,
    startX: event.clientX,
    startY: event.clientY,
    originalTail: getTailTip(bubble),
  };
  elements.viewport.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!state.interaction || state.interaction.pointerId !== event.pointerId) return;
  if (state.interaction.type === 'pan') {
    const dx = event.clientX - state.interaction.startX;
    const dy = event.clientY - state.interaction.startY;
    state.viewport.offsetX = state.interaction.offsetX + dx;
    state.viewport.offsetY = state.interaction.offsetY + dy;
    updateSceneTransform();
  } else if (state.interaction.type === 'move-bubble') {
    const bubble = state.bubbles.find((item) => item.id === state.interaction.bubbleId);
    if (!bubble) return;
    const { x: deltaX, y: deltaY } = screenDeltaToWorld(
      event.clientX - state.interaction.startX,
      event.clientY - state.interaction.startY,
    );
    bubble.x = state.interaction.bubbleStart.x + deltaX;
    bubble.y = state.interaction.bubbleStart.y + deltaY;
    render();
  } else if (state.interaction.type === 'resize') {
    const bubble = state.bubbles.find((item) => item.id === state.interaction.bubbleId);
    if (!bubble) return;
    const delta = screenDeltaToWorld(
      event.clientX - state.interaction.startX,
      event.clientY - state.interaction.startY,
    );
    applyResize(bubble, state.interaction.direction, delta);
    render();
  } else if (state.interaction.type === 'tail') {
    const bubble = state.bubbles.find((item) => item.id === state.interaction.bubbleId);
    if (!bubble || !bubble.tail) return;
    const { x: deltaX, y: deltaY } = screenDeltaToWorld(
      event.clientX - state.interaction.startX,
      event.clientY - state.interaction.startY,
    );
    const newTip = {
      x: state.interaction.originalTail.x + deltaX,
      y: state.interaction.originalTail.y + deltaY,
    };
    setTailTip(bubble, newTip.x, newTip.y);
    render();
  } else if (state.interaction.type === 'panel-gesture') {
    const delta = screenDeltaToWorld(
      event.clientX - state.interaction.startX,
      event.clientY - state.interaction.startY,
    );
    const distance = Math.hypot(delta.x, delta.y);
    if (distance >= PANEL_GESTURE_DECISION_DISTANCE) {
      const intent = state.interaction.intent;
      if (intent === 'move') {
        state.interaction = {
          type: 'panel-move',
          pointerId: event.pointerId,
          panelId: state.interaction.panelId,
          startX: event.clientX,
          startY: event.clientY,
          appliedX: 0,
          appliedY: 0,
        };
        handlePointerMove(event);
        return;
      }
      state.interaction = {
        type: 'panel-split',
        pointerId: event.pointerId,
        panelId: state.interaction.panelId,
        startX: state.interaction.startX,
        startY: state.interaction.startY,
        startPoint: state.interaction.startPoint,
        orientation: null,
      };
    }
  } else if (state.interaction.type === 'panel-move') {
    const panel = findPanelById(state.panels.root, state.interaction.panelId);
    if (!panel) return;
    const delta = screenDeltaToWorld(
      event.clientX - state.interaction.startX,
      event.clientY - state.interaction.startY,
    );
    const moveX = delta.x - (state.interaction.appliedX || 0);
    const moveY = delta.y - (state.interaction.appliedY || 0);
    if (Math.abs(moveX) > 0 || Math.abs(moveY) > 0) {
      movePanel(panel, moveX, moveY);
      state.interaction.appliedX = (state.interaction.appliedX || 0) + moveX;
      state.interaction.appliedY = (state.interaction.appliedY || 0) + moveY;
      renderPanels();
      updatePanelOverlay();
    }
  } else if (state.interaction.type === 'panel-resize') {
    const panel = findPanelById(state.panels.root, state.interaction.panelId);
    if (!panel) return;
    const delta = screenDeltaToWorld(
      event.clientX - state.interaction.startX,
      event.clientY - state.interaction.startY,
    );
    const startRect = state.interaction.startRect;
    const { controllers } = state.interaction;
    if (controllers.left) {
      setPanelBoundaryPosition(controllers.left, startRect.x + delta.x);
    }
    if (controllers.right) {
      setPanelBoundaryPosition(controllers.right, startRect.x + startRect.width + delta.x);
    }
    if (controllers.top) {
      setPanelBoundaryPosition(controllers.top, startRect.y + delta.y);
    }
    if (controllers.bottom) {
      setPanelBoundaryPosition(controllers.bottom, startRect.y + startRect.height + delta.y);
    }
    layoutPanelTree();
    renderPanels();
    updatePanelOverlay();
  } else if (state.interaction.type === 'panel-image-pan') {
    const panel = findPanelById(state.panels.root, state.interaction.panelId);
    if (!panel || !panel.image) return;
    const delta = screenDeltaToWorld(
      event.clientX - state.interaction.startX,
      event.clientY - state.interaction.startY,
    );
    panel.image.offsetX = (state.interaction.imageStart.offsetX || 0) + delta.x;
    panel.image.offsetY = (state.interaction.imageStart.offsetY || 0) + delta.y;
    renderPanels();
  } else if (state.interaction.type === 'panel-split') {
    if (!state.interaction.orientation) {
      const dx = event.clientX - state.interaction.startX;
      const dy = event.clientY - state.interaction.startY;
      if (
        Math.abs(dx) > PANEL_SPLIT_DRAG_THRESHOLD ||
        Math.abs(dy) > PANEL_SPLIT_DRAG_THRESHOLD
      ) {
        state.interaction.orientation = Math.abs(dx) >= Math.abs(dy) ? 'vertical' : 'horizontal';
      }
    }
  }
}

function handlePointerUp(event) {
  if (!state.interaction || state.interaction.pointerId !== event.pointerId) return;
  if (state.interaction.type === 'move-bubble' || state.interaction.type === 'resize' || state.interaction.type === 'tail') {
    pushHistory();
  } else if (state.interaction.type === 'panel-move') {
    if (Math.abs(state.interaction.appliedX || 0) > 0 || Math.abs(state.interaction.appliedY || 0) > 0) {
      pushHistory();
    }
  } else if (state.interaction.type === 'panel-resize' || state.interaction.type === 'panel-image-pan') {
    pushHistory();
  } else if (state.interaction.type === 'panel-split') {
    const panel = findPanelById(state.panels.root, state.interaction.panelId);
    if (panel && state.interaction.orientation) {
      const worldPoint = screenToWorld({ x: event.clientX, y: event.clientY });
      if (splitPanel(panel, state.interaction.orientation, worldPoint)) {
        pushHistory();
      }
    }
  } else if (state.interaction.type === 'panel-gesture') {
    // no action determined; keep selection only
  }
  if (state.interaction.type === 'pan') {
    updateSceneTransform();
  }
  try {
    elements.viewport.releasePointerCapture(event.pointerId);
  } catch (error) {
    // ignore
  }
  state.interaction = null;
}

function applyResize(bubble, direction, delta) {
  let { x, y, width, height } = state.interaction.bubbleStart;
  const minSize = MIN_BODY_SIZE;
  if (direction.includes('n')) {
    const newHeight = clamp(height - delta.y, minSize, Infinity);
    const diff = (newHeight - height);
    y = y - diff;
    height = newHeight;
  }
  if (direction.includes('s')) {
    height = clamp(height + delta.y, minSize, Infinity);
  }
  if (direction.includes('w')) {
    const newWidth = clamp(width - delta.x, minSize, Infinity);
    const diff = (newWidth - width);
    x = x - diff;
    width = newWidth;
  }
  if (direction.includes('e')) {
    width = clamp(width + delta.x, minSize, Infinity);
  }
  bubble.x = x;
  bubble.y = y;
  bubble.width = width;
  bubble.height = height;
  if (bubble.tail && state.interaction.tailSnapshot) {
    bubble.tail.anchor = { ...state.interaction.tailSnapshot.anchor };
    bubble.tail.offset = { ...state.interaction.tailSnapshot.offset };
  }
}

function getTailBase(bubble) {
  const { anchor } = bubble.tail;
  return {
    x: bubble.x + bubble.width * anchor.x,
    y: bubble.y + bubble.height * anchor.y,
  };
}

function getTailTip(bubble) {
  if (!bubble.tail) return null;
  const base = getTailBase(bubble);
  return {
    x: base.x + bubble.width * bubble.tail.offset.x,
    y: base.y + bubble.height * bubble.tail.offset.y,
  };
}

function setTailTip(bubble, x, y) {
  if (!bubble.tail) return;
  const centerX = bubble.x + bubble.width / 2;
  const centerY = bubble.y + bubble.height / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx > absDy) {
    bubble.tail.anchor.x = dx < 0 ? 0 : 1;
    bubble.tail.anchor.y = clamp((y - bubble.y) / bubble.height, 0.15, 0.85);
  } else {
    bubble.tail.anchor.y = dy < 0 ? 0 : 1;
    bubble.tail.anchor.x = clamp((x - bubble.x) / bubble.width, 0.15, 0.85);
  }
  const base = getTailBase(bubble);
  bubble.tail.offset.x = (x - base.x) / bubble.width;
  bubble.tail.offset.y = (y - base.y) / bubble.height;
}

function autoFitBubbleToText(bubble, options = {}) {
  const { lockCenter = true, allowShrink = true } = options;
  const basePadding = Math.max(36, Math.min(bubble.width, bubble.height) * 0.18);
  const padding = Math.max(basePadding, bubble.padding || 0);
  bubble.padding = padding;
  const measure = elements.measureBox;
  measure.style.fontFamily = bubble.fontFamily;
  measure.style.fontSize = `${bubble.fontSize}px`;
  measure.style.fontWeight = bubble.bold ? '700' : '400';
  const displayText = getBubbleDisplayText(bubble);
  measure.textContent = displayText || '';
  const textWidth = Math.max(measure.scrollWidth, measure.offsetWidth, 1);
  const textHeight = Math.max(measure.scrollHeight, measure.offsetHeight, 1);
  const targetWidth = textWidth + padding * 2;
  const targetHeight = textHeight + padding * 2;
  const minWidth = MIN_BODY_SIZE;
  const minHeight = MIN_BODY_SIZE;
  let newWidth = allowShrink ? Math.max(minWidth, targetWidth) : Math.max(bubble.width, targetWidth);
  let newHeight = allowShrink ? Math.max(minHeight, targetHeight) : Math.max(bubble.height, targetHeight);
  const centerX = bubble.x + bubble.width / 2;
  const centerY = bubble.y + bubble.height / 2;
  if (lockCenter) {
    bubble.x = centerX - newWidth / 2;
    bubble.y = centerY - newHeight / 2;
  }
  bubble.width = newWidth;
  bubble.height = newHeight;
}

function updateControlsFromSelection() {
  const bubble = getSelectedBubble();
  const hasSelection = Boolean(bubble);
  elements.removeBubble.disabled = !hasSelection;
  if (!bubble) {
    elements.textContent.value = '';
    elements.positionIndicator.textContent = '';
    return;
  }
  elements.strokeWidth.value = bubble.strokeWidth;
  elements.fontFamily.value = bubble.fontFamily;
  elements.fontSize.value = bubble.fontSize;
  elements.toggleBold.dataset.active = bubble.bold ? 'true' : 'false';
  elements.textContent.value = getBubbleRawText(bubble);
  elements.positionIndicator.textContent = `位置：(${bubble.x.toFixed(0)}, ${bubble.y.toFixed(0)}) 尺寸：${bubble.width.toFixed(0)}×${bubble.height.toFixed(0)}`;
}

function openInlineEditor(bubble) {
  const textRect = getTextRect(bubble);
  const topLeft = worldToScreen({ x: textRect.x, y: textRect.y });
  const bottomRight = worldToScreen({ x: textRect.x + textRect.width, y: textRect.y + textRect.height });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  const editor = elements.inlineEditor;
  editor.value = getBubbleDisplayText(bubble);
  editor.style.left = `${topLeft.x}px`;
  editor.style.top = `${topLeft.y}px`;
  editor.style.width = `${width}px`;
  editor.style.height = `${height}px`;
  editor.style.fontFamily = bubble.fontFamily;
  editor.style.fontSize = `${bubble.fontSize}px`;
  editor.style.fontWeight = bubble.bold ? '700' : '400';
  editor.classList.remove('hidden');
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
  state.inlineEditingBubbleId = bubble.id;
}

elements.inlineEditor.addEventListener('blur', () => {
  if (!state.inlineEditingBubbleId) return;
  const bubble = state.bubbles.find((item) => item.id === state.inlineEditingBubbleId);
  if (!bubble) return;
  const editorValue = elements.inlineEditor.value;
  const rawValue = state.autoWrap.enabled ? editorValue.replace(/\n/g, '') : editorValue;
  updateBubbleText(bubble, rawValue);
  elements.inlineEditor.classList.add('hidden');
  state.inlineEditingBubbleId = null;
  elements.textContent.value = rawValue;
  pushHistory();
  render();
});

elements.inlineEditor.addEventListener('input', () => {
  if (!state.inlineEditingBubbleId) return;
  const bubble = state.bubbles.find((item) => item.id === state.inlineEditingBubbleId);
  if (!bubble) return;
  const editor = elements.inlineEditor;
  const editorValue = editor.value;
  let rawStart = editor.selectionStart;
  let rawEnd = editor.selectionEnd;
  if (state.autoWrap.enabled) {
    rawStart = rawIndexFromDisplay(editorValue, editor.selectionStart);
    rawEnd = rawIndexFromDisplay(editorValue, editor.selectionEnd);
  }
  const rawValue = state.autoWrap.enabled ? editorValue.replace(/\n/g, '') : editorValue;
  updateBubbleText(bubble, rawValue);
  const displayText = getBubbleDisplayText(bubble);
  if (displayText !== editorValue) {
    editor.value = displayText;
    if (state.autoWrap.enabled) {
      const newStart = displayIndexFromRaw(displayText, rawStart);
      const newEnd = displayIndexFromRaw(displayText, rawEnd);
      editor.setSelectionRange(newStart, newEnd);
    } else {
      editor.setSelectionRange(rawStart, rawEnd);
    }
  }
  elements.textContent.value = rawValue;
  render();
});

elements.inlineEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    elements.inlineEditor.blur();
  }
});

function getTextRect(bubble) {
  const padding = Math.max(20, bubble.padding);
  const width = Math.max(20, bubble.width - padding * 2);
  const height = Math.max(20, bubble.height - padding * 2);
  return {
    x: bubble.x + padding,
    y: bubble.y + padding,
    width,
    height,
  };
}

function renderPanels() {
  ensurePageFrame();
  const panels = getPanelState();
  const layer = elements.panelLayer;
  const frame = elements.pageFrame;
  if (!panels.pageFrame || !panels.root) {
    frame.style.display = 'none';
    frame.style.boxShadow = 'none';
    layer.innerHTML = '';
    panelElements.clear();
    return;
  }
  layoutPanelTree();
  frame.style.display = 'block';
  frame.style.left = `${panels.pageFrame.x}px`;
  frame.style.top = `${panels.pageFrame.y}px`;
  frame.style.width = `${panels.pageFrame.width}px`;
  frame.style.height = `${panels.pageFrame.height}px`;
  frame.style.boxShadow = panels.outerColor ? `0 0 0 9999px ${panels.outerColor}` : 'none';

  const leaves = collectPanelLeaves(panels.root);
  const activeIds = new Set();
  leaves.forEach((panel) => {
    activeIds.add(panel.id);
    let panelEl = panelElements.get(panel.id);
    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.className = 'panel';
      panelEl.dataset.panelId = panel.id;
      const border = document.createElement('div');
      border.className = 'panel-border';
      panelEl.appendChild(border);
      const wrapper = document.createElement('div');
      wrapper.className = 'panel-image-wrapper';
      panelEl.appendChild(wrapper);
      layer.appendChild(panelEl);
      panelElements.set(panel.id, panelEl);
    }
    panelEl.style.left = `${panel.rect.x}px`;
    panelEl.style.top = `${panel.rect.y}px`;
    panelEl.style.width = `${panel.rect.width}px`;
    panelEl.style.height = `${panel.rect.height}px`;
    const border = panelEl.querySelector('.panel-border');
    if (border) {
      border.style.borderWidth = `${panels.strokeWidth}px`;
      border.style.borderColor = '#11141b';
    }
    const wrapper = panelEl.querySelector('.panel-image-wrapper');
    if (wrapper) {
      const existingImg = wrapper.querySelector('img');
      if (panel.image && panel.image.src) {
        let img = existingImg;
        if (!img) {
          img = document.createElement('img');
          wrapper.appendChild(img);
        }
        img.src = panel.image.src;
        img.style.width = `${panel.image.width}px`;
        img.style.height = `${panel.image.height}px`;
        const scale = panel.image.scale ?? 1;
        const rotation = panel.image.rotation ?? 0;
        const offsetX = panel.image.offsetX ?? 0;
        const offsetY = panel.image.offsetY ?? 0;
        img.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${scale})`;
      } else if (existingImg) {
        existingImg.remove();
      }
    }
  });
  Array.from(panelElements.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      const element = panelElements.get(id);
      if (element) {
        element.remove();
      }
      panelElements.delete(id);
    }
  });
}

function render() {
  renderPanels();
  renderBubbles();
  updateSelectionOverlay();
  updatePanelOverlay();
}

function renderBubbles() {
  elements.bubbleLayer.innerHTML = '';
  state.bubbles.forEach((bubble) => {
    const group = document.createElementNS(svgNS, 'g');
    group.dataset.bubbleId = bubble.id;
    group.classList.add('bubble');

    const body = createBodyShape(bubble);
    body.classList.add('bubble-body');
    body.setAttribute('stroke-width', bubble.strokeWidth);
    group.appendChild(body);

    const tailElement = createTailShape(bubble);
    if (tailElement) {
      tailElement.classList.add('bubble-tail');
      tailElement.setAttribute('stroke-width', bubble.strokeWidth);
      group.appendChild(tailElement);
    }

    const textRect = getTextRect(bubble);
    const outline = document.createElementNS(svgNS, 'rect');
    outline.setAttribute('class', 'bubble-outline');
    outline.setAttribute('x', textRect.x);
    outline.setAttribute('y', textRect.y);
    outline.setAttribute('width', textRect.width);
    outline.setAttribute('height', textRect.height);
    group.appendChild(outline);

    const textNode = document.createElementNS(svgNS, 'foreignObject');
    textNode.setAttribute('x', textRect.x);
    textNode.setAttribute('y', textRect.y);
    textNode.setAttribute('width', Math.max(1, textRect.width));
    textNode.setAttribute('height', Math.max(1, textRect.height));
    textNode.setAttribute('class', 'text-layer');

    const div = document.createElement('div');
    div.className = 'bubble-text-display';
    div.style.fontFamily = bubble.fontFamily;
    div.style.fontSize = `${bubble.fontSize}px`;
    div.style.fontWeight = bubble.bold ? '700' : '400';
    div.textContent = getBubbleDisplayText(bubble);
    textNode.appendChild(div);
    group.appendChild(textNode);

    elements.bubbleLayer.appendChild(group);
  });
}

function createBodyShape(bubble) {
  if (bubble.type === 'speech') {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', createSpeechBubblePath(bubble));
    return path;
  }
  if (bubble.type === 'rectangle' || bubble.type === 'speech-left' || bubble.type === 'speech-right') {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', createRectanglePath(bubble));
    return path;
  }
  if (bubble.type.startsWith('thought')) {
    const ellipse = document.createElementNS(svgNS, 'ellipse');
    ellipse.setAttribute('cx', bubble.x + bubble.width / 2);
    ellipse.setAttribute('cy', bubble.y + bubble.height / 2);
    ellipse.setAttribute('rx', bubble.width / 2);
    ellipse.setAttribute('ry', bubble.height / 2);
    return ellipse;
  }
  // speech bubble default oval
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', createRoundedRectPath(bubble.x, bubble.y, bubble.width, bubble.height, Math.min(bubble.width, bubble.height) * 0.45));
  return path;
}

function createTailShape(bubble) {
  if (!bubble.tail) return null;
  if (bubble.type === 'speech') {
    return null;
  }
  if (bubble.type.startsWith('thought')) {
    const group = document.createElementNS(svgNS, 'g');
    const tip = getTailTip(bubble);
    const base = getTailBase(bubble);
    const midPoint = {
      x: (tip.x + base.x) / 2,
      y: (tip.y + base.y) / 2,
    };
    const circles = [
      { center: midPoint, radius: Math.min(bubble.width, bubble.height) * 0.08 },
      { center: { x: (midPoint.x + tip.x) / 2, y: (midPoint.y + tip.y) / 2 }, radius: Math.min(bubble.width, bubble.height) * 0.06 },
      { center: tip, radius: Math.min(bubble.width, bubble.height) * 0.05 },
    ];
    circles.forEach((info) => {
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', info.center.x);
      circle.setAttribute('cy', info.center.y);
      circle.setAttribute('r', info.radius);
      group.appendChild(circle);
    });
    return group;
  }
  const path = document.createElementNS(svgNS, 'path');
  const tail = buildSpeechTailPath(bubble);
  path.setAttribute('d', tail);
  return path;
}

function createRectanglePath(bubble) {
  const { x, y, width, height } = bubble;
  const radius = Math.min(width, height) * 0.1;
  const notchSize = Math.min(width, height) * 0.25;
  if (bubble.type === 'rectangle') {
    return createRoundedRectPath(x, y, width, height, radius * 0.2);
  }
  const path = [];
  if (bubble.type === 'speech-left') {
    path.push(`M ${x + radius} ${y}`);
    path.push(`H ${x + width}`);
    path.push(`V ${y + height}`);
    path.push(`H ${x}`);
    path.push(`V ${y + notchSize}`);
    path.push(`L ${x + notchSize} ${y}`);
    path.push('Z');
  } else if (bubble.type === 'speech-right') {
    path.push(`M ${x} ${y}`);
    path.push(`H ${x + width - radius}`);
    path.push(`L ${x + width} ${y + notchSize}`);
    path.push(`V ${y + height}`);
    path.push(`H ${x}`);
    path.push('Z');
  }
  return path.join(' ');
}

function createRoundedRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  return [
    `M ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `Q ${x + width} ${y + height} ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `Q ${x} ${y + height} ${x} ${y + height - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

function createSpeechBubblePath(bubble) {
  const tailInfo = computeTailGeometry(bubble);
  const side = tailInfo?.side || null;
  const { x, y, width, height } = bubble;
  const radius = Math.min(width, height) * 0.45;
  const path = [];
  const topStartX = x + radius;
  const topEndX = x + width - radius;
  path.push(`M ${topStartX} ${y}`);
  if (tailInfo && side === 'top') {
    const [first, second] = orderTailBasePoints(side, tailInfo.p1, tailInfo.p2);
    const firstX = clamp(first.x, topStartX, topEndX);
    const secondX = clamp(second.x, topStartX, topEndX);
    if (firstX > topStartX) {
      path.push(`H ${firstX}`);
    }
    path.push(`Q ${tailInfo.tip.x} ${tailInfo.tip.y} ${secondX} ${y}`);
    if (secondX < topEndX) {
      path.push(`H ${topEndX}`);
    }
  } else {
    path.push(`H ${topEndX}`);
  }
  path.push(`Q ${x + width} ${y} ${x + width} ${y + radius}`);
  const rightStartY = y + radius;
  const rightEndY = y + height - radius;
  if (tailInfo && side === 'right') {
    const [first, second] = orderTailBasePoints(side, tailInfo.p1, tailInfo.p2);
    const firstY = clamp(first.y, rightStartY, rightEndY);
    const secondY = clamp(second.y, rightStartY, rightEndY);
    if (firstY > rightStartY) {
      path.push(`V ${firstY}`);
    }
    path.push(`Q ${tailInfo.tip.x} ${tailInfo.tip.y} ${x + width} ${secondY}`);
    if (secondY < rightEndY) {
      path.push(`V ${rightEndY}`);
    }
  } else {
    path.push(`V ${rightEndY}`);
  }
  path.push(`Q ${x + width} ${y + height} ${x + width - radius} ${y + height}`);
  const bottomStartX = x + width - radius;
  const bottomEndX = x + radius;
  if (tailInfo && side === 'bottom') {
    const [first, second] = orderTailBasePoints(side, tailInfo.p1, tailInfo.p2);
    const firstX = clamp(first.x, bottomEndX, bottomStartX);
    const secondX = clamp(second.x, bottomEndX, bottomStartX);
    if (firstX < bottomStartX) {
      path.push(`H ${firstX}`);
    }
    path.push(`Q ${tailInfo.tip.x} ${tailInfo.tip.y} ${secondX} ${y + height}`);
    if (secondX > bottomEndX) {
      path.push(`H ${bottomEndX}`);
    }
  } else {
    path.push(`H ${bottomEndX}`);
  }
  path.push(`Q ${x} ${y + height} ${x} ${y + height - radius}`);
  const leftStartY = y + height - radius;
  const leftEndY = y + radius;
  if (tailInfo && side === 'left') {
    const [first, second] = orderTailBasePoints(side, tailInfo.p1, tailInfo.p2);
    const firstY = clamp(first.y, leftEndY, leftStartY);
    const secondY = clamp(second.y, leftEndY, leftStartY);
    if (firstY < leftStartY) {
      path.push(`V ${firstY}`);
    }
    path.push(`Q ${tailInfo.tip.x} ${tailInfo.tip.y} ${x} ${secondY}`);
    if (secondY > leftEndY) {
      path.push(`V ${leftEndY}`);
    }
  } else {
    path.push(`V ${leftEndY}`);
  }
  path.push(`Q ${x} ${y} ${topStartX} ${y}`);
  path.push('Z');
  return path.join(' ');
}

function buildSpeechTailPath(bubble) {
  const geometry = computeTailGeometry(bubble);
  if (!geometry) return '';
  const [start, end] = orderTailBasePoints(geometry.side, geometry.p1, geometry.p2);
  return `M ${start.x} ${start.y} Q ${geometry.tip.x} ${geometry.tip.y} ${end.x} ${end.y}`;
}

function computeTailGeometry(bubble) {
  if (!bubble.tail) return null;
  const tip = getTailTip(bubble);
  if (!tip) return null;
  const baseCenter = getTailBase(bubble);
  const dx = tip.x - baseCenter.x;
  const dy = tip.y - baseCenter.y;
  const length = Math.hypot(dx, dy) || 1;
  const halfAngle = (SPEECH_TAIL_ANGLE_DEGREES * Math.PI) / 180 / 2;
  const halfWidth = Math.tan(halfAngle) * length;
  const px = -dy / length;
  const py = dx / length;
  let p1 = { x: baseCenter.x + px * halfWidth, y: baseCenter.y + py * halfWidth };
  let p2 = { x: baseCenter.x - px * halfWidth, y: baseCenter.y - py * halfWidth };
  const side = resolveTailSide(bubble, baseCenter);
  const { x, y, width, height } = bubble;
  const radius = Math.min(width, height) * 0.45;
  if (side === 'top' || side === 'bottom') {
    const minX = x + radius;
    const maxX = x + width - radius;
    const baseY = side === 'top' ? y : y + height;
    p1 = { x: clamp(p1.x, minX, maxX), y: baseY };
    p2 = { x: clamp(p2.x, minX, maxX), y: baseY };
  } else {
    const minY = y + radius;
    const maxY = y + height - radius;
    const baseX = side === 'left' ? x : x + width;
    p1 = { x: baseX, y: clamp(p1.y, minY, maxY) };
    p2 = { x: baseX, y: clamp(p2.y, minY, maxY) };
  }
  return { tip, baseCenter, p1, p2, side };
}

function resolveTailSide(bubble, baseCenter) {
  const { x, y, width, height } = bubble;
  const epsilon = Math.min(width, height) * 0.05;
  if (Math.abs(baseCenter.y - y) <= epsilon) return 'top';
  if (Math.abs(baseCenter.y - (y + height)) <= epsilon) return 'bottom';
  if (Math.abs(baseCenter.x - x) <= epsilon) return 'left';
  return 'right';
}

function orderTailBasePoints(side, p1, p2) {
  if (side === 'top') {
    return p1.x <= p2.x ? [p1, p2] : [p2, p1];
  }
  if (side === 'right') {
    return p1.y <= p2.y ? [p1, p2] : [p2, p1];
  }
  if (side === 'bottom') {
    return p1.x >= p2.x ? [p1, p2] : [p2, p1];
  }
  return p1.y >= p2.y ? [p1, p2] : [p2, p1];
}

function getOverlayRect(bubble) {
  const bodyRect = {
    minX: bubble.x,
    minY: bubble.y,
    maxX: bubble.x + bubble.width,
    maxY: bubble.y + bubble.height,
  };
  if (bubble.tail) {
    const tip = getTailTip(bubble);
    bodyRect.minX = Math.min(bodyRect.minX, tip.x);
    bodyRect.maxX = Math.max(bodyRect.maxX, tip.x);
    bodyRect.minY = Math.min(bodyRect.minY, tip.y);
    bodyRect.maxY = Math.max(bodyRect.maxY, tip.y);
  }
  return {
    x: bodyRect.minX - CONTROL_PADDING,
    y: bodyRect.minY - CONTROL_PADDING,
    width: bodyRect.maxX - bodyRect.minX + CONTROL_PADDING * 2,
    height: bodyRect.maxY - bodyRect.minY + CONTROL_PADDING * 2,
  };
}

function updateSelectionOverlay() {
  const bubble = getSelectedBubble();
  if (!bubble) {
    elements.selectionOverlay.classList.add('hidden');
    elements.positionIndicator.textContent = '';
    return;
  }
  elements.selectionOverlay.classList.remove('hidden');
  const overlayRect = getOverlayRect(bubble);
  const topLeft = worldToScreen({ x: overlayRect.x, y: overlayRect.y });
  const bottomRight = worldToScreen({ x: overlayRect.x + overlayRect.width, y: overlayRect.y + overlayRect.height });
  overlay.box.style.left = `${topLeft.x}px`;
  overlay.box.style.top = `${topLeft.y}px`;
  overlay.box.style.width = `${bottomRight.x - topLeft.x}px`;
  overlay.box.style.height = `${bottomRight.y - topLeft.y}px`;

  HANDLE_DIRECTIONS.forEach((dir) => {
    const handle = overlay.handles.get(dir);
    const position = computeHandlePosition(bubble, dir);
    const screenPos = worldToScreen(position);
    handle.style.left = `${screenPos.x}px`;
    handle.style.top = `${screenPos.y}px`;
  });

  if (bubble.tail) {
    overlay.tailHandle.style.display = 'block';
    const tailTip = getTailTip(bubble);
    const screenPos = worldToScreen(tailTip);
    overlay.tailHandle.style.left = `${screenPos.x}px`;
    overlay.tailHandle.style.top = `${screenPos.y}px`;
  } else {
    overlay.tailHandle.style.display = 'none';
  }
  elements.positionIndicator.textContent = `位置：(${bubble.x.toFixed(0)}, ${bubble.y.toFixed(0)}) 尺寸：${bubble.width.toFixed(0)}×${bubble.height.toFixed(0)}`;
}

function computeHandlePosition(bubble, direction) {
  const rect = {
    left: bubble.x - CONTROL_PADDING,
    right: bubble.x + bubble.width + CONTROL_PADDING,
    top: bubble.y - CONTROL_PADDING,
    bottom: bubble.y + bubble.height + CONTROL_PADDING,
    centerX: bubble.x + bubble.width / 2,
    centerY: bubble.y + bubble.height / 2,
  };
  const pos = { x: rect.centerX, y: rect.centerY };
  if (direction.includes('n')) pos.y = rect.top;
  if (direction.includes('s')) pos.y = rect.bottom;
  if (direction.includes('w')) pos.x = rect.left;
  if (direction.includes('e')) pos.x = rect.right;
  if (direction === 'n' || direction === 's') pos.x = rect.centerX;
  if (direction === 'e' || direction === 'w') pos.y = rect.centerY;
  if (direction === 'nw') {
    pos.x = rect.left;
    pos.y = rect.top;
  }
  if (direction === 'ne') {
    pos.x = rect.right;
    pos.y = rect.top;
  }
  if (direction === 'se') {
    pos.x = rect.right;
    pos.y = rect.bottom;
  }
  if (direction === 'sw') {
    pos.x = rect.left;
    pos.y = rect.bottom;
  }
  return pos;
}

function handleKeyDown(event) {
  const target = event.target;
  const isTextInput =
    target === elements.inlineEditor ||
    target === elements.textContent ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement;
  if (event.key === 'Delete' && !isTextInput) {
    removeSelectedBubble();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
}

function pushHistory() {
  const snapshot = JSON.stringify({
    bubbles: state.bubbles,
    selectedBubbleId: state.selectedBubbleId,
    viewport: state.viewport,
    autoWrap: state.autoWrap,
    panels: serializePanels(),
  });
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshot);
  state.historyIndex = state.history.length - 1;
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  const snapshot = JSON.parse(state.history[state.historyIndex]);
  state.bubbles = snapshot.bubbles.map((bubble) => ({ ...bubble }));
  state.selectedBubbleId = snapshot.selectedBubbleId;
  state.viewport = { ...snapshot.viewport };
  if (snapshot.autoWrap) {
    state.autoWrap = { ...snapshot.autoWrap };
  }
  restorePanels(snapshot.panels);
  updateSceneTransform();
  render();
  updateControlsFromSelection();
  updateAutoWrapControls();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function exportArtwork() {
  const format = elements.exportFormat.value;
  if (!state.image.src && state.bubbles.length === 0) return;
  if (format === 'png' || format === 'jpg') {
    await exportRaster(format);
  } else if (format === 'psd') {
    await exportPsd();
  }
}

async function exportRaster(format) {
  const canvas = document.createElement('canvas');
  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;
  const ctx = canvas.getContext('2d');
  const panels = getPanelState();
  const backgroundColor = panels.pageFrame ? panels.outerColor : '#ffffff';
  ctx.fillStyle = backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.image.src) {
    if (panels.pageFrame) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(panels.pageFrame.x, panels.pageFrame.y, panels.pageFrame.width, panels.pageFrame.height);
      ctx.clip();
      await drawImageToCanvas(ctx, state.image.src, canvas.width, canvas.height);
      ctx.restore();
    } else {
      await drawImageToCanvas(ctx, state.image.src, canvas.width, canvas.height);
    }
  }
  await drawPanelsToContext(ctx, { includeOverlay: true, includeLines: true, includeImages: true });
  drawBubblesToContext(ctx, { includeText: true });
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'jpg' ? 0.95 : 1;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `comic-bubbles.${format}`);
      }
      resolve();
    }, mime, quality);
  });
}

async function drawImageToCanvas(ctx, src, width, height) {
  const img = new Image();
  img.src = src;
  await img.decode();
  ctx.drawImage(img, 0, 0, width, height);
}

function drawBubblesToContext(ctx, options = {}) {
  const { includeText = true, includeBodies = true } = options;
  state.bubbles.forEach((bubble) => {
    ctx.save();
    ctx.lineWidth = bubble.strokeWidth;
    ctx.strokeStyle = '#11141b';
    ctx.fillStyle = '#ffffff';
    if (includeBodies) {
      if (bubble.type === 'speech') {
        drawPath(ctx, createSpeechBubblePath(bubble));
      } else if (bubble.type === 'rectangle' || bubble.type === 'speech-left' || bubble.type === 'speech-right') {
        drawPath(ctx, createRectanglePath(bubble));
      } else if (bubble.type.startsWith('thought')) {
        ctx.beginPath();
        ctx.ellipse(
          bubble.x + bubble.width / 2,
          bubble.y + bubble.height / 2,
          bubble.width / 2,
          bubble.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        drawPath(ctx, createRoundedRectPath(bubble.x, bubble.y, bubble.width, bubble.height, Math.min(bubble.width, bubble.height) * 0.45));
      }
      if (bubble.tail && bubble.type !== 'speech') {
        if (bubble.type.startsWith('thought')) {
          drawThoughtTail(ctx, bubble);
        } else {
          drawPath(ctx, buildSpeechTailPath(bubble));
        }
      }
    }
    if (includeText) {
      const textRect = getTextRect(bubble);
      ctx.fillStyle = '#11141b';
      ctx.font = `${bubble.bold ? 'bold ' : ''}${bubble.fontSize}px ${bubble.fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const displayText = getBubbleDisplayText(bubble);
      const lines = displayText ? displayText.split('\n') : [''];
      const lineHeight = bubble.fontSize * 1.2;
      const startY = textRect.y + textRect.height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, textRect.x + textRect.width / 2, startY + index * lineHeight);
      });
    }
    ctx.restore();
  });
}

const panelImageCache = new Map();

async function getPanelImageElement(src) {
  if (panelImageCache.has(src)) {
    return panelImageCache.get(src);
  }
  const img = new Image();
  img.src = src;
  await img.decode();
  panelImageCache.set(src, img);
  return img;
}

async function drawPanelsToContext(ctx, options = {}) {
  const { includeOverlay = true, includeLines = true, includeImages = true } = options;
  const panels = getPanelState();
  if (!panels.pageFrame || !panels.root) return;
  const leaves = collectPanelLeaves(panels.root);
  const pageFrame = panels.pageFrame;
  if (includeOverlay) {
    ctx.save();
    ctx.fillStyle = 'rgba(117, 83, 47, 0.3)';
    ctx.beginPath();
    ctx.rect(pageFrame.x, pageFrame.y, pageFrame.width, pageFrame.height);
    leaves.forEach((panel) => {
      ctx.rect(panel.rect.x, panel.rect.y, panel.rect.width, panel.rect.height);
    });
    ctx.fill('evenodd');
    ctx.restore();
  }
  if (includeImages) {
    for (const panel of leaves) {
      if (panel.image && panel.image.src) {
        const img = await getPanelImageElement(panel.image.src);
        ctx.save();
        ctx.beginPath();
        ctx.rect(panel.rect.x, panel.rect.y, panel.rect.width, panel.rect.height);
        ctx.clip();
        const centerX = panel.rect.x + panel.rect.width / 2;
        const centerY = panel.rect.y + panel.rect.height / 2;
        ctx.translate(centerX, centerY);
        ctx.translate(panel.image.offsetX || 0, panel.image.offsetY || 0);
        ctx.rotate(((panel.image.rotation || 0) * Math.PI) / 180);
        const scale = panel.image.scale || 1;
        ctx.scale(scale, scale);
        ctx.drawImage(img, -panel.image.width / 2, -panel.image.height / 2, panel.image.width, panel.image.height);
        ctx.restore();
      }
    }
  }
  if (includeLines) {
    ctx.save();
    ctx.lineWidth = panels.strokeWidth;
    ctx.strokeStyle = '#11141b';
    leaves.forEach((panel) => {
      ctx.strokeRect(panel.rect.x, panel.rect.y, panel.rect.width, panel.rect.height);
    });
    ctx.restore();
  }
}

function drawPath(ctx, pathData) {
  const path = new Path2D(pathData);
  ctx.fill(path);
  ctx.stroke(path);
}

function drawThoughtTail(ctx, bubble) {
  const tip = getTailTip(bubble);
  const base = getTailBase(bubble);
  const midPoint = {
    x: (tip.x + base.x) / 2,
    y: (tip.y + base.y) / 2,
  };
  const circles = [
    { center: midPoint, radius: Math.min(bubble.width, bubble.height) * 0.08 },
    { center: { x: (midPoint.x + tip.x) / 2, y: (midPoint.y + tip.y) / 2 }, radius: Math.min(bubble.width, bubble.height) * 0.06 },
    { center: tip, radius: Math.min(bubble.width, bubble.height) * 0.05 },
  ];
  circles.forEach((info) => {
    ctx.beginPath();
    ctx.arc(info.center.x, info.center.y, info.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

async function exportPsd() {
  const psd = await buildPsdDocument();
  if (!psd) return;
  downloadBlob(new Blob([psd], { type: 'image/vnd.adobe.photoshop' }), 'comic-bubbles.psd');
}

async function buildPsdDocument() {
  const width = state.canvas.width;
  const height = state.canvas.height;
  const header = createPsdHeader(width, height);
  const colorModeData = new Uint8Array(0);
  const imageResources = new Uint8Array(0);
  const layerInfo = await createLayerInfoSection();
  const composite = await createCompositeImage();
  const totalLength =
    header.length +
    4 +
    colorModeData.length +
    4 +
    imageResources.length +
    layerInfo.length +
    composite.length;
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  buffer.set(header, offset);
  offset += header.length;
  writeUint32(buffer, offset, colorModeData.length);
  offset += 4;
  buffer.set(colorModeData, offset);
  offset += colorModeData.length;
  writeUint32(buffer, offset, imageResources.length);
  offset += 4;
  buffer.set(imageResources, offset);
  offset += imageResources.length;
  buffer.set(layerInfo, offset);
  offset += layerInfo.length;
  buffer.set(composite, offset);
  return buffer.buffer;
}

function createPsdHeader(width, height) {
  const buffer = new Uint8Array(26);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 0x38425053); // '8BPS'
  view.setUint16(4, 1); // version
  for (let i = 6; i < 12; i += 1) {
    buffer[i] = 0;
  }
  view.setUint16(12, 4); // channels RGBA
  view.setUint32(14, height);
  view.setUint32(18, width);
  view.setUint16(22, 8); // bits per channel
  view.setUint16(24, 3); // RGB color mode
  return buffer;
}

async function createLayerInfoSection() {
  const layers = await buildLayers();
  const records = layers.map((layer) => layer.record);
  const recordBuffer = concatUint8Arrays(records);
  const channelBuffer = concatUint8Arrays(layers.flatMap((layer) => layer.channelData));
  let layerInfoLength = 2 + recordBuffer.length + channelBuffer.length;
  if (layerInfoLength % 2 !== 0) {
    layerInfoLength += 1;
  }
  const totalLength = 4 + layerInfoLength + 4;
  const buffer = new Uint8Array(4 + totalLength);
  let offset = 0;
  writeUint32(buffer, offset, totalLength);
  offset += 4;
  writeUint32(buffer, offset, layerInfoLength);
  offset += 4;
  writeInt16(buffer, offset, layers.length);
  offset += 2;
  buffer.set(recordBuffer, offset);
  offset += recordBuffer.length;
  buffer.set(channelBuffer, offset);
  offset += channelBuffer.length;
  if ((offset - 8) % 2 !== 0) {
    buffer[offset] = 0;
    offset += 1;
  }
  writeUint32(buffer, offset, 0);
  return buffer;
}

async function buildLayers() {
  const layers = [];
  const imageLayer = await buildImageLayer();
  if (imageLayer) layers.push(imageLayer);
  const panelImageLayer = await buildPanelImageLayer();
  if (panelImageLayer) layers.push(panelImageLayer);
  const panelFrameLayer = await buildPanelFrameLayer();
  if (panelFrameLayer) layers.push(panelFrameLayer);
  const bubbleLayer = await buildBubbleLayer();
  if (bubbleLayer) layers.push(bubbleLayer);
  const textLayers = await Promise.all(state.bubbles.map((bubble) => buildTextLayer(bubble)));
  textLayers.forEach((layer) => {
    if (layer) layers.push(layer);
  });
  return layers;
}

async function buildImageLayer() {
  if (!state.image.src) return null;
  const canvas = document.createElement('canvas');
  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await drawImageToCanvas(ctx, state.image.src, canvas.width, canvas.height);
  return buildRasterLayer('漫画图片', canvas);
}

async function buildBubbleLayer() {
  if (state.bubbles.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;
  const ctx = canvas.getContext('2d');
  drawBubblesToContext(ctx, { includeText: false, includeBodies: true });
  return buildRasterLayer('泡泡', canvas);
}

async function buildPanelImageLayer() {
  const panels = getPanelState();
  if (!panels.pageFrame || !panels.root) return null;
  const canvas = document.createElement('canvas');
  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;
  const ctx = canvas.getContext('2d');
  await drawPanelsToContext(ctx, { includeOverlay: false, includeLines: false, includeImages: true });
  return buildRasterLayer('格框图片', canvas);
}

async function buildPanelFrameLayer() {
  const panels = getPanelState();
  if (!panels.pageFrame || !panels.root) return null;
  const canvas = document.createElement('canvas');
  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;
  const ctx = canvas.getContext('2d');
  const pageFrame = panels.pageFrame;
  ctx.fillStyle = panels.outerColor || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(pageFrame.x, pageFrame.y, pageFrame.width, pageFrame.height);
  ctx.clip();
  ctx.clearRect(pageFrame.x, pageFrame.y, pageFrame.width, pageFrame.height);
  ctx.restore();
  const leaves = collectPanelLeaves(panels.root);
  ctx.save();
  ctx.lineWidth = panels.strokeWidth;
  ctx.strokeStyle = '#11141b';
  leaves.forEach((panel) => {
    ctx.strokeRect(panel.rect.x, panel.rect.y, panel.rect.width, panel.rect.height);
  });
  ctx.restore();
  return buildRasterLayer('漫画框', canvas);
}

async function buildTextLayer(bubble) {
  const displayText = getBubbleDisplayText(bubble);
  if (!displayText) return null;
  const textOnly = document.createElement('canvas');
  textOnly.width = state.canvas.width;
  textOnly.height = state.canvas.height;
  const textCtx = textOnly.getContext('2d');
  textCtx.clearRect(0, 0, textOnly.width, textOnly.height);
  const textRect = getTextRect(bubble);
  textCtx.fillStyle = '#11141b';
  textCtx.font = `${bubble.bold ? 'bold ' : ''}${bubble.fontSize}px ${bubble.fontFamily}`;
  textCtx.textBaseline = 'middle';
  textCtx.textAlign = 'center';
  const lines = displayText.split('\n');
  const lineHeight = bubble.fontSize * 1.2;
  const startY = textRect.y + textRect.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    textCtx.fillText(line, textRect.x + textRect.width / 2, startY + index * lineHeight);
  });
  const textRectPixels = {
    left: clamp(Math.floor(textRect.x), 0, state.canvas.width),
    top: clamp(Math.floor(textRect.y), 0, state.canvas.height),
    right: clamp(Math.ceil(textRect.x + textRect.width), 0, state.canvas.width),
    bottom: clamp(Math.ceil(textRect.y + textRect.height), 0, state.canvas.height),
  };
  const additionalInfo = buildTextLayerInfo(`文字-${bubble.id}`, bubble, textRectPixels);
  return buildRasterLayer(`文字-${bubble.id}`, textOnly, {
    additionalInfo,
  });
}

function buildTextLayerInfo(name, bubble, bounds) {
  const blocks = [buildUnicodeLayerNameInfo(name)];
  const typeTool = buildTypeToolInfo(bubble, bounds);
  if (typeTool) {
    blocks.push(typeTool);
  }
  return blocks;
}

function buildUnicodeLayerNameInfo(name) {
  const unicode = encodeUnicodeStringWithLength(name || '');
  return buildAdditionalLayerInfoBlock('luni', unicode);
}

function buildTypeToolInfo(bubble, bounds) {
  const text = getBubbleDisplayText(bubble);
  if (!text) return null;
  const normalized = text.replace(/\r?\n/g, '\r');
  const engineData = buildEngineDataString(bubble, normalized);
  const encoder = new TextEncoder();
  const engineBytes = encoder.encode(engineData);
  const descriptor = encodeDescriptor('', 'TxLr', [
    { key: 'Txt ', type: 'TEXT', value: normalized },
    { key: 'EngineData', type: 'tdta', value: engineBytes },
    { key: 'bounds', type: 'Objc', value: buildBoundsDescriptor(bounds) },
    { key: 'boundingBox', type: 'Objc', value: buildBoundsDescriptor(bounds) },
    { key: 'textGridding', type: 'enum', value: { typeId: 'textGridding', enumId: 'None' } },
    { key: 'Ornt', type: 'enum', value: { typeId: 'Ornt', enumId: 'Hrzn' } },
  ]);
  const warp = encodeDescriptor('', 'warp', [
    { key: 'warpStyle', type: 'enum', value: { typeId: 'warpStyle', enumId: 'warpNone' } },
    { key: 'warpValue', type: 'doub', value: 0 },
    { key: 'warpPerspective', type: 'doub', value: 0 },
    { key: 'warpPerspectiveOther', type: 'doub', value: 0 },
    { key: 'warpRotate', type: 'enum', value: { typeId: 'warpRotate', enumId: 'warpRotateHorizontal' } },
  ]);
  const bufferLength = 2 + 2 + 6 * 8 + descriptor.length + warp.length + 16;
  const buffer = new Uint8Array(bufferLength);
  const view = new DataView(buffer.buffer);
  let offset = 0;
  view.setUint16(offset, 1);
  offset += 2;
  view.setUint16(offset, 1);
  offset += 2;
  const transform = [1, 0, 0, 1, bounds.left, bounds.top];
  transform.forEach((value) => {
    view.setFloat64(offset, value);
    offset += 8;
  });
  buffer.set(descriptor, offset);
  offset += descriptor.length;
  buffer.set(warp, offset);
  offset += warp.length;
  view.setInt32(offset, bounds.left);
  offset += 4;
  view.setInt32(offset, bounds.top);
  offset += 4;
  view.setInt32(offset, bounds.right);
  offset += 4;
  view.setInt32(offset, bounds.bottom);
  offset += 4;
  return buildAdditionalLayerInfoBlock('TySh', buffer);
}

function buildBoundsDescriptor(bounds) {
  return {
    name: '',
    classId: 'Rctn',
    items: [
      { key: 'Top ', type: 'UntF', value: { unit: '#Pxl', value: bounds.top } },
      { key: 'Left', type: 'UntF', value: { unit: '#Pxl', value: bounds.left } },
      { key: 'Btom', type: 'UntF', value: { unit: '#Pxl', value: bounds.bottom } },
      { key: 'Rght', type: 'UntF', value: { unit: '#Pxl', value: bounds.right } },
    ],
  };
}

function buildEngineDataString(bubble, content) {
  const fontSize = bubble.fontSize || 24;
  const lineHeight = fontSize * 1.2;
  const fontFamily = bubble.fontFamily || 'sans-serif';
  const postScriptName = sanitizePostScriptName(fontFamily);
  const escapedText = escapePsString(content);
  const escapedName = escapePsString(fontFamily);
  const escapedPostScript = escapePsString(postScriptName);
  const runLength = Math.max(1, content.length);
  return [
    '<<',
    '/EngineDict <<',
    '  /EditorVersion 160',
    '  /ParagraphRunArray [ << /ParagraphSheetData << /Justification 0 >> /RunLength ' + runLength + ' >> ]',
    '  /StyleRunArray [ << /StyleSheetData << /FontSize ' + fontSize.toFixed(2) +
      ' /Leading ' + lineHeight.toFixed(2) +
      ' /AutoLeading true /FauxBold ' + (bubble.bold ? 'true' : 'false') +
      ' /FauxItalic false /FillColor [ 0 0 0 1 ] /StrokeColor [ 0 0 0 1 ]' +
      ' /FontPostScriptName (' + escapedPostScript + ') /FontName (' + escapedName + ') >> /RunLength ' + runLength + ' >> ]',
    '  /DocumentResources << /FontSet [ << /Name (' + escapedName + ') /FontPostScriptName (' + escapedPostScript + ') /FontScript 0 /FontType 0 >> ] >>',
    '  /Text (' + escapedText + ')',
    '>>',
    '>>',
  ].join('\n');
}

function sanitizePostScriptName(name) {
  if (!name) return 'Regular';
  return name.replace(/\s+/g, '');
}

function escapePsString(value) {
  return (value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\r');
}

function buildAdditionalLayerInfoBlock(key, data) {
  const paddedLength = data.length + (data.length % 2);
  const buffer = new Uint8Array(12 + paddedLength);
  buffer.set([...'8BIM'].map((c) => c.charCodeAt(0)), 0);
  buffer.set(key.split('').map((c) => c.charCodeAt(0)), 4);
  const view = new DataView(buffer.buffer);
  view.setUint32(8, data.length);
  buffer.set(data, 12);
  if (data.length % 2 === 1) {
    buffer[12 + data.length] = 0;
  }
  return buffer;
}

function encodeDescriptor(name, classId, items, includeSignature = true) {
  const parts = [];
  parts.push(encodeUnicodeStringWithLength(name || ''));
  parts.push(encodeClassId(classId || 'null'));
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, items.length);
  parts.push(count);
  items.forEach((item) => {
    parts.push(encodeClassId(item.key));
    parts.push(stringToBytes(item.type, 4));
    parts.push(encodeDescriptorValue(item.type, item.value));
  });
  const body = parts.length ? concatUint8Arrays(parts) : new Uint8Array(0);
  if (!includeSignature) {
    return body;
  }
  const buffer = new Uint8Array(4 + body.length);
  buffer.set([...'8BIM'].map((c) => c.charCodeAt(0)), 0);
  buffer.set(body, 4);
  return buffer;
}

function encodeDescriptorValue(type, value) {
  switch (type) {
    case 'TEXT':
      return encodeUnicodeStringWithLength(value || '');
    case 'doub': {
      const buffer = new Uint8Array(8);
      new DataView(buffer.buffer).setFloat64(0, Number(value) || 0);
      return buffer;
    }
    case 'long': {
      const buffer = new Uint8Array(4);
      new DataView(buffer.buffer).setInt32(0, Number(value) || 0);
      return buffer;
    }
    case 'bool':
      return new Uint8Array([value ? 1 : 0]);
    case 'UntF': {
      const unit = stringToBytes((value && value.unit) || '#Pxl', 4);
      const buffer = new Uint8Array(4 + 8);
      buffer.set(unit, 0);
      new DataView(buffer.buffer).setFloat64(4, Number(value && value.value) || 0);
      return buffer;
    }
    case 'tdta': {
      const data = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      const padded = data.length % 2 === 0 ? data : (() => {
        const extended = new Uint8Array(data.length + 1);
        extended.set(data, 0);
        return extended;
      })();
      const buffer = new Uint8Array(4 + padded.length);
      new DataView(buffer.buffer).setUint32(0, data.length);
      buffer.set(padded, 4);
      return buffer;
    }
    case 'Objc':
      return encodeDescriptor(value && value.name ? value.name : '', value && value.classId ? value.classId : 'null', value && value.items ? value.items : [], false);
    case 'enum': {
      const typeId = value && value.typeId ? value.typeId : 'null';
      const enumId = value && value.enumId ? value.enumId : 'null';
      return concatUint8Arrays([encodeClassId(typeId), encodeClassId(enumId)]);
    }
    default:
      return new Uint8Array(0);
  }
}

function encodeClassId(id) {
  const encoder = new TextEncoder();
  const text = `${id || ''}`;
  if (text.length === 4 && /^[\x00-\x7F]{4}$/.test(text)) {
    const buffer = new Uint8Array(8);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 0);
    buffer.set(encoder.encode(text), 4);
    return buffer;
  }
  const encoded = encoder.encode(text);
  const buffer = new Uint8Array(4 + encoded.length);
  new DataView(buffer.buffer).setUint32(0, encoded.length);
  buffer.set(encoded, 4);
  return buffer;
}

function stringToBytes(text, length) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text || '');
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    buffer[i] = encoded[i] || 0;
  }
  return buffer;
}

function encodeUnicodeStringWithLength(value) {
  const text = value || '';
  const buffer = new Uint8Array(4 + text.length * 2);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, text.length);
  for (let i = 0; i < text.length; i += 1) {
    view.setUint16(4 + i * 2, text.charCodeAt(i));
  }
  return buffer;
}

function buildRasterLayer(name, canvas, options = {}) {
  const { width, height } = canvas;
  const channels = canvasToChannels(canvas);
  const channelEntries = [
    { id: 0, data: channels[0] },
    { id: 1, data: channels[1] },
    { id: 2, data: channels[2] },
    { id: -1, data: channels[3] },
  ];
  const nameData = pascalString(name);
  const additionalInfo = Array.isArray(options.additionalInfo) ? options.additionalInfo : [];
  const additionalBytes = additionalInfo.length ? concatUint8Arrays(additionalInfo) : new Uint8Array(0);
  const extraLength = 4 + 0 + 4 + 0 + nameData.length + additionalBytes.length;
  const recordLength = 16 + 2 + channelEntries.length * 6 + 12 + 4 + extraLength;
  const record = new Uint8Array(recordLength);
  const view = new DataView(record.buffer);
  let offset = 0;
  view.setInt32(offset, 0);
  offset += 4;
  view.setInt32(offset, 0);
  offset += 4;
  view.setInt32(offset, height);
  offset += 4;
  view.setInt32(offset, width);
  offset += 4;
  view.setInt16(offset, channelEntries.length);
  offset += 2;
  channelEntries.forEach((entry) => {
    view.setInt16(offset, entry.id);
    offset += 2;
    view.setUint32(offset, entry.data.length + 2);
    offset += 4;
  });
  record.set([...'8BIM'].map((c) => c.charCodeAt(0)), offset);
  offset += 4;
  record.set([...'norm'].map((c) => c.charCodeAt(0)), offset);
  offset += 4;
  record[offset++] = 255; // opacity
  record[offset++] = 0; // clipping
  record[offset++] = 0; // flags
  record[offset++] = 0; // filler
  view.setUint32(offset, extraLength);
  offset += 4;
  view.setUint32(offset, 0); // mask length
  offset += 4;
  view.setUint32(offset, 0); // blending ranges length
  offset += 4;
  record.set(nameData, offset);
  offset += nameData.length;
  if (additionalBytes.length) {
    record.set(additionalBytes, offset);
    offset += additionalBytes.length;
  }

  const channelData = channelEntries.map((entry) => {
    const data = new Uint8Array(2 + entry.data.length);
    data[0] = 0;
    data[1] = 0;
    data.set(entry.data, 2);
    return data;
  });

  return { record, channelData };
}

function canvasToChannels(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const channelLength = width * height;
  const channels = [new Uint8Array(channelLength), new Uint8Array(channelLength), new Uint8Array(channelLength), new Uint8Array(channelLength)];
  for (let i = 0; i < channelLength; i += 1) {
    channels[0][i] = imageData[i * 4];
    channels[1][i] = imageData[i * 4 + 1];
    channels[2][i] = imageData[i * 4 + 2];
    channels[3][i] = imageData[i * 4 + 3];
  }
  return channels;
}

function pascalString(name) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(name);
  const length = Math.min(255, encoded.length);
  const paddedLength = length + 1 + ((4 - ((length + 1) % 4)) % 4);
  const buffer = new Uint8Array(paddedLength);
  buffer[0] = length;
  buffer.set(encoded.subarray(0, length), 1);
  return buffer;
}

async function createCompositeImage() {
  const canvas = document.createElement('canvas');
  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.image.src) {
    await drawImageToCanvas(ctx, state.image.src, canvas.width, canvas.height);
  }
  await drawPanelsToContext(ctx, { includeOverlay: true, includeLines: true, includeImages: true });
  drawBubblesToContext(ctx, { includeText: true, includeBodies: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodeCompositeImage(imageData);
}

function encodeCompositeImage(imageData) {
  const { width, height, data } = imageData;
  const header = new Uint8Array(2);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0); // raw data
  const channelSize = width * height;
  const pixelData = new Uint8Array(channelSize * 4);
  for (let i = 0; i < channelSize; i += 1) {
    pixelData[i] = data[i * 4];
    pixelData[i + channelSize] = data[i * 4 + 1];
    pixelData[i + channelSize * 2] = data[i * 4 + 2];
    pixelData[i + channelSize * 3] = data[i * 4 + 3];
  }
  return concatUint8Arrays([header, pixelData]);
}

function concatUint8Arrays(arrays) {
  if (!arrays.length) return new Uint8Array(0);
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((arr) => {
    result.set(arr, offset);
    offset += arr.length;
  });
  return result;
}

function writeUint32(buffer, offset, value) {
  buffer[offset] = (value >>> 24) & 0xff;
  buffer[offset + 1] = (value >>> 16) & 0xff;
  buffer[offset + 2] = (value >>> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}

function writeInt16(buffer, offset, value) {
  const v = value < 0 ? 0xffff + value + 1 : value;
  buffer[offset] = (v >>> 8) & 0xff;
  buffer[offset + 1] = v & 0xff;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

init();
