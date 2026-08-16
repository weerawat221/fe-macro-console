// ocrOverlayRenderer.js
// Precise DPI-aware OCR word highlight, lasso drag selection,
// editable popover, and multi-variable assignment.

import { preprocessCropCanvas } from './ocrPreprocessor.js';
import { repairIpv4, parsePortOlt, cleanOcrValueByDataType } from '../shared/networkConfigOcr.js';

let screenshotImg = null;
let canvasWidth = 0;
let canvasHeight = 0;
let availableVariables = [];
let savedOcrMemory = null;

let imgScaleX = 1;
let imgScaleY = 1;

let phase = 'select_region'; // 'select_region' | 'ocr_processing' | 'assign_text'
let cropBox = null; // { x, y, width, height } in CSS viewport pixels
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let currentDrag = { x: 0, y: 0 };

let ocrResult = { words: [], lines: [], text: '' };
let selectedWordIds = new Set();
let assignments = new Map(); // varKey => { varKey, varLabel, wordIds: [], text: '', relativeBox: {} }

// DOM Elements
let canvas, ctx, dimSvg, selectionBox, lassoBox, ocrBoxesContainer;
let topBar, statusText, btnQuickRecall, btnCancelTop;
let varPopover, popoverSelectedTextInput, popoverSearch, varPopoverList;
let bottomBar, btnReselectArea, chkRememberPos, btnCancelBottom, btnApplyValues;
let ocrLoading;

window.addEventListener('DOMContentLoaded', () => {
  initDOMElements();
  initEventListeners();
});

// Receive capture payload from main process
if (window.feMacro?.onOcrCaptureData) {
  window.feMacro.onOcrCaptureData((payload) => {
    loadCaptureData(payload);
  });
}

function initDOMElements() {
  canvas = document.getElementById('screenshotCanvas');
  ctx = canvas.getContext('2d');
  dimSvg = document.getElementById('dimSvg');
  selectionBox = document.getElementById('selectionBox');
  lassoBox = document.getElementById('lassoBox');
  ocrBoxesContainer = document.getElementById('ocrBoxesContainer');

  topBar = document.getElementById('topBar');
  statusText = document.getElementById('statusText');
  btnQuickRecall = document.getElementById('btnQuickRecall');
  btnCancelTop = document.getElementById('btnCancelTop');

  varPopover = document.getElementById('varPopover');
  popoverSelectedTextInput = document.getElementById('popoverSelectedTextInput');
  popoverSearch = document.getElementById('popoverSearch');
  varPopoverList = document.getElementById('varPopoverList');

  bottomBar = document.getElementById('bottomBar');
  btnReselectArea = document.getElementById('btnReselectArea');
  chkRememberPos = document.getElementById('chkRememberPos');
  btnCancelBottom = document.getElementById('btnCancelBottom');
  btnApplyValues = document.getElementById('btnApplyValues');

  ocrLoading = document.getElementById('ocrLoading');
}

function initEventListeners() {
  // Cancel buttons
  btnCancelTop?.addEventListener('click', closeOverlay);
  btnCancelBottom?.addEventListener('click', closeOverlay);

  // Reselect area
  btnReselectArea?.addEventListener('click', resetToRegionSelect);

  // Quick recall
  btnQuickRecall?.addEventListener('click', handleQuickRecall);

  // Apply values
  btnApplyValues?.addEventListener('click', handleApplyValues);

  // Search input inside popover
  popoverSearch?.addEventListener('input', (e) => {
    filterVariablePopover(e.target.value);
  });

  // Mouse interaction for crop (phase 1) and lasso (phase 2)
  const appEl = document.getElementById('ocrApp');
  appEl.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (varPopover && varPopover.style.display !== 'none') {
        hideVariablePopover();
      } else if (selectedWordIds.size > 0) {
        clearWordSelection();
      } else {
        closeOverlay();
      }
    } else if (e.key === 'Enter') {
      if (phase === 'assign_text' && assignments.size > 0 && !e.target.closest('input')) {
        handleApplyValues();
      }
    } else if (e.key === ' ' && phase === 'select_region' && savedOcrMemory && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      handleQuickRecall();
    }
  });
}

