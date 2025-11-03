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
  placeholder: document.getElementById('placeholder'),
  selectionOverlay: document.getElementById('selection-overlay'),
  inlineEditor: document.getElementById('inline-editor'),
  zoomIndicator: document.getElementById('zoom-indicator'),
  positionIndicator: document.getElementById('position-indicator'),
  fontFamily: document.getElementById('font-family'),
  fontSize: document.getElementById('font-size'),
  toggleBold: document.getElementById('toggle-bold'),
  textContent: document.getElementById('text-content'),
  undo: document.getElementById('undo'),
  exportFormat: document.getElementById('export-format'),
  exportButton: document.getElementById('export'),
  measureBox: document.getElementById('measure-box'),
};

const HANDLE_DIRECTIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CONTROL_PADDING = 28;
const MIN_BODY_SIZE = 80;

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
  history: [],
  historyIndex: -1,
  interaction: null,
  inlineEditingBubbleId: null,
};

const overlay = {
  box: null,
  handles: new Map(),
  tailHandle: null,
};

let imagePickerInFlight = false;

function init() {
  setupSelectionOverlay();
  attachEvents();
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
  elements.undo.addEventListener('click', undo);
  elements.exportButton.addEventListener('click', exportArtwork);

  elements.viewport.addEventListener('wheel', handleWheel, { passive: false });
  elements.viewport.addEventListener('pointerdown', handleViewportPointerDown);
  elements.viewport.addEventListener('dblclick', handleViewportDoubleClick);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);

  elements.bubbleLayer.addEventListener('pointerdown', handleBubblePointerDown);
  elements.bubbleLayer.addEventListener('dblclick', handleBubbleDoubleClick);

  document.addEventListener('keydown', handleKeyDown);
}

function handleImportButtonClick() {
  void openImagePicker();
}

function handleViewportDoubleClick(event) {
  if (event.target.closest('[data-bubble-id]')) {
    return;
  }
  if (state.inlineEditingBubbleId) {
    return;
  }
  void openImagePicker();
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

async function openImagePicker() {
  if (imagePickerInFlight) {
    return;
  }
  imagePickerInFlight = true;
  try {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Images',
              accept: {
                'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'],
              },
            },
          ],
        });
        if (!handle) {
          return;
        }
        const file = await handle.getFile();
        const dataUrl = await readFileAsDataURL(file);
        loadImage(dataUrl);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        console.warn('使用 showOpenFilePicker 失败，尝试使用隐藏输入作为后备。', error);
      }
    }
    const input = elements.hiddenImageInput;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
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
    padding: Math.max(28, Math.min(width, height) * 0.12),
    strokeWidth: Number(elements.strokeWidth.value) || state.defaultStrokeWidth,
    fontFamily: state.fontFamily,
    fontSize: state.fontSize,
    bold: state.bold,
    text: '',
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

function handleTextInput() {
  const bubble = getSelectedBubble();
  if (!bubble) return;
  bubble.text = elements.textContent.value;
  autoFitBubbleToText(bubble);
  render();
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
  }
}

function handlePointerUp(event) {
  if (!state.interaction || state.interaction.pointerId !== event.pointerId) return;
  if (state.interaction.type === 'move-bubble' || state.interaction.type === 'resize' || state.interaction.type === 'tail') {
    pushHistory();
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
  const padding = Math.max(20, bubble.padding);
  const measure = elements.measureBox;
  measure.style.fontFamily = bubble.fontFamily;
  measure.style.fontSize = `${bubble.fontSize}px`;
  measure.style.fontWeight = bubble.bold ? '700' : '400';
  measure.textContent = bubble.text || '';
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
  elements.textContent.value = bubble.text;
  elements.positionIndicator.textContent = `位置：(${bubble.x.toFixed(0)}, ${bubble.y.toFixed(0)}) 尺寸：${bubble.width.toFixed(0)}×${bubble.height.toFixed(0)}`;
}

function openInlineEditor(bubble) {
  const textRect = getTextRect(bubble);
  const topLeft = worldToScreen({ x: textRect.x, y: textRect.y });
  const bottomRight = worldToScreen({ x: textRect.x + textRect.width, y: textRect.y + textRect.height });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  const editor = elements.inlineEditor;
  editor.value = bubble.text;
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
  bubble.text = elements.inlineEditor.value;
  autoFitBubbleToText(bubble);
  elements.inlineEditor.classList.add('hidden');
  state.inlineEditingBubbleId = null;
  elements.textContent.value = bubble.text;
  pushHistory();
  render();
});

