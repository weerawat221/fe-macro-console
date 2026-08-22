// settingsRenderer.js
// Dedicated standalone window renderer for FE Macro Console Settings.
// Manages Command Sets, Variables, View & Themes, and Export/Import with Conflict Resolution.
// Hidden Variables are protected by PBKDF2+AES-GCM admin password.
// Export is encrypted with a user-set 6-digit PIN.

import {
  getAllThemes,
  customThemes,
  DEFAULT_VIEW_CONFIG,
  loadAndApplyViewConfig,
  applyViewConfig,
  hexToRgb,
  rgbToHex,
  generateCustomThemeObject,
  applyI18nToDOM,
  t,
} from './theme.js';
import { hashPassword, verifyPassword, encryptPayload, decryptPayload } from './crypto.js';
import {
  parseFormula,
  evaluateFormulaAst,
  validateVariableValue,
  detectCircularDependency,
  extractReferencedVariables,
} from '../shared/formulaEngine.js';
import {
  DEFAULT_COMMAND_SETS,
  DEFAULT_VARIABLES,
  normalizeCommandSets,
  normalizeVariables,
} from '../shared/defaultCommandsClient.js';

let commandSets = {};
let variables = [];
let viewConfig = { ...DEFAULT_VIEW_CONFIG };

let activeNavTab = 'apps'; // 'apps' | 'variables' | 'view'
let editorActiveApp = null;
let editorActiveSubmode = null;
let editingCommand = null;
let editingVarIndex = null;
let nsAutoNameTracking = true;
let varSearchQuery = '';
let pendingImportData = null;
let pendingExportPayload = null; // held while waiting for export PIN
let draggedCmdInfo = null;

// Admin password state (for hidden variables)
let adminAuthCallback = null; // function to call after successful admin auth
let adminIsSetup = false; // whether admin password has been set

// Custom Theme Creator State
let ctTargetColors = {
  signal: '#5eead4',
  bgBase: '#0d0f14',
  bgPanel: '#12141c',
  text: '#e2e4ea',
};
let ctActiveTarget = 'signal';
let editingThemeKey = null;

// Toast helper
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('settingsToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('settings-toast--visible');
  setTimeout(() => {
    toast.classList.remove('settings-toast--visible');
  }, duration);
}

function renderAll() {
  applyI18nToDOM(document, viewConfig.language || 'th');
  switchTab(activeNavTab);
}

// Initial bootstrap
async function bootstrap() {
  try {
    viewConfig = await loadAndApplyViewConfig();
    const storedSets = window.feMacro?.storeGet ? await window.feMacro.storeGet('commandSets', null) : null;
    const storedVars = window.feMacro?.storeGet ? await window.feMacro.storeGet('variables', null) : null;
    commandSets = normalizeCommandSets(storedSets || DEFAULT_COMMAND_SETS);
    variables = normalizeVariables(storedVars || DEFAULT_VARIABLES);

    // Sync normalized lists back to store only if uninitialized
    if (window.feMacro?.storeSet) {
      if (storedVars === null) {
        window.feMacro.storeSet('variables', variables);
      }
      if (storedSets === null) {
        window.feMacro.storeSet('commandSets', commandSets);
      }
    }

    // Load admin password setup status
    if (window.feMacro?.storeGet) {
      const adminHash = await window.feMacro.storeGet('adminPwHash', null);
      adminIsSetup = Boolean(adminHash);
    }

    const appKeys = Object.keys(commandSets);
    if (appKeys.length > 0) {
      editorActiveApp = appKeys[0];
      const subKeys = Object.keys(commandSets[editorActiveApp]?.submodes || {});
      editorActiveSubmode = subKeys[0] || 'DEFAULT';
    } else {
      editorActiveApp = null;
      editorActiveSubmode = null;
    }
  } catch (err) {
    console.error('Settings bootstrap failed:', err);
  } finally {
    renderAll();
  }
}

// Synchronously initialize UI event listeners and initial render immediately
initUI();
renderAll();

// Asynchronously load persisted store and re-render
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// Sync from other window updates (safely without disrupting active modals or focused typing inputs)
if (window.feMacro?.onStoreUpdated) {
  window.feMacro.onStoreUpdated(async ({ key, value }) => {
    const isModalOpen = Boolean(document.querySelector('.modal-overlay:not(.modal-overlay--hidden)'));
    const isUserTyping = document.activeElement && (
      document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA' ||
      document.activeElement.tagName === 'SELECT'
    );

    if (key === 'commandSets') {
      commandSets = value || {};
      const appKeys = Object.keys(commandSets);
      if (!editorActiveApp || !commandSets[editorActiveApp]) {
        editorActiveApp = appKeys[0] || null;
        if (editorActiveApp && commandSets[editorActiveApp]) {
          const subKeys = Object.keys(commandSets[editorActiveApp].submodes || {});
          editorActiveSubmode = subKeys[0] || null;
        } else {
          editorActiveSubmode = null;
        }
      }
      if (!isModalOpen && !isUserTyping) {
        renderAll();
      }
    } else if (key === 'variables') {
      variables = value || [];
      if (!isModalOpen && !isUserTyping) {
        renderVariablesManager();
      }
    } else if (key === 'viewConfig') {
      viewConfig = value || { ...DEFAULT_VIEW_CONFIG };
      applyViewConfig(viewConfig);
      if (!isModalOpen && !isUserTyping) {
        renderViewSettings();
      }
    } else if (key === 'customThemes') {
      if (!isModalOpen && !isUserTyping) {
        renderViewSettings();
      }
    }
  });
}

function initUI() {
  // Navigation tabs
  document.getElementById('tabNavApps')?.addEventListener('click', () => switchTab('apps'));
  document.getElementById('tabNavVariables')?.addEventListener('click', () => switchTab('variables'));
  document.getElementById('tabNavView')?.addEventListener('click', () => switchTab('view'));

  // Export / Import
  document.getElementById('btnExportConfig')?.addEventListener('click', handleExportConfig);
  document.getElementById('btnImportConfig')?.addEventListener('click', handleImportConfig);

  // Command sets actions
  document.getElementById('btnAddMode')?.addEventListener('click', openNewSetModal);
  document.getElementById('btnAddSubmode')?.addEventListener('click', openNewSubmodeModal);
  document.getElementById('btnAddGroup')?.addEventListener('click', addNewGroup);
  document.getElementById('btnAddProcToSet')?.addEventListener('click', openAddProcModal);

  // Variables actions
  document.getElementById('btnAddVariable')?.addEventListener('click', openNewVariableModal);
  const searchInput = document.getElementById('varSearchInput');
  const searchClear = document.getElementById('varSearchClear');

  function updateVarSearch(query) {
    varSearchQuery = (query || '').toLowerCase().trim();
    if (searchClear) {
      searchClear.style.display = (query && query.length > 0) ? 'inline-flex' : 'none';
    }
    renderVariablesManager();
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => updateVarSearch(e.target.value));
    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        updateVarSearch('');
      } else {
        updateVarSearch(e.target.value);
      }
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateVarSearch(e.target.value);
      }
    });
    searchInput.addEventListener('search', (e) => updateVarSearch(e.target.value));
  }

  const searchWrap = document.querySelector('.var-search-wrap');
  if (searchWrap) {
    searchWrap.addEventListener('click', (e) => {
      if (e.target !== searchClear && !searchClear?.contains(e.target)) {
        searchInput?.focus();
      }
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      updateVarSearch('');
    });
  }

  // View settings actions
  initViewSettings();
  initCustomThemeModal();

  // Modals
  initNewSetModal();
  initNewSubmodeModal();
  initAddProcModal();
  initCommandFormModal();
  initVariableFormModal();
  initFormulaStudio();
  initConflictModal();
  initAdminPasswordModal();
  initExportPasswordModal();
  initImportPasswordModal();

  // Escape key closes modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModals = [
        { id: 'formulaStudioModal', close: closeFormulaStudio },
        { id: 'adminPasswordModal', close: closeAdminPasswordModal },
        { id: 'exportPasswordModal', close: closeExportPasswordModal },
        { id: 'importPasswordModal', close: closeImportPasswordModal },
        { id: 'customThemeModal', close: closeCustomThemeModal },
        { id: 'commandFormModal', close: closeCommandForm },
        { id: 'varFormModal', close: closeVariableForm },
        { id: 'newSubmodeModal', close: closeNewSubmodeModal },
        { id: 'addProcModal', close: closeAddProcModal },
        { id: 'newSetModal', close: closeNewSetModal },
        { id: 'importConflictModal', close: closeConflictModal },
      ];
      for (const m of openModals) {
        const el = document.getElementById(m.id);
        if (el && !el.classList.contains('modal-overlay--hidden')) {
          m.close();
          e.stopPropagation();
          break;
        }
      }
    }
  });
}

function switchTab(tabKey) {
  activeNavTab = tabKey;
  const btnApps = document.getElementById('tabNavApps');
  const btnVars = document.getElementById('tabNavVariables');
  const btnView = document.getElementById('tabNavView');

  const viewApps = document.getElementById('editorViewApps');
  const viewVars = document.getElementById('editorViewVariables');
  const viewTheme = document.getElementById('editorViewTheme');

  [btnApps, btnVars, btnView].forEach((btn) => {
    btn?.classList.remove('editor-top-tab--active');
    btn?.setAttribute('aria-selected', 'false');
  });

  if (viewApps) viewApps.style.display = 'none';
  if (viewVars) viewVars.style.display = 'none';
  if (viewTheme) viewTheme.style.display = 'none';

  if (tabKey === 'apps') {
    btnApps?.classList.add('editor-top-tab--active');
    btnApps?.setAttribute('aria-selected', 'true');
    if (viewApps) viewApps.style.display = 'flex';
    renderEditorNav();
    renderEditorProcs();
    renderEditorSubmodes();
    renderEditorGroups();
  } else if (tabKey === 'variables') {
    btnVars?.classList.add('editor-top-tab--active');
    btnVars?.setAttribute('aria-selected', 'true');
    if (viewVars) viewVars.style.display = 'flex';
    renderVariablesManager();
  } else if (tabKey === 'view') {
    btnView?.classList.add('editor-top-tab--active');
    btnView?.setAttribute('aria-selected', 'true');
    if (viewTheme) viewTheme.style.display = 'flex';
    renderViewSettings();
  }
}

async function persistCommandSets() {
  if (window.feMacro?.storeSet) {
    await window.feMacro.storeSet('commandSets', commandSets);
  }
}

async function persistVariables() {
  if (window.feMacro?.storeSet) {
    await window.feMacro.storeSet('variables', variables);
  }
}

async function persistViewConfig() {
  if (window.feMacro?.storeSet) {
    await window.feMacro.storeSet('viewConfig', viewConfig);
  }
}

async function persistCustomThemes() {
  if (window.feMacro?.storeSet) {
    await window.feMacro.storeSet('customThemes', customThemes);
  }
}

// =========================================================
// VIEW & THEMES SETTINGS
// =========================================================

