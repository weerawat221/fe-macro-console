// tabs.js
// Modern browser-style tab bar with inline close buttons, middle-click close,
// overflow horizontal scrolling, and debounced persistence.

import { state, setState, getActiveTab, makeId } from '../state.js';
import { showError } from './errorBanner.js';
import { renderFieldPanel } from './fieldPanel.js';
import { renderCommandPanel } from './commandPanel.js';
import { recalculateVariables } from '../../shared/formulaEngine.js';

let persistTimer = null;

export function recalculateActiveTabVariables(tab) {
  if (!tab) tab = getActiveTab();
  if (!tab) return;
  if (!tab.values) tab.values = {};
  const varDefs = Array.isArray(state.variables) ? state.variables : [];

  // Populate default values into tab.values for any variable that has a default_value if not yet set
  varDefs.forEach((def) => {
    if (
      (tab.values[def.key] === undefined || tab.values[def.key] === null || tab.values[def.key] === '') &&
      def.default_value !== undefined &&
      def.default_value !== null &&
      def.default_value !== ''
    ) {
      tab.values[def.key] = def.default_value;
    }
  });

  const recalcRes = recalculateVariables(varDefs, tab.values);
  tab.values = recalcRes.values;
  return recalcRes;
}

export async function persistTabs() {
  await window.feMacro.storeSet('tabs', state.tabs);
  await window.feMacro.storeSet('activeTabId', state.activeTabId);
}

export const persistTabsToStore = persistTabs;

function persistTabsDebounced() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTabs();
  }, 350);
}

export function initTabBar() {
  const newTabBtn = document.getElementById('btnNewTab');
  if (newTabBtn) newTabBtn.addEventListener('click', () => addNewTab());

  const clearBtn = document.getElementById('btnClearInputs');
  if (clearBtn) clearBtn.addEventListener('click', () => clearInputs());

  // Horizontal wheel scroll on tab bar
  const scrollWrapper = document.getElementById('tabScrollWrapper');
  if (scrollWrapper) {
    scrollWrapper.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          scrollWrapper.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );
  }
}

export async function loadTabsFromStore() {
  const savedTabs = await window.feMacro.storeGet('tabs', []);
  const savedActiveId = await window.feMacro.storeGet('activeTabId', null);
  const varDefs = Array.isArray(state.variables) ? state.variables : [];

  if (Array.isArray(savedTabs) && savedTabs.length > 0) {
    savedTabs.forEach((tab) => {
      if (!tab.values) tab.values = {};
      varDefs.forEach((def) => {
        if (
          (tab.values[def.key] === undefined || tab.values[def.key] === null || tab.values[def.key] === '') &&
          def.default_value !== undefined &&
          def.default_value !== null &&
          def.default_value !== ''
        ) {
          tab.values[def.key] = def.default_value;
        }
      });
    });

    setState({
      tabs: savedTabs,
      activeTabId: savedTabs.some((t) => t.id === savedActiveId) ? savedActiveId : savedTabs[0].id,
    });
  } else {
    addNewTab();
  }
  recalculateActiveTabVariables();
  renderTabBar();
}

export function addNewTab() {
  const tab = { id: makeId('tab'), name: 'New Tab', values: {} };
  const varDefs = Array.isArray(state.variables) ? state.variables : [];
  varDefs.forEach((def) => {
    if (def.default_value !== undefined && def.default_value !== null && def.default_value !== '') {
      tab.values[def.key] = def.default_value;
    }
  });

  recalculateActiveTabVariables(tab);
  setState({ tabs: [...state.tabs, tab], activeTabId: tab.id });
  renderTabBar();
  renderFieldPanel();
  renderCommandPanel();
  persistTabs();

  // Auto scroll to the new tab
  setTimeout(() => {
    const scrollWrapper = document.getElementById('tabScrollWrapper');
    if (scrollWrapper) {
      scrollWrapper.scrollLeft = scrollWrapper.scrollWidth;
    }
  }, 50);
}