elements.inlineEditor.addEventListener('input', () => {
  if (!state.inlineEditingBubbleId) return;
  const bubble = state.bubbles.find((item) => item.id === state.inlineEditingBubbleId);
  if (!bubble) return;
  bubble.text = elements.inlineEditor.value;
  autoFitBubbleToText(bubble);
  elements.textContent.value = bubble.text;
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

function render() {
  renderBubbles();
  updateSelectionOverlay();
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
    div.textContent = bubble.text;
    textNode.appendChild(div);
    group.appendChild(textNode);

    elements.bubbleLayer.appendChild(group);
  });
}

function createBodyShape(bubble) {
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

function buildSpeechTailPath(bubble) {
  const tip = getTailTip(bubble);
  const base = getTailBase(bubble);
  const center = { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 };
  const sideVector = { x: tip.x - center.x, y: tip.y - center.y };
  const dominantHorizontal = Math.abs(sideVector.x) > Math.abs(sideVector.y);
  let baseCenter = { x: base.x, y: base.y };
  const baseWidth = Math.max(36, Math.min(bubble.width, bubble.height) * 0.25);
  const baseHeight = Math.max(36, Math.min(bubble.width, bubble.height) * 0.25);
  let p1;
  let p2;
  if (dominantHorizontal) {
    baseCenter.y = clamp(tip.y, bubble.y + baseHeight * 0.3, bubble.y + bubble.height - baseHeight * 0.3);
    const offset = baseHeight / 2;
    p1 = { x: baseCenter.x, y: baseCenter.y - offset };
    p2 = { x: baseCenter.x, y: baseCenter.y + offset };
  } else {
    baseCenter.x = clamp(tip.x, bubble.x + baseWidth * 0.3, bubble.x + bubble.width - baseWidth * 0.3);
    const offset = baseWidth / 2;
    p1 = { x: baseCenter.x - offset, y: baseCenter.y };
    p2 = { x: baseCenter.x + offset, y: baseCenter.y };
  }
  return `M ${p1.x} ${p1.y} Q ${tip.x} ${tip.y} ${p2.x} ${p2.y}`;
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
  updateSceneTransform();
  render();
  updateControlsFromSelection();
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
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.image.src) {
    await drawImageToCanvas(ctx, state.image.src, canvas.width, canvas.height);
  }
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
      if (bubble.type === 'rectangle' || bubble.type === 'speech-left' || bubble.type === 'speech-right') {
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
      if (bubble.tail) {
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
      const lines = bubble.text.split('\n');
      const lineHeight = bubble.fontSize * 1.2;
      const startY = textRect.y + textRect.height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, textRect.x + textRect.width / 2, startY + index * lineHeight);
      });
    }
    ctx.restore();
  });
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

async function buildTextLayer(bubble) {
  if (!bubble.text) return null;
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
  const lines = bubble.text.split('\n');
  const lineHeight = bubble.fontSize * 1.2;
  const startY = textRect.y + textRect.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    textCtx.fillText(line, textRect.x + textRect.width / 2, startY + index * lineHeight);
  });
  return buildRasterLayer(`文字-${bubble.id}`, textOnly);
}

function buildRasterLayer(name, canvas) {
  const { width, height } = canvas;
  const channels = canvasToChannels(canvas);
  const channelEntries = [
    { id: 0, data: channels[0] },
    { id: 1, data: channels[1] },
    { id: 2, data: channels[2] },
    { id: -1, data: channels[3] },
  ];
  const nameData = pascalString(name);
  const extraLength = 4 + 0 + 4 + 0 + nameData.length;
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
  const padding = (4 - (offset % 4)) % 4;
  offset += padding;

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