function initViewSettings() {
  const sliderCmdFont = document.getElementById('sliderCmdFontSize');
  const valCmdFont = document.getElementById('valCmdFontSize');
  const sliderInputFont = document.getElementById('sliderInputFontSize');
  const valInputFont = document.getElementById('valInputFontSize');

  const selFontFamily = document.getElementById('selFontFamily');
  const selDensity = document.getElementById('selDensity');

  const btnLangTh = document.getElementById('btnLangTh');
  const btnLangEn = document.getElementById('btnLangEn');

  async function switchLanguage(lang) {
    viewConfig.language = lang;
    applyViewConfig(viewConfig);
    await persistViewConfig();
    renderViewSettings();
    renderAll();
  }

  btnLangTh?.addEventListener('click', () => switchLanguage('th'));
  btnLangEn?.addEventListener('click', () => switchLanguage('en'));

  sliderCmdFont?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (valCmdFont) valCmdFont.textContent = `${val}px`;
    viewConfig.cmdFontSize = `${val}px`;
    applyViewConfig(viewConfig);
    persistViewConfig();
  });

  sliderInputFont?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (valInputFont) valInputFont.textContent = `${val}px`;
    viewConfig.inputFontSize = `${val}px`;
    applyViewConfig(viewConfig);
    persistViewConfig();
  });

  selFontFamily?.addEventListener('change', (e) => {
    viewConfig.fontFamily = e.target.value;
    applyViewConfig(viewConfig);
    persistViewConfig();
  });

  selDensity?.addEventListener('change', (e) => {
    viewConfig.density = e.target.value;
    applyViewConfig(viewConfig);
    persistViewConfig();
  });

  document.getElementById('btnAddCustomTheme')?.addEventListener('click', openCustomThemeModal);
}

function renderViewSettings() {
  // Update Language Switcher Buttons state
  const curLang = viewConfig.language || 'th';
  const btnLangTh = document.getElementById('btnLangTh');
  const btnLangEn = document.getElementById('btnLangEn');

  if (btnLangTh && btnLangEn) {
    if (curLang === 'th') {
      btnLangTh.classList.remove('btn--secondary');
      btnLangTh.classList.add('btn--primary');
      btnLangEn.classList.remove('btn--primary');
      btnLangEn.classList.add('btn--secondary');
    } else {
      btnLangEn.classList.remove('btn--secondary');
      btnLangEn.classList.add('btn--primary');
      btnLangTh.classList.remove('btn--primary');
      btnLangTh.classList.add('btn--secondary');
    }
  }

  // Theme Presets Grid
  const grid = document.getElementById('themePresetGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const allThemes = getAllThemes();

  Object.entries(allThemes).forEach(([themeKey, preset]) => {
    const card = document.createElement('div');
    const isSelected = (viewConfig.theme || 'dark_void') === themeKey;
    card.className = 'theme-preset-card' + (isSelected ? ' theme-preset-card--selected' : '');

    const dots = document.createElement('div');
    dots.className = 'theme-preset-dots';

    const bgDot = document.createElement('span');
    bgDot.className = 'theme-dot';
    bgDot.style.background = preset.colors['--bg-panel'];

    const signalDot = document.createElement('span');
    signalDot.className = 'theme-dot';
    signalDot.style.background = preset.colors['--signal'];

    const textDot = document.createElement('span');
    textDot.className = 'theme-dot';
    textDot.style.background = preset.colors['--text-primary'];

    dots.appendChild(bgDot);
    dots.appendChild(signalDot);
    dots.appendChild(textDot);
    card.appendChild(dots);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'theme-preset-name';
    nameSpan.textContent = preset.name;
    card.appendChild(nameSpan);

    const actions = document.createElement('div');
    actions.className = 'theme-preset-actions';

    // Edit button on EVERY theme card
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--ghost btn--xs theme-preset-edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.title = `Edit ${preset.name}`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomThemeModal(themeKey);
    });
    actions.appendChild(editBtn);

    // If custom theme, add delete button
    if (preset.isCustom) {
      const delBtn = document.createElement('span');
      delBtn.className = 'theme-preset-del';
      delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
      delBtn.title = 'Delete this custom theme';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCustomTheme(themeKey);
      });
      actions.appendChild(delBtn);
    }

    card.appendChild(actions);

    card.addEventListener('click', () => {
      viewConfig.theme = themeKey;
      applyViewConfig(viewConfig);
      persistViewConfig();
      renderViewSettings();
      showToast(`Theme applied: ${preset.name}`);
    });

    grid.appendChild(card);
  });

  // Set slider values and badges
  const cmdVal = parseFloat(viewConfig.cmdFontSize) || 11;
  const sliderCmdFont = document.getElementById('sliderCmdFontSize');
  const valCmdFont = document.getElementById('valCmdFontSize');
  if (sliderCmdFont) sliderCmdFont.value = cmdVal;
  if (valCmdFont) valCmdFont.textContent = `${cmdVal}px`;

  const inputVal = parseFloat(viewConfig.inputFontSize) || 11;
  const sliderInputFont = document.getElementById('sliderInputFontSize');
  const valInputFont = document.getElementById('valInputFontSize');
  if (sliderInputFont) sliderInputFont.value = inputVal;
  if (valInputFont) valInputFont.textContent = `${inputVal}px`;

  const selFontFamily = document.getElementById('selFontFamily');
  if (selFontFamily) selFontFamily.value = viewConfig.fontFamily || "'JetBrains Mono', 'Consolas', monospace";

  const selDensity = document.getElementById('selDensity');
  if (selDensity) selDensity.value = viewConfig.density || 'normal';
}

// =========================================================
// CUSTOM THEME CREATOR MODAL & COLOR WHEEL / RGB LOGIC
// =========================================================