function loadCaptureData(data) {
  availableVariables = Array.isArray(data.variables) && data.variables.length > 0
    ? data.variables
    : [
        { key: 'sr_ap', label: 'SR NAME (AP)' },
        { key: 'port', label: 'PORT' },
        { key: 'ce_ip', label: 'CE IP' },
        { key: 'lan_ip', label: 'LAN IP' },
        { key: 'pppoe_user', label: 'PPPOE USER' },
        { key: 'password', label: 'PASSWORD' },
        { key: 'vlan', label: 'VLAN' },
      ];

  savedOcrMemory = data.ocrMemory || null;

  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  screenshotImg = new Image();
  screenshotImg.onload = () => {
    imgScaleX = screenshotImg.naturalWidth / canvasWidth;
    imgScaleY = screenshotImg.naturalHeight / canvasHeight;

    ctx.drawImage(screenshotImg, 0, 0, canvasWidth, canvasHeight);
    renderInitialView();
  };
  screenshotImg.src = data.screenshot;
}

function renderInitialView() {
  phase = 'select_region';
  cropBox = null;
  selectedWordIds.clear();
  assignments.clear();

  if (selectionBox) selectionBox.style.display = 'none';
  if (lassoBox) lassoBox.style.display = 'none';
  if (bottomBar) bottomBar.style.display = 'none';
  if (varPopover) varPopover.style.display = 'none';
  if (ocrBoxesContainer) ocrBoxesContainer.innerHTML = '';

  statusText.textContent = 'Drag a box over text on screen (ESC to cancel)';
  updateDimSvg(null);

  if (savedOcrMemory && savedOcrMemory.cropBox) {
    btnQuickRecall.style.display = 'inline-flex';
  } else {
    btnQuickRecall.style.display = 'none';
  }
}

// =========================================================
// MOUSE INTERACTION (REGION CROP & LASSO SELECTION)
// =========================================================

