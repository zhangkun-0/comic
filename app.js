const state = {
  page: {
    width: 900,
    height: 1200,
    gapX: 24,
    gapY: 24
  },
  panels: [],
  bubbles: [],
  layers: [],
  selectedPanelId: null,
  selectedBubbleId: null,
  mode: 'view'
};

const pageEl = document.getElementById('page');
const toggleDrawBtn = document.getElementById('toggle-draw');
const pageWidthInput = document.getElementById('page-width');
const pageHeightInput = document.getElementById('page-height');
const gapXInput = document.getElementById('gap-x');
const gapYInput = document.getElementById('gap-y');
const layerList = document.getElementById('layer-list');
const tooltip = document.getElementById('tooltip');

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

let drawState = null;
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
}

function toggleDrawMode() {
  if (state.mode === 'draw') {
    state.mode = 'view';
    pageEl.dataset.mode = 'view';
    toggleDrawBtn.textContent = '开始绘制格子';
    if (drawState && drawState.overlay) {
      drawState.overlay.remove();
    }
    drawState = null;
  } else {
    state.mode = 'draw';
    pageEl.dataset.mode = 'draw';
    toggleDrawBtn.textContent = '结束绘制格子';
  }
}

toggleDrawBtn.addEventListener('click', toggleDrawMode);

pageWidthInput.addEventListener('input', () => {
  state.page.width = clampNumber(parseInt(pageWidthInput.value, 10) || 900, 200, 2000);
  applyPageSettings();
  refreshAllPanels();
});

pageHeightInput.addEventListener('input', () => {
  state.page.height = clampNumber(parseInt(pageHeightInput.value, 10) || 1200, 200, 3000);
  applyPageSettings();
  refreshAllPanels();
});

gapXInput.addEventListener('input', () => {
  state.page.gapX = clampNumber(parseInt(gapXInput.value, 10) || 0, 0, 400);
  applyPageSettings();
});

gapYInput.addEventListener('input', () => {
  state.page.gapY = clampNumber(parseInt(gapYInput.value, 10) || 0, 0, 400);
  applyPageSettings();
});

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createPanel(points) {
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
  state.layers.push({ type: 'panel', id });
  updatePanelElement(panel);
  refreshLayers();
  selectPanel(id);
}

function updatePanelElement(panel) {
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
  if (state.mode !== 'draw') {
    clearSelection();
    return;
  }
  const rect = pageEl.getBoundingClientRect();
  drawState = {
    startX: clampNumber(event.clientX - rect.left, 0, state.page.width),
    startY: clampNumber(event.clientY - rect.top, 0, state.page.height),
    overlay: createDrawOverlay()
  };
  pageEl.appendChild(drawState.overlay);
  updateDrawOverlay(event);
  document.addEventListener('mousemove', updateDrawOverlay);
  document.addEventListener('mouseup', finishDraw);
});

function createDrawOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'drag-overlay';
  return overlay;
}

function updateDrawOverlay(event) {
  if (!drawState) return;
  const rect = pageEl.getBoundingClientRect();
  const currentX = clampNumber(event.clientX - rect.left, 0, state.page.width);
  const currentY = clampNumber(event.clientY - rect.top, 0, state.page.height);
  const left = Math.min(drawState.startX, currentX);
  const top = Math.min(drawState.startY, currentY);
  const width = Math.abs(currentX - drawState.startX);
  const height = Math.abs(currentY - drawState.startY);
  drawState.overlay.style.left = `${left}px`;
  drawState.overlay.style.top = `${top}px`;
  drawState.overlay.style.width = `${width}px`;
  drawState.overlay.style.height = `${height}px`;
}

function finishDraw(event) {
  document.removeEventListener('mousemove', updateDrawOverlay);
  document.removeEventListener('mouseup', finishDraw);
  if (!drawState) return;
  const rect = pageEl.getBoundingClientRect();
  const endX = clampNumber(event.clientX - rect.left, 0, state.page.width);
  const endY = clampNumber(event.clientY - rect.top, 0, state.page.height);
  const left = Math.min(drawState.startX, endX);
  const top = Math.min(drawState.startY, endY);
  const width = Math.abs(endX - drawState.startX);
  const height = Math.abs(endY - drawState.startY);
  drawState.overlay.remove();
  drawState = null;
  if (width < 30 || height < 30) {
    return;
  }
  const gapX = state.page.gapX / 2;
  const gapY = state.page.gapY / 2;
  const points = [
    { x: left + gapX, y: top + gapY },
    { x: left + width - gapX, y: top + gapY },
    { x: left + width - gapX, y: top + height - gapY },
    { x: left + gapX, y: top + height - gapY }
  ];
  createPanel(points);
}

function updateHandles(panel) {
  removeHandles();
  const indices = [0, 1, 2, 3];
  indices.forEach((index) => {
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.dataset.index = index;
    const point = panel.points[index];
    handle.style.left = `${point.x}px`;
    handle.style.top = `${point.y}px`;
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      startHandleDrag(panel, index, event);
    });
    pageEl.appendChild(handle);
  });
}

function removeHandles() {
  document.querySelectorAll('.handle').forEach((handle) => handle.remove());
}

function startHandleDrag(panel, index, event) {
  handleState = {
    panelId: panel.id,
    index,
    startX: event.clientX,
    startY: event.clientY
  };
  document.addEventListener('mousemove', onHandleMove);
  document.addEventListener('mouseup', stopHandleDrag);
}

function onHandleMove(event) {
  if (!handleState) return;
  const panel = state.panels.find((p) => p.id === handleState.panelId);
  if (!panel) return;
  const rect = pageEl.getBoundingClientRect();
  const x = clampNumber(event.clientX - rect.left, 0, state.page.width);
  const y = clampNumber(event.clientY - rect.top, 0, state.page.height);
  panel.points[handleState.index] = { x, y };
  updatePanelElement(panel);
  showTooltip(event.clientX, event.clientY, `${Math.round(x)}, ${Math.round(y)}`);
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
  toggleDrawBtn.textContent = '开始绘制格子';
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
  const width = state.page.width;
  const height = state.page.height;
  panel.points = movingPanelState.originalPoints.map((point) => {
    const x = clampNumber(point.x + dx, 0, width);
    const y = clampNumber(point.y + dy, 0, height);
    return { x, y };
  });
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