function initCustomThemeModal() {
  document.getElementById('ctCancel')?.addEventListener('click', closeCustomThemeModal);
  document.getElementById('ctSave')?.addEventListener('click', saveCustomTheme);

  // Target Color Selector buttons
  const targetButtons = [
    { id: 'btnTargetSignal', target: 'signal' },
    { id: 'btnTargetBgBase', target: 'bgBase' },
    { id: 'btnTargetBgPanel', target: 'bgPanel' },
    { id: 'btnTargetText', target: 'text' },
  ];

  targetButtons.forEach(({ id, target }) => {
    document.getElementById(id)?.addEventListener('click', () => {
      setActiveColorTarget(target);
    });
  });

  // Color Wheel input & Box trigger
  const wheelInput = document.getElementById('ctColorWheel');
  const wheelBox = document.getElementById('ctColorWheelBox');

  const triggerColorPicker = () => {
    if (!wheelInput) return;
    try {
      if (typeof wheelInput.showPicker === 'function') {
        wheelInput.showPicker();
      } else {
        wheelInput.click();
      }
    } catch (err) {
      wheelInput.click();
    }
  };

  wheelBox?.addEventListener('click', (e) => {
    if (e.target !== wheelInput) {
      triggerColorPicker();
    }
  });

  wheelInput?.addEventListener('input', (e) => {
    updateColorFromHex(e.target.value);
  });
  wheelInput?.addEventListener('change', (e) => {
    updateColorFromHex(e.target.value);
  });

  // Preset Color Palette Swatches
  const QUICK_COLORS = [
    '#5eead4', '#2dd4bf', '#14b8a6', '#0ea5e9', '#38bdf8', '#60a5fa', '#3b82f6',
    '#818cf8', '#6366f1', '#a855f7', '#c084fc', '#e879f9', '#f472b6', '#fb7185',
    '#f87171', '#ef4444', '#fb923c', '#f97316', '#fbbf24', '#f59e0b', '#eab308',
    '#a3e635', '#84cc16', '#4ade80', '#22c55e', '#ffffff', '#e2e4ea', '#94a3b8',
    '#64748b', '#334155', '#1e293b', '#0f172a', '#12141c', '#0d0f14', '#000000'
  ];

  const swatchesContainer = document.getElementById('ctQuickSwatches');
  if (swatchesContainer) {
    swatchesContainer.innerHTML = '';
    QUICK_COLORS.forEach((hex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-swatch-btn';
      btn.style.background = hex;
      btn.title = hex;
      btn.setAttribute('data-color', hex.toLowerCase());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        updateColorFromHex(hex);
      });
      swatchesContainer.appendChild(btn);
    });
  }

  // HEX Text Input
  const hexInput = document.getElementById('ctHexInput');
  hexInput?.addEventListener('input', (e) => {
    let val = e.target.value.trim();
    if (!val.startsWith('#')) val = `#${val}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      updateColorFromHex(val);
    }
  });

  // RGB Sliders & Number Inputs
  const syncRgbChange = (r, g, b) => {
    const hex = rgbToHex(r, g, b);
    updateColorFromHex(hex);
  };

  const sliderR = document.getElementById('sliderR');
  const numR = document.getElementById('numR');
  const sliderG = document.getElementById('sliderG');
  const numG = document.getElementById('numG');
  const sliderB = document.getElementById('sliderB');
  const numB = document.getElementById('numB');

  sliderR?.addEventListener('input', () => {
    if (numR) numR.value = sliderR.value;
    syncRgbChange(sliderR.value, sliderG.value, sliderB.value);
  });
  numR?.addEventListener('input', () => {
    if (sliderR) sliderR.value = numR.value;
    syncRgbChange(numR.value, sliderG.value, sliderB.value);
  });

  sliderG?.addEventListener('input', () => {
    if (numG) numG.value = sliderG.value;
    syncRgbChange(sliderR.value, sliderG.value, sliderB.value);
  });
  numG?.addEventListener('input', () => {
    if (sliderG) sliderG.value = numG.value;
    syncRgbChange(sliderR.value, numG.value, sliderB.value);
  });

  sliderB?.addEventListener('input', () => {
    if (numB) numB.value = sliderB.value;
    syncRgbChange(sliderR.value, sliderG.value, sliderB.value);
  });
  numB?.addEventListener('input', () => {
    if (sliderB) sliderB.value = numB.value;
    syncRgbChange(sliderR.value, sliderG.value, numB.value);
  });
}

function openCustomThemeModal(themeKey = null) {
  editingThemeKey = (typeof themeKey === 'string') ? themeKey : null;

  const nameInput = document.getElementById('ctThemeName');
  const modalTitle = document.getElementById('customThemeTitle');

  const allThemes = getAllThemes();
  const themeToLoad = (editingThemeKey && allThemes[editingThemeKey])
    ? allThemes[editingThemeKey]
    : (allThemes[viewConfig.theme] || allThemes.dark_void);

  if (modalTitle) {
    modalTitle.textContent = editingThemeKey ? `Edit Theme: ${themeToLoad?.name || ''}` : 'Create Custom Theme';
  }

  if (nameInput) {
    nameInput.value = editingThemeKey ? (themeToLoad?.name || '') : '';
  }

  ctTargetColors = {
    signal: themeToLoad?.colors?.['--signal'] || '#5eead4',
    bgBase: themeToLoad?.colors?.['--bg-base'] || '#0d0f14',
    bgPanel: themeToLoad?.colors?.['--bg-panel'] || '#12141c',
    text: themeToLoad?.colors?.['--text-primary'] || '#e2e4ea',
  };

  updateAllTargetSwatches();
  setActiveColorTarget('signal');

  document.getElementById('customThemeModal')?.classList.remove('modal-overlay--hidden');
  nameInput?.focus();
}

function closeCustomThemeModal() {
  document.getElementById('customThemeModal')?.classList.add('modal-overlay--hidden');
  editingThemeKey = null;
}

function setActiveColorTarget(targetKey) {
  ctActiveTarget = targetKey;

  const btnMap = {
    signal: 'btnTargetSignal',
    bgBase: 'btnTargetBgBase',
    bgPanel: 'btnTargetBgPanel',
    text: 'btnTargetText',
  };

  Object.entries(btnMap).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (k === targetKey) {
      el?.classList.add('color-target-btn--active');
    } else {
      el?.classList.remove('color-target-btn--active');
    }
  });

  const hex = ctTargetColors[targetKey] || '#5eead4';
  syncPickersToHex(hex);
  updateCtPreviewCard();
}

function updateColorFromHex(hex) {
  ctTargetColors[ctActiveTarget] = hex;

  // Update swatch & hex label for active target
  const swatchMap = {
    signal: 'swatchSignal',
    bgBase: 'swatchBgBase',
    bgPanel: 'swatchBgPanel',
    text: 'swatchText',
  };
  const labelMap = {
    signal: 'hexLabelSignal',
    bgBase: 'hexLabelBgBase',
    bgPanel: 'hexLabelBgPanel',
    text: 'hexLabelText',
  };

  const swatch = document.getElementById(swatchMap[ctActiveTarget]);
  const label = document.getElementById(labelMap[ctActiveTarget]);
  if (swatch) swatch.style.background = hex;
  if (label) label.textContent = hex;

  syncPickersToHex(hex);
  updateCtPreviewCard();
}

function syncPickersToHex(hex) {
  const wheel = document.getElementById('ctColorWheel');
  const hexInput = document.getElementById('ctHexInput');
  if (wheel) wheel.value = hex;
  if (hexInput && hexInput.value.toLowerCase() !== hex.toLowerCase()) {
    hexInput.value = hex;
  }

  // Update quick swatch active states
  const targetHex = (hex || '').toLowerCase();
  document.querySelectorAll('#ctQuickSwatches .quick-swatch-btn').forEach((btn) => {
    if (btn.getAttribute('data-color') === targetHex) {
      btn.classList.add('quick-swatch-btn--active');
    } else {
      btn.classList.remove('quick-swatch-btn--active');
    }
  });

  const { r, g, b } = hexToRgb(hex);
  const sliderR = document.getElementById('sliderR');
  const numR = document.getElementById('numR');
  const sliderG = document.getElementById('sliderG');
  const numG = document.getElementById('numG');
  const sliderB = document.getElementById('sliderB');
  const numB = document.getElementById('numB');

  if (sliderR) sliderR.value = r;
  if (numR) numR.value = r;
  if (sliderG) sliderG.value = g;
  if (numG) numG.value = g;
  if (sliderB) sliderB.value = b;
  if (numB) numB.value = b;
}

function updateAllTargetSwatches() {
  const pairs = [
    ['swatchSignal', 'hexLabelSignal', ctTargetColors.signal],
    ['swatchBgBase', 'hexLabelBgBase', ctTargetColors.bgBase],
    ['swatchBgPanel', 'hexLabelBgPanel', ctTargetColors.bgPanel],
    ['swatchText', 'hexLabelText', ctTargetColors.text],
  ];

  pairs.forEach(([swatchId, labelId, val]) => {
    const swatch = document.getElementById(swatchId);
    const label = document.getElementById(labelId);
    if (swatch) swatch.style.background = val;
    if (label) label.textContent = val;
  });

  updateCtPreviewCard();
}

function updateCtPreviewCard() {
  const card = document.getElementById('ctPreviewCard');
  const badge = document.getElementById('ctPreviewBadge');
  const text = document.getElementById('ctPreviewText');

  if (card) {
    card.style.background = ctTargetColors.bgPanel;
    card.style.borderColor = ctTargetColors.bgBase;
  }
  if (badge) {
    badge.style.background = ctTargetColors.signal;
    badge.style.color = ctTargetColors.bgBase;
  }
  if (text) {
    text.style.color = ctTargetColors.text;
  }
}

async function saveCustomTheme() {
  const nameInput = document.getElementById('ctThemeName');
  const name = (nameInput?.value || '').trim();
  if (!name) {
    showToast('Please enter a theme name');
    return;
  }

  let key = editingThemeKey;
  // If editing a built-in theme or creating new, generate a custom key
  if (!key || !customThemes[key]) {
    key = `custom_${Date.now()}`;
  }

  const themeObj = generateCustomThemeObject(
    name,
    ctTargetColors.signal,
    ctTargetColors.bgBase,
    ctTargetColors.bgPanel,
    ctTargetColors.text
  );

  customThemes[key] = themeObj;
  await persistCustomThemes();

  viewConfig.theme = key;
  applyViewConfig(viewConfig);
  await persistViewConfig();

  closeCustomThemeModal();
  renderViewSettings();
  showToast(`Theme "${name}" saved and applied!`);
}

async function deleteCustomTheme(themeKey) {
  const allThemes = getAllThemes();
  const theme = allThemes[themeKey];
  if (!theme) return;

  if (!confirm(`Delete custom theme "${theme.name}"?`)) return;

  delete customThemes[themeKey];
  await persistCustomThemes();

  if (viewConfig.theme === themeKey) {
    viewConfig.theme = 'dark_void';
    applyViewConfig(viewConfig);
    await persistViewConfig();
  }

  renderViewSettings();
  showToast(`Custom theme "${theme.name}" deleted`);
}

// =========================================================
// EXPORT & IMPORT SETTINGS WITH CONFLICT RESOLUTION
// =========================================================

async function handleExportConfig() {
  // Step 1: require admin password verification
  requireAdminPassword('Export Settings', async () => {
    // Step 2: ask for export PIN
    pendingExportPayload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      commandSets,
      variables,
      viewConfig,
    };
    openExportPasswordModal();
  });
}

async function handleImportConfig() {
  try {
    const res = await window.feMacro.importConfig();
    if (res.canceled) return;
    if (!res.ok || !res.data) {
      showToast(`Import failed: ${res.error || 'Invalid file content'}`);
      return;
    }

    const rawData = res.data;

    // Check if file is encrypted
    if (rawData.__encrypted) {
      // Ask for export PIN to decrypt
      openImportPasswordModal(rawData);
      return;
    }

    processImportData(rawData);
  } catch (err) {
    showToast(`Import error: ${err.message}`);
  }
}

function processImportData(data) {
  const incomingSets = data.commandSets || {};
  const incomingVars = Array.isArray(data.variables) ? data.variables : [];
  const incomingView = data.viewConfig || null;

  if (Object.keys(incomingSets).length === 0 && incomingVars.length === 0) {
    showToast('The selected file does not contain any Command Sets or Variables');
    return;
  }

  const conflicts = [];

  // Check Command Sets conflicts
  Object.entries(incomingSets).forEach(([appKey, appObj]) => {
    if (commandSets[appKey]) {
      conflicts.push({ type: 'app', key: appKey, name: appObj.name || appKey, incomingData: appObj, existingData: commandSets[appKey] });
    }
  });

  // Check Variables conflicts
  incomingVars.forEach((v) => {
    const existing = variables.find((item) => item.key.toLowerCase() === v.key.toLowerCase());
    if (existing) {
      conflicts.push({ type: 'var', key: v.key, name: `{${v.key}} - ${v.label || v.key}`, incomingData: v, existingData: existing });
    }
  });

  if (incomingView) {
    viewConfig = { ...viewConfig, ...incomingView };
    applyViewConfig(viewConfig);
    persistViewConfig();
  }

  if (conflicts.length === 0) {
    applyImportData(incomingSets, incomingVars, {});
    showToast('Settings imported successfully!');
  } else {
    openConflictModal(incomingSets, incomingVars, conflicts);
  }
}

function initConflictModal() {
  document.getElementById('conflictCancel')?.addEventListener('click', closeConflictModal);
  document.getElementById('conflictConfirm')?.addEventListener('click', confirmApplyImportWithConflicts);

  document.getElementById('btnConflictAllOverwrite')?.addEventListener('click', () => {
    setAllConflictRadios('overwrite');
  });
  document.getElementById('btnConflictAllKeepBoth')?.addEventListener('click', () => {
    setAllConflictRadios('keep_both');
  });
  document.getElementById('btnConflictAllSkip')?.addEventListener('click', () => {
    setAllConflictRadios('skip');
  });
}

function setAllConflictRadios(action) {
  document.querySelectorAll('#conflictItemsList input[type="radio"]').forEach((radio) => {
    if (radio.value === action) radio.checked = true;
  });
}

function openConflictModal(incomingSets, incomingVars, conflicts) {
  pendingImportData = { incomingSets, incomingVars, conflicts };
  const container = document.getElementById('conflictItemsList');
  container.innerHTML = '';

  conflicts.forEach((c, idx) => {
    const card = document.createElement('div');
    card.className = 'conflict-item-card';

    const header = document.createElement('div');
    header.className = 'conflict-item-header';

    const title = document.createElement('div');
    title.className = 'conflict-item-title';

    const badge = document.createElement('span');
    badge.className = `conflict-item-badge ${c.type === 'app' ? 'conflict-item-badge--app' : 'conflict-item-badge--var'}`;
    badge.textContent = c.type === 'app' ? 'Command Set' : 'Valuable';
    title.appendChild(badge);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = c.name;
    title.appendChild(labelSpan);

    header.appendChild(title);
    card.appendChild(header);

    const options = document.createElement('div');
    options.className = 'conflict-options';

    const optOverwrite = createConflictRadio(idx, 'overwrite', 'Overwrite (ทับของเดิม)', true);
    const optKeepBoth = createConflictRadio(idx, 'keep_both', 'Keep Both (เก็บทั้งคู่/เปลี่ยนชื่อ)', false);
    const optSkip = createConflictRadio(idx, 'skip', 'Keep Existing (เก็บของเดิม/ข้าม)', false);

    options.appendChild(optOverwrite);
    options.appendChild(optKeepBoth);
    options.appendChild(optSkip);

    card.appendChild(options);
    container.appendChild(card);
  });

  document.getElementById('importConflictModal').classList.remove('modal-overlay--hidden');
}

function createConflictRadio(itemIdx, value, labelText, isChecked) {
  const label = document.createElement('label');
  label.className = 'conflict-option-label';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = `conflict_choice_${itemIdx}`;
  radio.value = value;
  radio.checked = isChecked;

  label.appendChild(radio);
  label.appendChild(document.createTextNode(labelText));
  return label;
}

function closeConflictModal() {
  document.getElementById('importConflictModal').classList.add('modal-overlay--hidden');
  pendingImportData = null;
}

function confirmApplyImportWithConflicts() {
  if (!pendingImportData) return;
  const { incomingSets, incomingVars, conflicts } = pendingImportData;

  const choices = {};
  conflicts.forEach((c, idx) => {
    const selected = document.querySelector(`input[name="conflict_choice_${idx}"]:checked`);
    choices[`${c.type}_${c.key}`] = selected ? selected.value : 'overwrite';
  });

  applyImportData(incomingSets, incomingVars, choices);
  closeConflictModal();
  showToast('Settings imported & merged successfully!');
}

function applyImportData(incomingSets, incomingVars, choices = {}) {
  // Merge Command Sets
  Object.entries(incomingSets).forEach(([appKey, appObj]) => {
    const choiceKey = `app_${appKey}`;
    const choice = choices[choiceKey] || 'overwrite';

    if (!commandSets[appKey]) {
      commandSets[appKey] = appObj;
    } else if (choice === 'overwrite') {
      commandSets[appKey] = appObj;
    } else if (choice === 'keep_both') {
      let newKey = `${appKey}_IMPORTED`;
      let counter = 1;
      while (commandSets[newKey]) {
        newKey = `${appKey}_IMPORTED_${counter++}`;
      }
      const renamedObj = JSON.parse(JSON.stringify(appObj));
      renamedObj.name = `${renamedObj.name || appKey} (Imported)`;
      commandSets[newKey] = renamedObj;
    }
  });

  // Merge Variables
  incomingVars.forEach((v) => {
    const choiceKey = `var_${v.key}`;
    const choice = choices[choiceKey] || 'overwrite';
    const existingIdx = variables.findIndex((item) => item.key.toLowerCase() === v.key.toLowerCase());

    if (existingIdx === -1) {
      variables.push(v);
    } else if (choice === 'overwrite') {
      variables[existingIdx] = v;
    } else if (choice === 'keep_both') {
      let newKey = `${v.key}_imported`;
      let counter = 1;
      while (variables.some((item) => item.key.toLowerCase() === newKey.toLowerCase())) {
        newKey = `${v.key}_imported_${counter++}`;
      }
      variables.push({
        key: newKey,
        label: `${v.label || v.key} (Imported)`,
        description: v.description || '',
      });
    }
  });

  persistCommandSets();
  persistVariables();

  renderEditorNav();
  renderEditorProcs();
  renderEditorSubmodes();
  renderEditorGroups();
  renderVariablesManager();
}

// =========================================================
// Sidebar: List of Applications (Command Sets)
// =========================================================

function getUsedProcessMap(excludeAppKey = null) {
  const map = new Map();
  Object.entries(commandSets).forEach(([appKey, appObj]) => {
    if (excludeAppKey && appKey === excludeAppKey) return;
    const procs = [];
    if (appObj.process) procs.push(appObj.process);
    if (Array.isArray(appObj.processes)) procs.push(...appObj.processes);

    procs.forEach((p) => {
      if (p) map.set(p.toLowerCase(), { appKey, appName: appObj.name || appKey });
    });
  });
  return map;
}

function renderEditorNav() {
  const list = document.getElementById('editorModeList');
  if (!list) return;
  list.innerHTML = '';

  const appKeys = Object.keys(commandSets);
  if (appKeys.length === 0) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:10px;padding:6px;">No command sets</div>';
    return;
  }

  if (!editorActiveApp || !commandSets[editorActiveApp]) {
    editorActiveApp = appKeys[0];
  }

  Object.entries(commandSets).forEach(([appKey, appObj]) => {
    const item = document.createElement('div');
    item.className = 'editor-mode-item' + (appKey === editorActiveApp ? ' editor-mode-item--active' : '');

    const label = document.createElement('span');
    label.className = 'editor-mode-item-title';
    label.textContent = appObj.name || appKey;
    item.appendChild(label);

    const del = document.createElement('span');
    del.className = 'editor-mode-item-del';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.title = 'Delete this command set';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCommandSet(appKey);
    });
    item.appendChild(del);

    item.addEventListener('click', () => {
      editorActiveApp = appKey;
      const app = commandSets[appKey];
      if (app && app.submodes) {
        editorActiveSubmode = Object.keys(app.submodes)[0] || 'DEFAULT';
      }
      renderEditorNav();
      renderEditorProcs();
      renderEditorSubmodes();
      renderEditorGroups();
    });

    list.appendChild(item);
  });
}

function deleteCommandSet(appKey) {
  const appObj = commandSets[appKey];
  const name = appObj ? appObj.name || appKey : appKey;
  if (!confirm(`Delete "${name}" and all its sub-modes and commands? This cannot be undone.`)) {
    return;
  }

  delete commandSets[appKey];
  const remainingKeys = Object.keys(commandSets);
  if (editorActiveApp === appKey) {
    editorActiveApp = remainingKeys[0] || null;
    if (editorActiveApp && commandSets[editorActiveApp]) {
      editorActiveSubmode = Object.keys(commandSets[editorActiveApp].submodes || {})[0] || null;
    }
  }

  persistCommandSets();
  renderEditorNav();
  renderEditorProcs();
  renderEditorSubmodes();
  renderEditorGroups();
}

// =========================================================
// Program Management per Command Set
// =========================================================

function getAppProcesses(app) {
  if (!app) return [];
  const list = [];
  if (Array.isArray(app.processes)) {
    list.push(...app.processes);
  } else if (app.process) {
    list.push(app.process);
  }
  return [...new Set(list.filter(Boolean))];
}

function renderEditorProcs() {
  const container = document.getElementById('editorProcsList');
  if (!container) return;
  container.innerHTML = '';

  const app = commandSets[editorActiveApp];
  if (!app) return;

  const procs = getAppProcesses(app);

  if (procs.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.style.color = 'var(--text-dim)';
    emptySpan.style.fontSize = '9.5px';
    emptySpan.textContent = 'None (click + Add Program)';
    container.appendChild(emptySpan);
    return;
  }

  procs.forEach((procName) => {
    const pill = document.createElement('div');
    pill.className = 'editor-proc-pill';

    const label = document.createElement('span');
    label.textContent = procName;
    pill.appendChild(label);

    const del = document.createElement('span');
    del.className = 'editor-proc-del';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.title = `Remove ${procName} from this set`;
    del.addEventListener('click', () => {
      removeProcFromSet(procName);
    });
    pill.appendChild(del);

    container.appendChild(pill);
  });
}

function removeProcFromSet(procName) {
  const app = commandSets[editorActiveApp];
  if (!app) return;

  let procs = getAppProcesses(app);
  procs = procs.filter((p) => p.toLowerCase() !== procName.toLowerCase());

  app.processes = procs;
  app.process = procs[0] || '';

  persistCommandSets();
  renderEditorProcs();
}

function initAddProcModal() {
  document.getElementById('addProcCancel')?.addEventListener('click', closeAddProcModal);
  document.getElementById('addProcConfirm')?.addEventListener('click', confirmAddProcToSet);
}

async function openAddProcModal() {
  if (!editorActiveApp || !commandSets[editorActiveApp]) {
    showToast('Please create or select a Command Set first');
    openNewSetModal();
    return;
  }
  const app = commandSets[editorActiveApp];

  const select = document.getElementById('addProcSelect');
  select.innerHTML = '<option value="">-- Loading running applications… --</option>';

  document.getElementById('addProcModal').classList.remove('modal-overlay--hidden');

  let runningApps = [];
  try {
    runningApps = await window.feMacro.getRunningApps();
  } catch {
    runningApps = [];
  }

  select.innerHTML = '<option value="">-- Select a running program --</option>';

  const currentProcs = new Set(getAppProcesses(app).map((p) => p.toLowerCase()));
  const usedMap = getUsedProcessMap(editorActiveApp);

  runningApps.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.processName;
    opt.dataset.name = item.displayName;

    const procLower = item.processName.toLowerCase();
    const isCurrent = currentProcs.has(procLower);
    const otherUsage = usedMap.get(procLower);

    if (isCurrent) {
      opt.disabled = true;
      opt.className = 'option--disabled';
      opt.textContent = `${item.displayName} [${item.processName}] (Already in this set)`;
    } else if (otherUsage) {
      opt.disabled = true;
      opt.className = 'option--disabled';
      opt.textContent = `${item.displayName} [${item.processName}] (Assigned to ${otherUsage.appName})`;
    } else {
      opt.textContent = `${item.displayName} [${item.processName}]`;
    }

    select.appendChild(opt);
  });
}

function closeAddProcModal() {
  document.getElementById('addProcModal').classList.add('modal-overlay--hidden');
}

function confirmAddProcToSet() {
  const app = commandSets[editorActiveApp];
  if (!app) return;

  const select = document.getElementById('addProcSelect');
  const procName = select.value;
  if (!procName) {
    showToast('Please select a program');
    return;
  }

  const procs = getAppProcesses(app);
  if (!procs.some((p) => p.toLowerCase() === procName.toLowerCase())) {
    procs.push(procName);
    app.processes = procs;
    app.process = procs[0] || '';
    if (!app.keywords) app.keywords = [];
    const baseKey = procName.replace(/\.exe$/i, '').toUpperCase();
    if (!app.keywords.includes(baseKey)) app.keywords.push(baseKey);
  }

  persistCommandSets();
  closeAddProcModal();
  renderEditorProcs();
}

// =========================================================
// Sub-mode Management
// =========================================================

function renderEditorSubmodes() {
  const container = document.getElementById('editorSubmodeList');
  if (!container) return;
  container.innerHTML = '';

  const app = commandSets[editorActiveApp];
  if (!app || !app.submodes) return;

  const subKeys = Object.keys(app.submodes);
  if (!editorActiveSubmode || !app.submodes[editorActiveSubmode]) {
    editorActiveSubmode = subKeys[0] || 'DEFAULT';
  }

  subKeys.forEach((subKey) => {
    const subObj = app.submodes[subKey];
    const pill = document.createElement('div');
    pill.className = 'editor-submode-pill' + (subKey === editorActiveSubmode ? ' editor-submode-pill--active' : '');

    const label = document.createElement('span');
    label.textContent = subObj.name || subKey;
    pill.appendChild(label);

    if (subKeys.length > 1) {
      const del = document.createElement('span');
      del.className = 'editor-submode-del';
      del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      del.title = 'Delete sub-mode';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSubmode(subKey);
      });
      pill.appendChild(del);
    }

    pill.addEventListener('click', () => {
      editorActiveSubmode = subKey;
      renderEditorSubmodes();
      renderEditorGroups();
    });

    container.appendChild(pill);
  });
}

function initNewSubmodeModal() {
  document.getElementById('nsubCancel')?.addEventListener('click', closeNewSubmodeModal);
  document.getElementById('nsubCreate')?.addEventListener('click', confirmCreateSubmode);
  document.getElementById('nsubName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmCreateSubmode();
  });
}

function openNewSubmodeModal() {
  if (!editorActiveApp || !commandSets[editorActiveApp]) {
    showToast('Please create or select a Command Set first');
    openNewSetModal();
    return;
  }
  const input = document.getElementById('nsubName');
  input.value = '';
  document.getElementById('newSubmodeModal').classList.remove('modal-overlay--hidden');
  input.focus();
}

function closeNewSubmodeModal() {
  document.getElementById('newSubmodeModal').classList.add('modal-overlay--hidden');
}

function confirmCreateSubmode() {
  const app = commandSets[editorActiveApp];
  if (!app) return;

  const nameInput = document.getElementById('nsubName').value.trim();
  if (!nameInput) {
    showToast('Please enter a sub-mode name');
    return;
  }

  const key = nameInput.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  if (!app.submodes) app.submodes = {};
  if (app.submodes[key]) {
    showToast(`A sub-mode with key "${key}" already exists`);
    return;
  }

  app.submodes[key] = {
    name: nameInput,
    groups: {},
  };

  editorActiveSubmode = key;
  persistCommandSets();
  closeNewSubmodeModal();
  renderEditorSubmodes();
  renderEditorGroups();
}

function deleteSubmode(subKey) {
  const app = commandSets[editorActiveApp];
  if (!app || !app.submodes) return;

  const subKeys = Object.keys(app.submodes);
  if (subKeys.length <= 1) {
    showToast('Cannot delete the only sub-mode');
    return;
  }

  if (!confirm(`Delete sub-mode "${app.submodes[subKey].name || subKey}" and all its commands?`)) return;

  delete app.submodes[subKey];
  const remaining = Object.keys(app.submodes);
  if (editorActiveSubmode === subKey) {
    editorActiveSubmode = remaining[0];
  }

  persistCommandSets();
  renderEditorSubmodes();
  renderEditorGroups();
}

// =========================================================
// Main Panel: Groups + Command Rows (with Drag & Drop)
// =========================================================

function createGripLinesIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cmd-grip-icon');
  svg.setAttribute('viewBox', '0 0 448 512');
  svg.innerHTML = '<path fill="currentColor" d="M32 288c-17.7 0-32 14.3-32 32s14.3 32 32 32l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 288zm0-128c-17.7 0-32 14.3-32 32s14.3 32 32 32l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 160z"/>';
  return svg;
}

function clearAllDragIndicators() {
  document.querySelectorAll('.editor-cmd-row--drag-over-top, .editor-cmd-row--drag-over-bottom, .editor-cmd-row--dragging').forEach((el) => {
    el.classList.remove('editor-cmd-row--drag-over-top', 'editor-cmd-row--drag-over-bottom', 'editor-cmd-row--dragging');
  });
  document.querySelectorAll('.editor-group-block--drag-over').forEach((el) => {
    el.classList.remove('editor-group-block--drag-over');
  });
}

function moveCommandItem(fromInfo, toGroup, toIndex) {
  const { appKey, submodeKey, fromGroup, fromIndex } = fromInfo;
  const subObj = commandSets[appKey]?.submodes?.[submodeKey];
  if (!subObj || !subObj.groups) return;

  const sourceList = subObj.groups[fromGroup];
  const targetList = subObj.groups[toGroup];
  if (!sourceList || !targetList) return;

  const [item] = sourceList.splice(fromIndex, 1);
  if (!item) return;

  let adjustedIndex = toIndex;
  if (fromGroup === toGroup && fromIndex < toIndex) {
    adjustedIndex = Math.max(0, adjustedIndex - 1);
  }

  targetList.splice(adjustedIndex, 0, item);

  persistCommandSets();
  renderEditorGroups();
}

function renderEditorGroups() {
  const container = document.getElementById('editorGroups');
  if (!container) return;
  container.innerHTML = '';

  const procsBar = document.getElementById('editorProcsBar');
  const submodeBar = document.getElementById('editorSubmodeBar');
  const headerBar = document.querySelector('.editor-main-header');

  const appKey = editorActiveApp;
  const app = commandSets[appKey];
  if (!app || !app.submodes) {
    if (procsBar) procsBar.style.display = 'none';
    if (submodeBar) submodeBar.style.display = 'none';
    if (headerBar) headerBar.style.display = 'none';

    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.cssText = 'padding: 60px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;';
    empty.innerHTML = `
      <i class="fa-solid fa-layer-group" style="font-size: 38px; color: var(--text-dim); margin-bottom: 4px;"></i>
      <h3 style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0;">No Command Sets Configured</h3>
      <p style="font-size: 11.5px; color: var(--text-muted); max-width: 380px; margin: 0; line-height: 1.5;">
        Get started by creating your first command set for your programs (e.g. Remote Desktop, PuTTY, LINE, CMD), or import an existing settings file.
      </p>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button class="btn btn--primary" id="btnEmptyCreateSet"><i class="fa-solid fa-plus"></i> Create First Command Set</button>
        <button class="btn btn--ghost" id="btnEmptyImportSet"><i class="fa-solid fa-arrow-down-to-line"></i> Import Settings</button>
      </div>
    `;

    empty.querySelector('#btnEmptyCreateSet')?.addEventListener('click', openNewSetModal);
    empty.querySelector('#btnEmptyImportSet')?.addEventListener('click', handleImportConfig);

    container.appendChild(empty);
    return;
  }

  if (procsBar) procsBar.style.display = 'flex';
  if (submodeBar) submodeBar.style.display = 'flex';
  if (headerBar) headerBar.style.display = 'flex';

  const subKeys = Object.keys(app.submodes);
  if (!editorActiveSubmode || !app.submodes[editorActiveSubmode]) {
    editorActiveSubmode = subKeys[0] || 'DEFAULT';
  }

  const subKey = editorActiveSubmode;
  const subObj = app.submodes[subKey];
  if (!subObj) return;

  const groups = subObj.groups || {};

  if (Object.keys(groups).length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = `No groups in "${app.name || appKey}" (${subObj.name || subKey}). Enter a group name above and click "+ Group" to start.`;
    container.appendChild(empty);
    return;
  }

  Object.entries(groups).forEach(([groupTitle, commands]) => {
    const block = document.createElement('div');
    block.className = 'editor-group-block';

    const header = document.createElement('div');
    header.className = 'editor-group-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'editor-group-header-title';
    titleEl.textContent = groupTitle;
    header.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'editor-group-header-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn--icon';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = 'Delete group';
    delBtn.addEventListener('click', () => deleteGroup(groupTitle));
    actions.appendChild(delBtn);

    header.appendChild(actions);
    block.appendChild(header);

    block.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedCmdInfo) {
        e.dataTransfer.dropEffect = 'move';
        block.classList.add('editor-group-block--drag-over');
      }
    });

    block.addEventListener('dragleave', (e) => {
      if (!block.contains(e.relatedTarget)) {
        block.classList.remove('editor-group-block--drag-over');
      }
    });

    block.addEventListener('drop', (e) => {
      if (e.target.closest('.editor-cmd-row')) return;
      e.preventDefault();
      block.classList.remove('editor-group-block--drag-over');
      if (draggedCmdInfo) {
        const targetList = subObj.groups[groupTitle] || [];
        moveCommandItem(draggedCmdInfo, groupTitle, targetList.length);
        draggedCmdInfo = null;
      }
    });

    (commands || []).forEach((cmd, index) => {
      const row = document.createElement('div');
      row.className = 'editor-cmd-row';
      row.draggable = true;

      const dragHandle = document.createElement('span');
      dragHandle.className = 'cmd-drag-handle';
      dragHandle.title = 'Drag to reorder or move to another group';
      dragHandle.appendChild(createGripLinesIcon());
      row.appendChild(dragHandle);

      const label = document.createElement('span');
      label.className = 'editor-cmd-row-label';
      label.textContent = cmd.label;
      row.appendChild(label);

      if (cmd.autoFocus !== false) {
        const afTag = document.createElement('span');
        afTag.className = 'editor-cmd-row-tag editor-cmd-row-tag--focus';
        afTag.textContent = 'autofocus';
        row.appendChild(afTag);
      }

      if (cmd.popup === 'full') {
        const tag = document.createElement('span');
        tag.className = 'editor-cmd-row-tag';
        tag.textContent = 'confirm';
        row.appendChild(tag);
      }

      row.addEventListener('dragstart', (e) => {
        draggedCmdInfo = {
          appKey,
          submodeKey: subKey,
          fromGroup: groupTitle,
          fromIndex: index,
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(draggedCmdInfo));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => row.classList.add('editor-cmd-row--dragging'), 0);
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('editor-cmd-row--dragging');
        clearAllDragIndicators();
        draggedCmdInfo = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedCmdInfo) return;
        e.dataTransfer.dropEffect = 'move';

        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isTop = e.clientY < midY;

        row.classList.toggle('editor-cmd-row--drag-over-top', isTop);
        row.classList.toggle('editor-cmd-row--drag-over-bottom', !isTop);
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('editor-cmd-row--drag-over-top', 'editor-cmd-row--drag-over-bottom');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove('editor-cmd-row--drag-over-top', 'editor-cmd-row--drag-over-bottom');

        if (!draggedCmdInfo) return;

        const rect = row.getBoundingClientRect();
        const isTop = e.clientY < (rect.top + rect.height / 2);
        const targetIndex = isTop ? index : index + 1;

        moveCommandItem(draggedCmdInfo, groupTitle, targetIndex);
        draggedCmdInfo = null;
      });

      row.addEventListener('click', (e) => {
        if (e.target.closest('.cmd-drag-handle')) return;
        openCommandForm(appKey, subKey, groupTitle, index);
      });

      block.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'editor-add-cmd';
    addRow.innerHTML = '<i class="fa-solid fa-plus"></i> Add command';
    addRow.addEventListener('click', () => openCommandForm(appKey, subKey, groupTitle, null));
    block.appendChild(addRow);

    container.appendChild(block);
  });
}

function addNewGroup() {
  if (!editorActiveApp || !commandSets[editorActiveApp]) {
    showToast('Please create or select a Command Set first');
    openNewSetModal();
    return;
  }
  const appKey = editorActiveApp;
  const app = commandSets[appKey];

  const subKey = editorActiveSubmode || Object.keys(app.submodes)[0];
  const subObj = app.submodes[subKey];
  if (!subObj) return;

  const input = document.getElementById('editorGroupTitle');
  const title = input.value.trim();
  if (!title) {
    showToast('Enter a group title');
    return;
  }

  if (!subObj.groups) subObj.groups = {};
  if (subObj.groups[title]) {
    showToast('A group with that name already exists in this sub-mode');
    return;
  }

  subObj.groups[title] = [];
  input.value = '';
  persistCommandSets();
  renderEditorGroups();
}

function deleteGroup(groupTitle) {
  const appKey = editorActiveApp;
  const app = commandSets[appKey];
  if (!app) return;

  const subKey = editorActiveSubmode;
  const subObj = app.submodes[subKey];
  if (!subObj || !subObj.groups) return;

  if (!confirm(`Delete group "${groupTitle}" and all its commands?`)) return;

  delete subObj.groups[groupTitle];
  persistCommandSets();
  renderEditorGroups();
}

// =========================================================
// Modal: Add New Command Set
// =========================================================

function initNewSetModal() {
  document.getElementById('nsCancel')?.addEventListener('click', closeNewSetModal);
  document.getElementById('nsCreate')?.addEventListener('click', createNewSet);

  document.getElementById('nsAppName')?.addEventListener('input', () => {
    nsAutoNameTracking = false;
  });
}

async function openNewSetModal() {
  const container = document.getElementById('nsRunningAppsContainer');
  container.innerHTML = '<div style="color:var(--text-dim);font-size:10px;padding:6px;">Loading running applications…</div>';

  document.getElementById('newSetModal').classList.remove('modal-overlay--hidden');
  document.getElementById('nsAppName').value = '';
  document.getElementById('nsSubmodes').value = '';
  nsAutoNameTracking = true;

  let runningApps = [];
  try {
    runningApps = await window.feMacro.getRunningApps();
  } catch {
    runningApps = [];
  }

  container.innerHTML = '';
  const usedMap = getUsedProcessMap();

  if (runningApps.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:10px;padding:6px;">No running applications detected. You can type a custom name below.</div>';
    return;
  }

  runningApps.forEach((item) => {
    const row = document.createElement('label');
    const procLower = item.processName.toLowerCase();
    const otherUsage = usedMap.get(procLower);
    const isDisabled = Boolean(otherUsage);

    row.className = 'ns-app-item' + (isDisabled ? ' ns-app-item--disabled' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'ns-app-item-check';
    checkbox.value = item.processName;
    checkbox.dataset.name = item.displayName;
    checkbox.dataset.key = item.processKey;
    checkbox.disabled = isDisabled;

    row.appendChild(checkbox);

    const info = document.createElement('div');
    info.className = 'ns-app-item-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ns-app-item-name';
    nameSpan.textContent = item.displayName;
    info.appendChild(nameSpan);

    const procSpan = document.createElement('span');
    procSpan.className = 'ns-app-item-proc';
    procSpan.textContent = item.processName;
    info.appendChild(procSpan);

    row.appendChild(info);

    if (otherUsage) {
      const badge = document.createElement('span');
      badge.className = 'ns-app-item-badge';
      badge.textContent = `In ${otherUsage.appName}`;
      row.appendChild(badge);
    } else {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          row.classList.add('ns-app-item--selected');
        } else {
          row.classList.remove('ns-app-item--selected');
        }
        updateAutoName();
      });
    }

    container.appendChild(row);
  });
}

function updateAutoName() {
  if (!nsAutoNameTracking) return;
  const checkedBoxes = Array.from(document.querySelectorAll('#nsRunningAppsContainer .ns-app-item-check:checked'));
  const names = checkedBoxes.map((cb) => cb.dataset.name || cb.value);
  document.getElementById('nsAppName').value = names.join(' + ');
}

function closeNewSetModal() {
  document.getElementById('newSetModal').classList.add('modal-overlay--hidden');
}

function createNewSet() {
  const checkedBoxes = Array.from(document.querySelectorAll('#nsRunningAppsContainer .ns-app-item-check:checked'));
  const selectedProcs = checkedBoxes.map((cb) => cb.value);
  const nameInput = document.getElementById('nsAppName').value.trim();
  const submodesInput = document.getElementById('nsSubmodes').value.trim();

  if (!nameInput && selectedProcs.length === 0) {
    showToast('Please select at least one program or enter a Display Name');
    return;
  }

  const appName = nameInput || selectedProcs.join(' + ');
  const baseKey = (selectedProcs[0] || nameInput).toUpperCase().replace(/\.EXE$/i, '').replace(/[^A-Z0-9_]/g, '_');
  let appKey = baseKey;
  let counter = 1;
  while (commandSets[appKey]) {
    appKey = `${baseKey}_${counter++}`;
  }

  const submodes = {};
  if (submodesInput) {
    const parts = submodesInput.split(',').map((p) => p.trim()).filter(Boolean);
    parts.forEach((p) => {
      const subKey = p.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      submodes[subKey] = {
        name: p,
        groups: {},
      };
    });
  }

  if (Object.keys(submodes).length === 0) {
    submodes.DEFAULT = {
      name: 'Default',
      groups: {},
    };
  }

  const keywords = [appKey, appName.toUpperCase()];
  selectedProcs.forEach((p) => {
    const k = p.replace(/\.EXE$/i, '').toUpperCase();
    if (!keywords.includes(k)) keywords.push(k);
  });

  const newApp = {
    name: appName,
    process: selectedProcs[0] || '',
    processes: selectedProcs,
    keywords,
    submodes,
  };

  commandSets[appKey] = newApp;
  editorActiveApp = appKey;
  editorActiveSubmode = Object.keys(submodes)[0];

  persistCommandSets();
  closeNewSetModal();
  renderEditorNav();
  renderEditorProcs();
  renderEditorSubmodes();
  renderEditorGroups();
}

// =========================================================
// Command Form Modal
// =========================================================

function initCommandFormModal() {
  document.getElementById('cfCancel')?.addEventListener('click', closeCommandForm);
  document.getElementById('cfSave')?.addEventListener('click', saveCommandForm);
  document.getElementById('cfDelete')?.addEventListener('click', deleteCommandForm);
  document.getElementById('cfTemplate')?.addEventListener('input', updateTokenHint);
}

function openCommandForm(appKey, submodeKey, groupTitle, index) {
  editingCommand = { appKey, submodeKey, groupTitle, index };

  const isNew = index === null;
  const subObj = commandSets[appKey].submodes[submodeKey];
  const cmd = isNew ? { label: '', template: '', popup: null, autoFocus: true } : subObj.groups[groupTitle][index];

  document.getElementById('commandFormTitle').textContent = isNew ? 'New command' : 'Edit command';
  document.getElementById('cfLabel').value = cmd.label || '';
  document.getElementById('cfTemplate').value = cmd.template || '';
  document.getElementById('cfAutoFocus').checked = cmd.autoFocus !== false;
  document.getElementById('cfPopup').checked = cmd.popup === 'full';
  document.getElementById('cfDelete').style.display = isNew ? 'none' : 'inline-flex';

  updateTokenHint();
  document.getElementById('commandFormModal').classList.remove('modal-overlay--hidden');
  document.getElementById('cfLabel').focus();
}

function closeCommandForm() {
  document.getElementById('commandFormModal').classList.add('modal-overlay--hidden');
  editingCommand = null;
}

function getAllAvailableTokens() {
  const vars = Array.isArray(variables) ? variables : [];
  return vars.map((v) => v.key);
}

function updateTokenHint() {
  const textarea = document.getElementById('cfTemplate');
  const template = textarea.value;
  const hintEl = document.getElementById('cfTokenHint');
  const found = [...template.matchAll(/\{(.*?)\}/g)].map((m) => m[1]);

  const availableTokens = getAllAvailableTokens();
  const known = new Set(availableTokens);

  const isTokenValid = (t) => known.has(t);

  if (found.length === 0) {
    hintEl.innerHTML = `Available tokens (click to insert): ${availableTokens.map((t) => `<span class="token-chip" data-token="{${t}}">{${t}}</span>`).join('')}`;
  } else {
    const unknown = found.filter((t) => !isTokenValid(t));
    if (unknown.length > 0) {
      hintEl.innerHTML = `⚠ Unrecognized token(s): ${unknown.map((t) => `<span class="token-chip">{${t}}</span>`).join('')}`;
    } else {
      hintEl.innerHTML = `Using: ${found.map((t) => `<span class="token-chip">{${t}}</span>`).join('')} | Available: ${availableTokens.map((t) => `<span class="token-chip" data-token="{${t}}">{${t}}</span>`).join('')}`;
    }
  }

  hintEl.querySelectorAll('.token-chip[data-token]').forEach((chip) => {
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const token = chip.getAttribute('data-token');
      const start = textarea.selectionStart || textarea.value.length;
      const end = textarea.selectionEnd || textarea.value.length;
      const val = textarea.value;
      textarea.value = val.substring(0, start) + token + val.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
      textarea.focus();
      updateTokenHint();
    });
  });
}

function saveCommandForm() {
  if (!editingCommand) return;
  const { appKey, submodeKey, groupTitle, index } = editingCommand;

  const label = document.getElementById('cfLabel').value.trim();
  const template = document.getElementById('cfTemplate').value;
  const autoFocus = document.getElementById('cfAutoFocus').checked;
  const popup = document.getElementById('cfPopup').checked ? 'full' : null;

  if (!label) {
    showToast('Enter a button label');
    return;
  }
  if (!template) {
    showToast('Enter a command template');
    return;
  }

  const newCmd = { label, template, popup, autoFocus };
  const subObj = commandSets[appKey].submodes[submodeKey];
  const groupArr = subObj.groups[groupTitle];

  if (index === null) {
    groupArr.push(newCmd);
  } else {
    groupArr[index] = newCmd;
  }

  persistCommandSets();
  closeCommandForm();
  renderEditorGroups();
}

function deleteCommandForm() {
  if (!editingCommand || editingCommand.index === null) return;
  const { appKey, submodeKey, groupTitle, index } = editingCommand;

  if (!confirm('Delete this command?')) return;

  const subObj = commandSets[appKey].submodes[submodeKey];
  subObj.groups[groupTitle].splice(index, 1);

  persistCommandSets();
  closeCommandForm();
  renderEditorGroups();
}

// =========================================================
// Variables Manager
// =========================================================

function getVariableUsageMap() {
  const usageMap = new Map();
  const vars = Array.isArray(variables) ? variables : [];
  vars.forEach((v) => usageMap.set(v.key, new Set()));

  Object.entries(commandSets).forEach(([appKey, appObj]) => {
    const appName = appObj.name || appKey;
    Object.entries(appObj.submodes || {}).forEach(([subKey, subObj]) => {
      const subName = subObj.name || subKey;
      Object.values(subObj.groups || {}).forEach((cmdList) => {
        (cmdList || []).forEach((cmd) => {
          const tmpl = cmd.template || '';
          vars.forEach((v) => {
            if (tmpl.includes(`{${v.key}`) || tmpl.includes(`{${v.key}+`) || tmpl.includes(`{${v.key}:`)) {
              usageMap.get(v.key)?.add(`${appName} (${subName})`);
            }
          });
        });
      });
    });
  });

  return usageMap;
}

function renderVariablesManager() {
  const container = document.getElementById('varListContainer');
  if (!container) return;
  container.innerHTML = '';

  const vars = Array.isArray(variables) ? variables : [];
  const usageMap = getVariableUsageMap();

  let filtered = vars;
  if (varSearchQuery) {
    filtered = vars.filter((v) =>
      v.key.toLowerCase().includes(varSearchQuery) ||
      (v.label && v.label.toLowerCase().includes(varSearchQuery)) ||
      (v.description && v.description.toLowerCase().includes(varSearchQuery))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim);font-size:11px;grid-column:1/-1;text-align:center;padding:32px;">${varSearchQuery ? 'No matching variables found.' : 'No variables defined. Click "+ Add Variable" above to create one.'}</div>`;
    return;
  }

  filtered.forEach((v) => {
    const originalIndex = variables.findIndex((item) => item.key === v.key);
    const card = document.createElement('div');
    card.className = 'var-card';
    if (v.hidden) card.style.outline = '1px solid var(--signal, #5eead4)';

    const header = document.createElement('div');
    header.className = 'var-card-header';

    const keySpan = document.createElement('span');
    keySpan.className = 'var-card-key';
    keySpan.textContent = `{${v.key}}`;
    header.appendChild(keySpan);

    const actions = document.createElement('div');
    actions.className = 'var-card-actions';
    actions.style.cssText = 'display:flex;gap:4px;align-items:center;';

    // Data type badge
    if (v.dataType) {
      const dtBadge = document.createElement('span');
      dtBadge.textContent = v.dataType;
      dtBadge.style.cssText = 'font-size:9px;opacity:0.75;padding:1px 4px;border-radius:3px;background:var(--bg-surface);border:1px solid var(--border-subtle);';
      actions.appendChild(dtBadge);
    }

    // Formula badge
    if (v.formula) {
      const fBadge = document.createElement('span');
      fBadge.innerHTML = '<i class="fa-solid fa-calculator" style="margin-right:3px;"></i> formula';
      fBadge.style.cssText = 'font-size:9px;color:var(--signal, #5eead4);padding:1px 4px;border-radius:3px;background:rgba(94,234,212,0.1);display:inline-flex;align-items:center;';
      fBadge.title = v.formula;
      actions.appendChild(fBadge);
    }

    // System badge
    if (v.system) {
      const sysBadge = document.createElement('span');
      sysBadge.innerHTML = v.formula ? '<i class="fa-solid fa-gear" style="margin-right:2px;"></i> auto' : '<i class="fa-solid fa-gear" style="margin-right:2px;"></i> const';
      sysBadge.style.cssText = 'font-size:9px;opacity:0.6;padding:1px 4px;border-radius:3px;background:var(--bg-surface);display:inline-flex;align-items:center;';
      sysBadge.title = v.formula ? `Formula: ${v.formula}` : `Default: ${v.default_value || ''}`;
      actions.appendChild(sysBadge);
    }

    // Lock toggle button
    const lockBtn = document.createElement('button');
    lockBtn.className = 'btn btn--ghost btn--xs';
    lockBtn.title = v.locked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)';
    lockBtn.innerHTML = v.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
    lockBtn.addEventListener('click', () => {
      variables[originalIndex] = { ...variables[originalIndex], locked: !v.locked };
      persistVariables();
      renderVariablesManager();
    });
    actions.appendChild(lockBtn);

    // Hidden badge
    if (v.hidden) {
      const hidBadge = document.createElement('span');
      hidBadge.innerHTML = '<i class="fa-solid fa-key" style="color:var(--signal);font-size:11px;"></i>';
      hidBadge.title = 'Hidden — admin password required to edit';
      hidBadge.style.cssText = 'display:inline-flex;align-items:center;';
      actions.appendChild(hidBadge);
    }

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--ghost btn--xs';
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit';
    editBtn.addEventListener('click', () => {
      if (v.hidden) {
        requireAdminPassword('Edit Hidden Variable', () => openVariableForm(originalIndex));
      } else {
        openVariableForm(originalIndex);
      }
    });
    actions.appendChild(editBtn);

    header.appendChild(actions);
    card.appendChild(header);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'var-card-label';
    labelSpan.textContent = v.label || v.key;
    if (v.hidden) labelSpan.innerHTML += ' <i class="fa-solid fa-key" style="font-size:11px;color:var(--signal);margin-left:3px;"></i>';
    if (v.locked) labelSpan.innerHTML += ' <i class="fa-solid fa-lock" style="font-size:11px;color:var(--text-dim);margin-left:3px;"></i>';
    card.appendChild(labelSpan);

    if (v.description) {
      const descSpan = document.createElement('span');
      descSpan.className = 'var-card-desc';
      descSpan.textContent = v.description;
      card.appendChild(descSpan);
    }

    if (v.default_value) {
      const defSpan = document.createElement('span');
      defSpan.className = 'var-card-desc';
      defSpan.style.color = 'var(--text-dim)';
      defSpan.textContent = v.hidden ? 'Default: ••••••••' : `Default: ${v.default_value}`;
      card.appendChild(defSpan);
    }

    const usages = usageMap.get(v.key);
    const usageSpan = document.createElement('span');
    usageSpan.className = 'var-card-desc';
    usageSpan.style.color = 'var(--text-muted)';
    usageSpan.style.marginTop = '2px';
    if (usages && usages.size > 0) {
      usageSpan.textContent = `Used in: ${Array.from(usages).slice(0, 3).join(', ')}${usages.size > 3 ? ` (+${usages.size - 3} more)` : ''}`;
    } else {
      usageSpan.textContent = 'Not used in any command';
      usageSpan.style.color = 'var(--text-dim)';
    }
    card.appendChild(usageSpan);

    container.appendChild(card);
  });
}

function initVariableFormModal() {
  document.getElementById('vfCancel')?.addEventListener('click', closeVariableForm);
  document.getElementById('vfSave')?.addEventListener('click', saveVariableForm);
  document.getElementById('vfDelete')?.addEventListener('click', deleteVariableForm);

  // Open Formula Studio button handler
  document.getElementById('vfOpenStudio')?.addEventListener('click', openFormulaStudio);
}

function openNewVariableModal() {
  openVariableForm(null);
}

function openVariableForm(index) {
  editingVarIndex = index;
  const isNew = index === null;
  const v = isNew
    ? { key: '', label: '', description: '', default_value: '', dataType: 'String', formula: '', locked: false, hidden: false }
    : variables[index];

  document.getElementById('varFormTitle').textContent = isNew ? 'Add Variable' : 'Edit Variable';
  const keyInput = document.getElementById('vfKey');
  keyInput.value = v.key || '';
  keyInput.disabled = !isNew;

  document.getElementById('vfLabel').value = v.label || '';
  document.getElementById('vfDescription').value = v.description || '';
  document.getElementById('vfDefaultValue').value = v.default_value || '';
  document.getElementById('vfDataType').value = v.dataType || 'String';
  document.getElementById('vfFormula').value = v.formula || '';
  document.getElementById('vfLocked').checked = Boolean(v.locked);
  document.getElementById('vfHidden').checked = Boolean(v.hidden);
  document.getElementById('vfDelete').style.display = isNew ? 'none' : 'inline-flex';

  // Show dependency info if other variables depend on this variable
  const depInfo = document.getElementById('vfDependencyInfo');
  if (depInfo) {
    if (!isNew && v.key) {
      const dependents = variables.filter((other) => {
        if (other.key === v.key || !other.formula) return false;
        const deps = extractReferencedVariables(other.formula, other.key);
        return deps.includes(v.key);
      });

      if (dependents.length > 0) {
        depInfo.style.display = 'block';
        depInfo.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;margin-right:4px;"></i> <strong>${dependents.length} variable(s)</strong> depend on this: ${dependents.map((d) => `<code>{${d.key}}</code>`).join(', ')}`;
      } else {
        depInfo.style.display = 'none';
      }
    } else {
      depInfo.style.display = 'none';
    }
  }

  document.getElementById('varFormModal').classList.remove('modal-overlay--hidden');
  if (isNew) keyInput.focus();
  else document.getElementById('vfLabel').focus();
}

function closeVariableForm() {
  document.getElementById('varFormModal').classList.add('modal-overlay--hidden');
  editingVarIndex = null;
}

function saveVariableForm() {
  const rawKey = document.getElementById('vfKey').value.trim();
  const label = document.getElementById('vfLabel').value.trim();
  const description = document.getElementById('vfDescription').value.trim();
  const default_value = document.getElementById('vfDefaultValue').value.trim();
  const dataType = document.getElementById('vfDataType').value || 'String';
  const formula = document.getElementById('vfFormula').value.trim();
  const locked = document.getElementById('vfLocked').checked;
  const hidden = document.getElementById('vfHidden').checked;

  if (!rawKey) { showToast('Variable key is required'); return; }
  const key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!label) { showToast('Field label is required'); return; }

  // Strict validation on formula if present
  if (formula) {
    try {
      parseFormula(formula, key);
    } catch (err) {
      showToast(`Formula syntax error: ${err.message}`);
      return;
    }

    // Circular Dependency check
    const cycleRes = detectCircularDependency(variables, { key, formula });
    if (cycleRes.hasCycle) {
      showToast(cycleRes.message);
      return;
    }
  }

  const isNew = editingVarIndex === null;
  const wasHidden = !isNew && Boolean(variables[editingVarIndex]?.hidden);

  const doSave = () => {
    const varObj = {
      key,
      label,
      description,
      dataType,
      formula: formula || null,
      default_value: default_value || null,
      locked: Boolean(locked || hidden),
      hidden: Boolean(hidden),
    };

    if (isNew) {
      if (variables.some((v) => v.key.toLowerCase() === key)) {
        showToast(`Variable key "${key}" already exists`);
        return;
      }
      variables.push(varObj);
    } else {
      const origKey = variables[editingVarIndex].key;
      variables[editingVarIndex] = {
        ...varObj,
        key: origKey,
      };
    }

    persistVariables();
    closeVariableForm();
    renderVariablesManager();
    showToast(isNew ? `Variable "{${key}}" created!` : `Variable "{${key}}" updated!`);
  };

  // If trying to create a hidden variable or modifying an existing hidden variable, require admin password
  if (hidden || wasHidden) {
    requireAdminPassword(isNew ? 'Create Hidden Variable' : 'Save Hidden Variable', doSave);
  } else {
    doSave();
  }
}

function deleteVariableForm() {
  if (editingVarIndex === null) return;
  const v = variables[editingVarIndex];

  // Check if any other variable depends on this one
  const dependents = variables.filter((other) => {
    if (other.key === v.key || !other.formula) return false;
    const deps = extractReferencedVariables(other.formula, other.key);
    return deps.includes(v.key);
  });

  let confirmMsg = `Delete variable "{${v.key}}"?`;
  if (dependents.length > 0) {
    confirmMsg = `⚠️ Warning: ${dependents.length} variable(s) [${dependents.map((d) => d.key).join(', ')}] depend on "{${v.key}}".\n\nAre you sure you want to delete it?`;
  }

  const doDelete = () => {
    if (!confirm(confirmMsg)) return;
    variables.splice(editingVarIndex, 1);
    persistVariables();
    closeVariableForm();
    renderVariablesManager();
    showToast(`Variable "{${v.key}}" deleted`);
  };

  if (v.hidden) {
    requireAdminPassword('Delete Hidden Variable', doDelete);
  } else {
    doDelete();
  }
}

// =============================================================
// FORMULA STUDIO MODAL & INTERACTIVE TEST RUNNER
// =============================================================

let fsTargetKey = 'target_var';
let fsDataType = 'String';
let fsTestInputsState = {}; // { varKey: value }

function initFormulaStudio() {
  document.getElementById('fsCloseBtn')?.addEventListener('click', closeFormulaStudio);
  document.getElementById('fsCancelBtn')?.addEventListener('click', closeFormulaStudio);
  document.getElementById('fsApplyBtn')?.addEventListener('click', applyFormulaStudio);

  // Data Type dropdown change inside Studio
  document.getElementById('fsDataType')?.addEventListener('change', (e) => {
    fsDataType = e.target.value;
    const hintEl = document.getElementById('fsTargetHint');
    if (hintEl) hintEl.textContent = `Target: {${fsTargetKey}} [${fsDataType}]`;
    runFormulaStudioTest();
  });

  // Helper insertion chips (functions, operators, arrays)
  document.querySelectorAll('#formulaStudioModal [data-insert]').forEach((chip) => {
    chip.addEventListener('click', () => {
      insertTextIntoStudioEditor(chip.getAttribute('data-insert'));
    });
  });

  // Presets
  document.getElementById('fsPresetIpInc')?.addEventListener('click', () => {
    const code = `{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 1\n  ${fsTargetKey} = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}`;
    setStudioEditorCode(code);
  });

  document.getElementById('fsPresetOlt')?.addEventListener('click', () => {
    const code = `{\n  ${fsTargetKey} = port.split(":", 0)\n}`;
    setStudioEditorCode(code);
  });

  document.getElementById('fsPresetOnu')?.addEventListener('click', () => {
    const code = `{\n  ${fsTargetKey} = port.split(":", 1)\n}`;
    setStudioEditorCode(code);
  });

  document.getElementById('fsPresetClear')?.addEventListener('click', () => {
    const code = `{\n  ${fsTargetKey} = \n}`;
    setStudioEditorCode(code);
  });

  // Editor typing triggers live variable detection and test runner
  const editor = document.getElementById('fsCodeEditor');
  if (editor) {
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        insertTextIntoStudioEditor('  ');
      }
    });

    let typingTimer = null;
    editor.addEventListener('input', () => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        updateStudioTestInputs();
        runFormulaStudioTest();
      }, 250);
    });
  }
}