export function closeTab(tabId) {
  if (state.tabs.length <= 1) {
    showError('Cannot close the last tab');
    return;
  }

  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  const newTabs = state.tabs.filter((t) => t.id !== tabId);
  let newActiveId = state.activeTabId;

  if (state.activeTabId === tabId) {
    const nextIdx = Math.min(idx, newTabs.length - 1);
    newActiveId = newTabs[nextIdx].id;
  }

  setState({ tabs: newTabs, activeTabId: newActiveId });
  recalculateActiveTabVariables();
  renderTabBar();
  renderFieldPanel();
  renderCommandPanel();
  persistTabs();
}

export function selectTab(tabId) {
  if (state.activeTabId === tabId) return;
  setState({ activeTabId: tabId });
  recalculateActiveTabVariables();
  renderTabBar();
  renderFieldPanel();
  renderCommandPanel();
  persistTabs();
}

export function clearInputs() {
  const tab = getActiveTab();
  if (!tab) return;

  const varDefs = Array.isArray(state.variables) ? state.variables : [];
  const lockedKeys = new Set(varDefs.filter((v) => v.locked).map((v) => v.key));
  const preserved = {};

  // Preserve values of locked variables
  Object.entries(tab.values || {}).forEach(([k, val]) => {
    if (lockedKeys.has(k)) preserved[k] = val;
  });

  // Re-populate default values for non-locked variables
  varDefs.forEach((def) => {
    if (def.default_value !== undefined && def.default_value !== null && def.default_value !== '') {
      if (preserved[def.key] === undefined || preserved[def.key] === null || preserved[def.key] === '') {
        preserved[def.key] = def.default_value;
      }
    }
  });

  tab.values = preserved;
  tab.name = 'New Tab';
  recalculateActiveTabVariables(tab);
  setState({ tabs: [...state.tabs] });
  renderTabBar();
  renderFieldPanel();
  showError('Inputs Cleared');
  persistTabs();
}

export function onTabFieldChange(fieldKey, value) {
  const tab = getActiveTab();
  if (!tab) return;
  if (!tab.values) tab.values = {};
  tab.values[fieldKey] = value;

  // Reactively recalculate derived formula variables
  const varDefs = Array.isArray(state.variables) ? state.variables : [];
  const recalcRes = recalculateVariables(varDefs, tab.values);
  tab.values = recalcRes.values;

  // Update DOM inputs for all formula fields reactively
  varDefs.forEach((v) => {
    if (v.formula) {
      const el = document.getElementById(`field_${v.key}`);
      if (el) {
        el.value = tab.values[v.key] || '';
      }
    }
  });

  // Auto-name tab based on primary identifier
  if (fieldKey === 'sr_ap' || fieldKey === 'sr_onu' || fieldKey === 'lan_ip' || fieldKey === 'pe_ip') {
    const nameVal = (tab.values.sr_ap || tab.values.sr_onu || tab.values.lan_ip || tab.values.pe_ip || '').trim();
    const newName = nameVal ? nameVal.slice(0, 15) : 'New Tab';
    if (tab.name !== newName) {
      tab.name = newName;
      updateActiveTabChipTitle(tab.name);
    }
  }
  persistTabsDebounced();
}

function updateActiveTabChipTitle(name) {
  const activeChip = document.querySelector(`.tab-chip[data-tab-id="${state.activeTabId}"] .tab-chip-title`);
  if (activeChip) {
    activeChip.textContent = name;
  } else {
    renderTabBar();
  }
}

export function renderTabBar() {
  const list = document.getElementById('tabList');
  if (!list) return;
  list.innerHTML = '';

  state.tabs.forEach((tab) => {
    const chip = document.createElement('div');
    chip.className = 'tab-chip' + (tab.id === state.activeTabId ? ' tab-chip--active' : '');
    chip.dataset.tabId = tab.id;
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', tab.id === state.activeTabId ? 'true' : 'false');
    chip.title = tab.name;

    // Tab title
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-chip-title';
    titleSpan.textContent = tab.name;
    chip.appendChild(titleSpan);

    // Close button 'x' inside tab
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-chip-close';
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    chip.appendChild(closeBtn);

    // Click to select
    chip.addEventListener('click', () => selectTab(tab.id));

    // Middle-click (auxclick with button 1) to close
    chip.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    list.appendChild(chip);
  });
}