function handleMouseDown(e) {
  if (e.target.closest('.ocr-top-bar') || e.target.closest('.ocr-bottom-bar') || e.target.closest('.var-popover')) {
    return;
  }

  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  currentDrag = { x: e.clientX, y: e.clientY };

  if (phase === 'select_region') {
    selectionBox.style.left = `${dragStart.x}px`;
    selectionBox.style.top = `${dragStart.y}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
    updateDimSvg({ x: dragStart.x, y: dragStart.y, width: 0, height: 0 });
  } else if (phase === 'assign_text') {
    // Hide popover when clicking outside
    if (varPopover && varPopover.style.display !== 'none') {
      varPopover.style.display = 'none';
    }

    lassoBox.style.left = `${dragStart.x}px`;
    lassoBox.style.top = `${dragStart.y}px`;
    lassoBox.style.width = '0px';
    lassoBox.style.height = '0px';
    lassoBox.style.display = 'none';
  }
}

function handleMouseMove(e) {
  if (!isDragging) return;

  currentDrag = { x: e.clientX, y: e.clientY };

  const x = Math.min(dragStart.x, currentDrag.x);
  const y = Math.min(dragStart.y, currentDrag.y);
  const width = Math.abs(currentDrag.x - dragStart.x);
  const height = Math.abs(currentDrag.y - dragStart.y);

  if (phase === 'select_region') {
    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
    updateDimSvg({ x, y, width, height });
  } else if (phase === 'assign_text') {
    if (width > 5 || height > 5) {
      lassoBox.style.display = 'block';
      lassoBox.style.left = `${x}px`;
      lassoBox.style.top = `${y}px`;
      lassoBox.style.width = `${width}px`;
      lassoBox.style.height = `${height}px`;

      updateLassoSelection({ x, y, width, height });
    }
  }
}

async function handleMouseUp(e) {
  if (!isDragging) return;
  isDragging = false;

  const x = Math.min(dragStart.x, currentDrag.x);
  const y = Math.min(dragStart.y, currentDrag.y);
  const width = Math.abs(currentDrag.x - dragStart.x);
  const height = Math.abs(currentDrag.y - dragStart.y);

  if (phase === 'select_region') {
    if (width < 20 || height < 15) {
      selectionBox.style.display = 'none';
      updateDimSvg(null);
      return;
    }
    cropBox = { x, y, width, height };
    await processCropRegion(cropBox);
  } else if (phase === 'assign_text') {
    lassoBox.style.display = 'none';

    if (width > 5 || height > 5) {
      if (selectedWordIds.size > 0) {
        showVariablePopover();
      }
    } else {
      if (!e.target.closest('.ocr-word-box') && !e.target.closest('.var-popover')) {
        clearWordSelection();
      }
    }
  }
}

function updateLassoSelection(lassoRect) {
  const l1 = lassoRect.x;
  const t1 = lassoRect.y;
  const r1 = lassoRect.x + lassoRect.width;
  const b1 = lassoRect.y + lassoRect.height;

  selectedWordIds.clear();

  (ocrResult.words || []).forEach((w) => {
    const l2 = cropBox.x + (w.bbox.x0 / imgScaleX);
    const t2 = cropBox.y + (w.bbox.y0 / imgScaleY);
    const r2 = cropBox.x + (w.bbox.x1 / imgScaleX);
    const b2 = cropBox.y + (w.bbox.y1 / imgScaleY);

    const intersects = !(r2 < l1 || l2 > r1 || b2 < t1 || t2 > b1);
    if (intersects) {
      selectedWordIds.add(w.id);
    }
  });

  renderOcrWordsVisualOnly();
}

function updateDimSvg(box) {
  if (!dimSvg) return;
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (!box || box.width <= 0 || box.height <= 0) {
    dimSvg.innerHTML = `<rect width="${w}" height="${h}" fill="rgba(0,0,0,0.2)"/>`;
    return;
  }

  dimSvg.innerHTML = `
    <defs>
      <mask id="cutoutMask">
        <rect width="${w}" height="${h}" fill="white" />
        <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="3" ry="3" fill="black" />
      </mask>
    </defs>
    <rect width="${w}" height="${h}" fill="rgba(0,0,0,0.65)" mask="url(#cutoutMask)" />
  `;
}

function repairIpAddress(raw) {
  if (!raw) return '';
  let str = String(raw)
    .replace(/[;:,]/g, '.')
    .replace(/\s+/g, '')
    .trim();

  // Strip leading prefixes like PE., CE., Lan. etc
  str = str.replace(/^(PE|CE|Lan|LAN|PORT|SW|OLT|AP|ONU)\.?/i, '');

  // Strip CIDR mask e.g. /29
  str = str.replace(/\/\d{1,2}$/, '');

  const chunks = str.split('.').filter(Boolean);
  let octets = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const num = parseInt(chunk, 10);

    if (chunk.length > 3 || (num > 255 && chunk.length >= 3)) {
      if (octets.length === 0 && (chunk.startsWith('172') || chunk.startsWith('192') || chunk.startsWith('100') || chunk.startsWith('10')) && chunk.length >= 4) {
        if (chunk.startsWith('172') || chunk.startsWith('192') || chunk.startsWith('100')) {
          octets.push(chunk.slice(0, 3));
          const rest = chunk.slice(3);
          if (rest.length <= 3 && parseInt(rest, 10) <= 255) {
            octets.push(rest);
          }
        } else if (chunk.startsWith('10')) {
          octets.push(chunk.slice(0, 2));
          const rest = chunk.slice(2);
          if (rest.length <= 3 && parseInt(rest, 10) <= 255) {
            octets.push(rest);
          }
        }
      } else if (chunk.startsWith('0') && chunk.length > 1) {
        octets.push('0');
        const rest = chunk.slice(1);
        if (parseInt(rest, 10) <= 255) {
          octets.push(rest);
        }
      } else if (chunk.length === 6) {
        // e.g. 143210 -> 143 and 210
        const o1 = chunk.slice(0, 3);
        const o2 = chunk.slice(3);
        if (parseInt(o1, 10) <= 255 && parseInt(o2, 10) <= 255) {
          octets.push(o1, o2);
        } else {
          octets.push(chunk);
        }
      } else if (chunk.length === 5) {
        // e.g. 17230 -> 172 and 30, or 25514 -> 255 and 14
        const o1 = chunk.slice(0, 3);
        const o2 = chunk.slice(3);
        if (parseInt(o1, 10) <= 255 && parseInt(o2, 10) <= 255) {
          octets.push(o1, o2);
        } else {
          const a1 = chunk.slice(0, 2);
          const a2 = chunk.slice(2);
          if (parseInt(a1, 10) <= 255 && parseInt(a2, 10) <= 255) {
            octets.push(a1, a2);
          } else {
            octets.push(chunk);
          }
        }
      } else if (chunk.length === 4) {
        if (octets.length === 2) {
          const o1 = chunk.slice(0, 1);
          const o2 = chunk.slice(1);
          if (parseInt(o1, 10) <= 255 && parseInt(o2, 10) <= 255) {
            octets.push(o1, o2);
          } else {
            octets.push(chunk.slice(0, 2), chunk.slice(2));
          }
        } else {
          const o1 = chunk.slice(0, 2);
          const o2 = chunk.slice(2);
          if (parseInt(o1, 10) <= 255 && parseInt(o2, 10) <= 255) {
            octets.push(o1, o2);
          } else {
            octets.push(chunk);
          }
        }
      } else {
        octets.push(chunk);
      }
    } else {
      octets.push(chunk);
    }
  }

  if (octets.length === 4 && octets.every((o) => parseInt(o, 10) <= 255)) {
    return octets.join('.');
  }
  return str;
}

function cleanValuable(varKey, rawText) {
  const v = availableVariables.find((item) => item.key === varKey);
  const dataType = v?.dataType || 'String';
  return cleanOcrValueByDataType(rawText, dataType, varKey);
}

// =========================================================
// RUN OCR WITH PRECISE RESOLUTION CROPPING & PREPROCESSING
// =========================================================

async function processCropRegion(box, recallAssignments = null) {
  phase = 'ocr_processing';
  if (selectionBox) selectionBox.style.display = 'none';
  if (ocrLoading) ocrLoading.style.display = 'flex';
  statusText.textContent = 'Processing OCR (English & Thai)…';

  const srcX = Math.round(box.x * imgScaleX);
  const srcY = Math.round(box.y * imgScaleY);
  const srcW = Math.round(box.width * imgScaleX);
  const srcH = Math.round(box.height * imgScaleY);

  // Preprocess cropped canvas: upscale if < 2000px, grayscale, auto dark-invert, contrast stretch
  const preprocessed = preprocessCropCanvas(screenshotImg, srcX, srcY, srcW, srcH, { minWidth: 2000 });

  const res = await window.feMacro.ocrRecognize({
    imageBase64: preprocessed.dataUrl,
    scale: preprocessed.scale,
  });

  if (ocrLoading) ocrLoading.style.display = 'none';

  const words = res?.words || [];

  if (!res || !res.ok || words.length === 0) {
    statusText.textContent = 'No text detected in selected area. Try again.';
    phase = 'select_region';
    updateDimSvg(null);
    return;
  }

  // Auto-repair any words that might have missed dots
  words.forEach((w) => {
    w.text = repairIpv4(w.text);
  });

  ocrResult = res;
  phase = 'assign_text';
  statusText.textContent = `Detected ${words.length} words. Drag across words to highlight (คลุมดำ), then pick a Variable!`;
  if (bottomBar) bottomBar.style.display = 'flex';

  renderOcrWords();

  if (recallAssignments && Array.isArray(recallAssignments)) {
    applyRecalledAssignments(recallAssignments);
  }
}

// =========================================================
// RENDER DETECTED WORDS (CLEAN HIGHLIGHT BOXES)
// =========================================================

function renderOcrWords() {
  if (!ocrBoxesContainer) return;
  ocrBoxesContainer.innerHTML = '';

  const words = ocrResult.words || [];

  words.forEach((w) => {
    const boxEl = document.createElement('div');
    const isSelected = selectedWordIds.has(w.id);
    const assignedVar = getAssignedVarForWord(w.id);

    boxEl.className = 'ocr-word-box' +
      (isSelected ? ' ocr-word-box--selected' : '') +
      (assignedVar ? ' ocr-word-box--assigned' : '');

    const left = cropBox.x + (w.bbox.x0 / imgScaleX);
    const top = cropBox.y + (w.bbox.y0 / imgScaleY);
    const width = Math.max(8, (w.bbox.x1 - w.bbox.x0) / imgScaleX);
    const height = Math.max(12, (w.bbox.y1 - w.bbox.y0) / imgScaleY);

    boxEl.style.left = `${left}px`;
    boxEl.style.top = `${top}px`;
    boxEl.style.width = `${width}px`;
    boxEl.style.height = `${height}px`;
    boxEl.title = `"${w.text}" (${Math.round(w.confidence)}%)`;
    boxEl.id = `box_${w.id}`;

    if (assignedVar) {
      boxEl.setAttribute('data-assigned-var', assignedVar.varKey);
      boxEl.addEventListener('mouseenter', () => {
        setAssignmentHover(assignedVar.varKey, true);
      });
      boxEl.addEventListener('mouseleave', () => {
        setAssignmentHover(assignedVar.varKey, false);
      });
    }

    // Click on word to select/toggle
    boxEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWordSelection(w.id);
    });

    ocrBoxesContainer.appendChild(boxEl);
  });

  renderAssignmentBadges();
  updateApplyButton();
}

function renderOcrWordsVisualOnly() {
  (ocrResult.words || []).forEach((w) => {
    const el = document.getElementById(`box_${w.id}`);
    if (el) {
      const isSelected = selectedWordIds.has(w.id);
      const assignedVar = getAssignedVarForWord(w.id);
      el.className = 'ocr-word-box' +
        (isSelected ? ' ocr-word-box--selected' : '') +
        (assignedVar ? ' ocr-word-box--assigned' : '');
    }
  });
}

function getAssignedVarForWord(wordId) {
  for (const item of assignments.values()) {
    if (item.wordIds.includes(wordId)) return item;
  }
  return null;
}

function toggleWordSelection(wordId) {
  if (selectedWordIds.has(wordId)) {
    selectedWordIds.delete(wordId);
  } else {
    selectedWordIds.add(wordId);
  }

  if (selectedWordIds.size === 0) {
    hideVariablePopover();
  } else {
    showVariablePopover();
  }

  renderOcrWordsVisualOnly();
}

function clearWordSelection() {
  selectedWordIds.clear();
  hideVariablePopover();
  renderOcrWordsVisualOnly();
}

function hideVariablePopover() {
  if (varPopover) varPopover.style.display = 'none';
}

// =========================================================
// VARIABLE POPOVER / TEXT ASSIGNMENT
// =========================================================

function showVariablePopover() {
  if (selectedWordIds.size === 0 || !varPopover) return;

  const selectedWords = (ocrResult.words || [])
    .filter((w) => selectedWordIds.has(w.id))
    .sort((a, b) => {
      const lineDiff = Math.abs(a.bbox.y0 - b.bbox.y0);
      if (lineDiff > 12) return a.bbox.y0 - b.bbox.y0;
      return a.bbox.x0 - b.bbox.x0;
    });

  let textStr = selectedWords.map((w) => w.text).join(' ').trim();
  textStr = textStr.replace(/^(PE|CE|Lan|LAN|PORT|SW|OLT|AP|ONU)\s*:\s*/i, '');
  textStr = repairIpAddress(textStr);

  if (popoverSelectedTextInput) {
    popoverSelectedTextInput.value = textStr;
  }
  if (popoverSearch) popoverSearch.value = '';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  selectedWords.forEach((w) => {
    const l = cropBox.x + (w.bbox.x0 / imgScaleX);
    const t = cropBox.y + (w.bbox.y0 / imgScaleY);
    const r = cropBox.x + (w.bbox.x1 / imgScaleX);
    const b = cropBox.y + (w.bbox.y1 / imgScaleY);
    minX = Math.min(minX, l);
    minY = Math.min(minY, t);
    maxX = Math.max(maxX, r);
    maxY = Math.max(maxY, b);
  });

  renderVariableButtons(availableVariables, selectedWords);

  varPopover.style.display = 'flex';
  const popoverWidth = 260;
  const popoverHeight = 190;

  let popLeft = minX;
  if (popLeft + popoverWidth > window.innerWidth - 12) {
    popLeft = window.innerWidth - popoverWidth - 12;
  }
  popLeft = Math.max(12, popLeft);

  let popTop = minY - popoverHeight - 12;
  if (popTop < 12) {
    popTop = maxY + 12;
  }

  varPopover.style.left = `${popLeft}px`;
  varPopover.style.top = `${popTop}px`;
}

function renderVariableButtons(list, selectedWords) {
  varPopoverList.innerHTML = '';
  list.forEach((v) => {
    const btn = document.createElement('button');
    btn.className = 'var-popover-item';
    btn.textContent = v.label || v.key;
    btn.title = `Assign to ${v.label || v.key} (${v.key})`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const textToAssign = popoverSelectedTextInput?.value?.trim() || selectedWords.map((w) => w.text).join(' ').trim();
      assignSelectedTextToVariable(v.key, v.label || v.key, textToAssign, selectedWords);
    });

    varPopoverList.appendChild(btn);
  });
}

function filterVariablePopover(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = availableVariables.filter(
    (v) => (v.key || '').toLowerCase().includes(q) || (v.label || '').toLowerCase().includes(q)
  );

  const selectedWords = (ocrResult.words || []).filter((w) => selectedWordIds.has(w.id));
  renderVariableButtons(filtered, selectedWords);
}

function assignSelectedTextToVariable(varKey, varLabel, textStr, selectedWords) {
  const cleanedVal = cleanValuable(varKey, textStr);
  const wordIds = selectedWords.map((w) => w.id);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  selectedWords.forEach((w) => {
    minX = Math.min(minX, w.bbox.x0);
    minY = Math.min(minY, w.bbox.y0);
    maxX = Math.max(maxX, w.bbox.x1);
    maxY = Math.max(maxY, w.bbox.y1);
  });

  const relativeBox = {
    x0: minX,
    y0: minY,
    x1: maxX,
    y1: maxY,
  };

  assignments.set(varKey, {
    varKey,
    varLabel,
    wordIds,
    text: cleanedVal,
    relativeBox,
  });

  selectedWordIds.clear();
  hideVariablePopover();

  renderOcrWords();
}

function setAssignmentHover(varKey, isHovered) {
  const badge = document.getElementById(`badge_${varKey}`);
  if (badge) {
    if (isHovered) {
      badge.classList.add('ocr-var-badge--visible');
    } else {
      badge.classList.remove('ocr-var-badge--visible');
    }
  }

  const assign = assignments.get(varKey);
  if (assign && Array.isArray(assign.wordIds)) {
    assign.wordIds.forEach((wid) => {
      const bEl = document.getElementById(`box_${wid}`);
      if (bEl) {
        if (isHovered) {
          bEl.classList.add('ocr-word-box--assigned-hover');
        } else {
          bEl.classList.remove('ocr-word-box--assigned-hover');
        }
      }
    });
  }
}

function renderAssignmentBadges() {
  assignments.forEach((assign) => {
    const words = (ocrResult.words || []).filter((w) => assign.wordIds.includes(w.id));
    if (words.length === 0) return;

    let minX = Infinity, minY = Infinity;
    words.forEach((w) => {
      minX = Math.min(minX, cropBox.x + (w.bbox.x0 / imgScaleX));
      minY = Math.min(minY, cropBox.y + (w.bbox.y0 / imgScaleY));
    });

    const badge = document.createElement('div');
    badge.className = 'ocr-var-badge';
    badge.id = `badge_${assign.varKey}`;
    badge.style.left = `${minX}px`;
    badge.style.top = `${Math.max(6, minY - 28)}px`;

    badge.innerHTML = `
      <span class="ocr-var-badge-label">${assign.varLabel}:</span>
      <span class="ocr-var-badge-val">${assign.text}</span>
      <button type="button" class="ocr-var-badge-del" title="Remove assignment"><i class="fa-solid fa-xmark"></i></button>
    `;

    badge.addEventListener('mouseenter', () => {
      setAssignmentHover(assign.varKey, true);
    });

    badge.addEventListener('mouseleave', () => {
      setAssignmentHover(assign.varKey, false);
    });

    badge.querySelector('.ocr-var-badge-del').addEventListener('click', (e) => {
      e.stopPropagation();
      assignments.delete(assign.varKey);
      renderOcrWords();
    });

    ocrBoxesContainer.appendChild(badge);
  });
}

function updateApplyButton() {
  const count = assignments.size;
  btnApplyValues.disabled = count === 0;
  btnApplyValues.innerHTML = `<i class="fa-solid fa-check"></i> Apply to Macro (${count} Variable${count === 1 ? '' : 's'})`;
}

// =========================================================
// QUICK RECALL / REMEMBERED POSITIONS
// =========================================================

async function handleQuickRecall() {
  if (!savedOcrMemory || !savedOcrMemory.cropBox) return;
  cropBox = savedOcrMemory.cropBox;
  updateDimSvg(cropBox);
  await processCropRegion(cropBox, savedOcrMemory.assignments);
}

function applyRecalledAssignments(recalledList) {
  if (!Array.isArray(recalledList) || !ocrResult.words) return;

  recalledList.forEach((rec) => {
    if (!rec.varKey || !rec.relativeBox) return;

    const r = rec.relativeBox;
    // Tight matching: center of word must fall inside saved bounding box
    const matchingWords = ocrResult.words.filter((w) => {
      const wx = (w.bbox.x0 + w.bbox.x1) / 2;
      const wy = (w.bbox.y0 + w.bbox.y1) / 2;
      return wx >= r.x0 - 8 && wx <= r.x1 + 8 && wy >= r.y0 - 6 && wy <= r.y1 + 6;
    });

    // Sort words in left-to-right reading order
    matchingWords.sort((a, b) => {
      const lineDiff = Math.abs(a.bbox.y0 - b.bbox.y0);
      if (lineDiff > 8) return a.bbox.y0 - b.bbox.y0;
      return a.bbox.x0 - b.bbox.x0;
    });

    if (matchingWords.length > 0) {
      let rawText = matchingWords.map((w) => w.text).join(' ').trim();
      let cleanedText = cleanValuable(rec.varKey, rawText);

      const varDef = availableVariables.find((v) => v.key === rec.varKey);
      const varLabel = varDef ? (varDef.label || varDef.key) : rec.varKey;

      assignments.set(rec.varKey, {
        varKey: rec.varKey,
        varLabel,
        wordIds: matchingWords.map((w) => w.id),
        text: cleanedText,
        relativeBox: rec.relativeBox,
      });
    }
  });

  renderOcrWords();
}

function resetToRegionSelect() {
  renderInitialView();
}

// =========================================================
// SAVE & APPLY VALUES TO MACRO CONSOLE
// =========================================================

async function handleApplyValues() {
  if (assignments.size === 0) return;

  const values = {};
  const assignmentList = [];

  assignments.forEach((item) => {
    values[item.varKey] = item.text;
    assignmentList.push({
      varKey: item.varKey,
      relativeBox: item.relativeBox,
    });
  });

  const shouldRemember = chkRememberPos?.checked;
  const ocrMemory = shouldRemember ? {
    cropBox,
    assignments: assignmentList,
  } : null;

  await window.feMacro.ocrApplyValues({ values, ocrMemory });
}

function closeOverlay() {
  window.feMacro.ocrCloseOverlay();
}