function openFormulaStudio() {
  const rawKey = document.getElementById('vfKey').value.trim();
  fsTargetKey = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'target_var';
  fsDataType = document.getElementById('vfDataType').value || 'String';
  const existingFormula = document.getElementById('vfFormula').value.trim();

  const titleEl = document.getElementById('formulaStudioTitle');
  if (titleEl) titleEl.textContent = `Formula Studio — {${fsTargetKey}}`;

  const hintEl = document.getElementById('fsTargetHint');
  if (hintEl) hintEl.textContent = `Target: {${fsTargetKey}} [${fsDataType}]`;

  const dtSelect = document.getElementById('fsDataType');
  if (dtSelect) dtSelect.value = fsDataType;

  // Render Variable Chips
  const chipsContainer = document.getElementById('fsVarChips');
  if (chipsContainer) {
    chipsContainer.innerHTML = '';
    variables.forEach((v) => {
      if (!v || !v.key || v.key === fsTargetKey) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'studio-chip studio-chip--var';
      chip.textContent = `{${v.key}}`;
      chip.title = `${v.label || v.key} (${v.dataType || 'String'})\nClick to insert`;
      chip.addEventListener('click', () => {
        insertTextIntoStudioEditor(v.key);
      });
      chipsContainer.appendChild(chip);
    });
  }

  // Initial code
  const initialCode = existingFormula || `{\n  // Enter formula assignments here\n  ${fsTargetKey} = \n}`;
  setStudioEditorCode(initialCode);

  document.getElementById('formulaStudioModal')?.classList.remove('modal-overlay--hidden');
  document.getElementById('fsCodeEditor')?.focus();
}

function closeFormulaStudio() {
  document.getElementById('formulaStudioModal')?.classList.add('modal-overlay--hidden');
}

function setStudioEditorCode(code) {
  const editor = document.getElementById('fsCodeEditor');
  if (editor) {
    editor.value = code;
  }
  updateStudioTestInputs();
  runFormulaStudioTest();
}

function insertTextIntoStudioEditor(text) {
  const editor = document.getElementById('fsCodeEditor');
  if (!editor) return;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const val = editor.value;

  editor.value = val.substring(0, start) + text + val.substring(end);
  editor.selectionStart = editor.selectionEnd = start + text.length;
  editor.focus();

  updateStudioTestInputs();
  runFormulaStudioTest();
}

function updateStudioTestInputs() {
  const editor = document.getElementById('fsCodeEditor');
  const container = document.getElementById('fsTestInputsContainer');
  if (!editor || !container) return;

  const formula = editor.value;
  const referencedVars = extractReferencedVariables(formula, fsTargetKey);

  // Preserve existing user inputs
  container.querySelectorAll('.studio-test-input').forEach((inp) => {
    const key = inp.dataset.varKey;
    if (key) fsTestInputsState[key] = inp.value;
  });

  container.innerHTML = '';

  if (referencedVars.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'color:var(--text-dim);font-size:11px;font-style:italic;padding:4px 0;';
    emptyMsg.textContent = 'No referenced variables detected yet.';
    container.appendChild(emptyMsg);
    return;
  }

  referencedVars.forEach((varKey) => {
    const vDef = variables.find((v) => v.key === varKey);
    const vType = vDef?.dataType || 'String';
    let sampleVal = fsTestInputsState[varKey];
    if (sampleVal === undefined) {
      if (vDef && vDef.default_value) {
        sampleVal = vDef.default_value;
      } else if (vType === 'IP' || varKey.includes('ip') || varKey.includes('mask')) {
        sampleVal = '192.168.1.1';
      } else if (vType === 'Port' || varKey.includes('port') || varKey.includes('olt')) {
        sampleVal = '1/1/1:1';
      } else if (vType === 'Number' || varKey.includes('idx') || varKey.includes('vlan')) {
        sampleVal = '67';
      } else {
        sampleVal = 'Hello World';
      }
      fsTestInputsState[varKey] = sampleVal;
    }

    const row = document.createElement('div');
    row.className = 'studio-test-row';

    const label = document.createElement('label');
    label.className = 'studio-test-label';
    label.textContent = `{${varKey}}` + (vDef?.dataType ? ` [${vDef.dataType}]` : '');
    label.htmlFor = `fs_test_${varKey}`;

    const input = document.createElement('input');
    input.id = `fs_test_${varKey}`;
    input.className = 'studio-test-input';
    input.dataset.varKey = varKey;
    input.value = sampleVal;
    input.placeholder = `Test value for {${varKey}}`;
    input.addEventListener('input', () => {
      fsTestInputsState[varKey] = input.value;
      runFormulaStudioTest();
    });

    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);
  });
}

function runFormulaStudioTest() {
  const editor = document.getElementById('fsCodeEditor');
  const card = document.getElementById('fsTestResultCard');
  const statusEl = document.getElementById('fsResultStatus');
  const valEl = document.getElementById('fsResultValue');
  const diagEl = document.getElementById('fsResultDiagnostic');
  if (!editor || !card) return;

  const formula = editor.value.trim();
  if (!formula) {
    card.className = 'studio-result-card studio-result-card--idle';
    statusEl.textContent = 'Enter a formula to test';
    valEl.textContent = '';
    diagEl.textContent = '';
    return;
  }

  // Gather current test inputs
  const testEnv = { ...fsTestInputsState };

  try {
    const ast = parseFormula(formula, fsTargetKey);
    const result = evaluateFormulaAst(ast, testEnv, fsTargetKey);
    const valRes = validateVariableValue(fsDataType, result);

    if (!valRes.valid) {
      card.className = 'studio-result-card studio-result-card--error';
      statusEl.textContent = '❌ Data Type Validation Failed';
      valEl.textContent = `Raw Output: "${result}"`;
      diagEl.textContent = valRes.error;
      return;
    }

    card.className = 'studio-result-card studio-result-card--success';
    statusEl.textContent = '✅ Computed Successfully';
    valEl.textContent = `Output: "${result}"`;
    diagEl.textContent = `Data Type [${fsDataType}] validation passed.`;
  } catch (err) {
    card.className = 'studio-result-card studio-result-card--error';
    statusEl.textContent = '❌ Evaluation Error';
    valEl.textContent = '';
    diagEl.textContent = err.message;
  }
}

function applyFormulaStudio() {
  const editor = document.getElementById('fsCodeEditor');
  const formula = editor?.value.trim() || '';

  if (formula) {
    try {
      parseFormula(formula, fsTargetKey);
    } catch (err) {
      alert(`Cannot apply invalid formula:\n\n${err.message}`);
      return;
    }

    const cycleRes = detectCircularDependency(variables, { key: fsTargetKey, formula });
    if (cycleRes.hasCycle) {
      alert(`Circular dependency detected:\n\n${cycleRes.message}`);
      return;
    }
  }

  const vfFormula = document.getElementById('vfFormula');
  if (vfFormula) {
    vfFormula.value = formula;
  }

  const vfDataType = document.getElementById('vfDataType');
  if (vfDataType) {
    vfDataType.value = fsDataType;
  }

  closeFormulaStudio();
  showToast(`Formula applied for {${fsTargetKey}}!`);
}

// =============================================================
// ADMIN PASSWORD MODAL
// =============================================================

let adminSessionUntil = 0; // Timestamp when active admin authentication expires (2 mins)

function initAdminPasswordModal() {
  document.getElementById('adminPwCancel')?.addEventListener('click', closeAdminPasswordModal);
  document.getElementById('adminPwConfirmBtn')?.addEventListener('click', confirmAdminPassword);
  document.getElementById('adminPwInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAdminPassword();
  });
  document.getElementById('adminPwConfirm')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAdminPassword();
  });
}

/**
 * Require admin password before running a callback.
 * If user recently authenticated (within 2 mins), proceeds immediately.
 * If admin password has never been set, guides user through first-time setup.
 */
async function requireAdminPassword(actionLabel, callback) {
  const adminHash = await window.feMacro.storeGet('adminPwHash', null);
  adminIsSetup = Boolean(adminHash);

  // If already authenticated within active session and setup is done, proceed directly
  if (adminIsSetup && Date.now() < adminSessionUntil) {
    if (callback) callback();
    return;
  }

  adminAuthCallback = callback;
  const msgEl = document.getElementById('adminPwMessage');
  const setupNote = document.getElementById('adminPwSetupNote');
  const titleEl = document.getElementById('adminPwTitle');
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-shield-halved" style="color:var(--signal);margin-right:6px;"></i> ${actionLabel}`;
  if (msgEl) {
    msgEl.textContent = adminIsSetup
      ? 'Enter admin password to continue.'
      : 'No admin password set yet. Create one now.';
  }
  if (setupNote) setupNote.style.display = adminIsSetup ? 'none' : 'block';
  const pwInput = document.getElementById('adminPwInput');
  if (pwInput) pwInput.value = '';
  const errEl = document.getElementById('adminPwError');
  if (errEl) errEl.style.display = 'none';
  const confirmInput = document.getElementById('adminPwConfirm');
  if (confirmInput) confirmInput.value = '';

  document.getElementById('adminPasswordModal').classList.remove('modal-overlay--hidden');
  setTimeout(() => pwInput?.focus(), 50);
}

function closeAdminPasswordModal() {
  document.getElementById('adminPasswordModal').classList.add('modal-overlay--hidden');
  adminAuthCallback = null;
}

async function confirmAdminPassword() {
  const password = document.getElementById('adminPwInput').value;
  const errEl = document.getElementById('adminPwError');
  if (errEl) errEl.style.display = 'none';

  // Validate: alphanumeric only, 6+ chars
  if (!/^[a-zA-Z0-9]{6,}$/.test(password)) {
    if (errEl) {
      errEl.textContent = 'Password must be at least 6 alphanumeric characters.';
      errEl.style.display = 'block';
    }
    return;
  }

  const cb = adminAuthCallback;

  if (!adminIsSetup) {
    // First-time: verify confirmation matches
    const confirm = document.getElementById('adminPwConfirm').value;
    if (password !== confirm) {
      if (errEl) {
        errEl.textContent = 'Passwords do not match.';
        errEl.style.display = 'block';
      }
      return;
    }
    // Hash and store the new admin password
    const { hash, salt } = await hashPassword(password);
    await window.feMacro.storeSet('adminPwHash', hash);
    await window.feMacro.storeSet('adminPwSalt', salt);
    adminIsSetup = true;
    adminSessionUntil = Date.now() + 2 * 60 * 1000; // 2 min session
    closeAdminPasswordModal();
    if (cb) cb();
  } else {
    // Verify existing password
    const storedHash = await window.feMacro.storeGet('adminPwHash', null);
    const storedSalt = await window.feMacro.storeGet('adminPwSalt', null);
    const ok = storedHash && storedSalt ? await verifyPassword(password, storedHash, storedSalt) : false;
    if (!ok) {
      if (errEl) {
        errEl.textContent = 'Incorrect password. Try again.';
        errEl.style.display = 'block';
      }
      const pwInput = document.getElementById('adminPwInput');
      if (pwInput) {
        pwInput.value = '';
        pwInput.focus();
      }
      return;
    }
    adminSessionUntil = Date.now() + 2 * 60 * 1000; // 2 min session
    closeAdminPasswordModal();
    if (cb) cb();
  }
}

// =============================================================
// EXPORT PASSWORD MODAL
// =============================================================

function initExportPasswordModal() {
  document.getElementById('exportPwCancel')?.addEventListener('click', closeExportPasswordModal);
  document.getElementById('exportPwConfirmBtn')?.addEventListener('click', confirmExportPassword);
  document.getElementById('exportPwInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmExportPassword();
  });
  document.getElementById('exportPwConfirm')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmExportPassword();
  });
}

function openExportPasswordModal() {
  document.getElementById('exportPwInput').value = '';
  document.getElementById('exportPwConfirm').value = '';
  document.getElementById('exportPwError').style.display = 'none';
  document.getElementById('exportPasswordModal').classList.remove('modal-overlay--hidden');
  setTimeout(() => document.getElementById('exportPwInput').focus(), 50);
}

function closeExportPasswordModal() {
  document.getElementById('exportPasswordModal').classList.add('modal-overlay--hidden');
  pendingExportPayload = null;
}

async function confirmExportPassword() {
  const pin = document.getElementById('exportPwInput').value;
  const pinConfirm = document.getElementById('exportPwConfirm').value;
  const errEl = document.getElementById('exportPwError');
  errEl.style.display = 'none';

  if (!/^\d{6}$/.test(pin) || pin !== pinConfirm) {
    errEl.style.display = 'block';
    return;
  }

  if (!pendingExportPayload) { closeExportPasswordModal(); return; }

  try {
    const encrypted = await encryptPayload(pendingExportPayload, pin);
    const res = await window.feMacro.exportConfig(encrypted);
    if (res.ok) {
      showToast('Settings exported & encrypted successfully!');
    } else if (res.error) {
      showToast(`Export failed: ${res.error}`);
    }
  } catch (err) {
    showToast(`Encrypt/Export error: ${err.message}`);
  }

  closeExportPasswordModal();
}

// =============================================================
// IMPORT PASSWORD MODAL
// =============================================================

let pendingEncryptedImport = null;

function initImportPasswordModal() {
  document.getElementById('importPwCancel')?.addEventListener('click', closeImportPasswordModal);
  document.getElementById('importPwConfirmBtn')?.addEventListener('click', confirmImportPassword);
  document.getElementById('importPwInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmImportPassword();
  });
}

function openImportPasswordModal(encryptedData) {
  pendingEncryptedImport = encryptedData;
  document.getElementById('importPwInput').value = '';
  document.getElementById('importPwError').style.display = 'none';
  document.getElementById('importPasswordModal').classList.remove('modal-overlay--hidden');
  setTimeout(() => document.getElementById('importPwInput').focus(), 50);
}

function closeImportPasswordModal() {
  document.getElementById('importPasswordModal').classList.add('modal-overlay--hidden');
  pendingEncryptedImport = null;
}

async function confirmImportPassword() {
  const pin = document.getElementById('importPwInput').value;
  const errEl = document.getElementById('importPwError');
  errEl.style.display = 'none';

  if (!pendingEncryptedImport) { closeImportPasswordModal(); return; }

  try {
    const decrypted = await decryptPayload(pendingEncryptedImport, pin);
    closeImportPasswordModal();
    processImportData(decrypted);
  } catch {
    errEl.style.display = 'block';
    document.getElementById('importPwInput').value = '';
    document.getElementById('importPwInput').focus();
  }
}
