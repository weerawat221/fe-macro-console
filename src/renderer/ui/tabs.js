// tabs.js
// Modern browser-style tab bar with inline close buttons, middle-click close,
// overflow horizontal scrolling, and debounced persistence.

import { state, setState, getActiveTab, makeId } from '../state.js';
import { showError } from './errorBanner.js';
import { renderFieldPanel } from './fieldPanel.js';
import { renderCommandPanel } from './commandPanel.js';

let persistTimer = null;

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

  if (Array.isArray(savedTabs) && savedTabs.length > 0) {
    setState({
      tabs: savedTabs,
      activeTabId: savedTabs.some((t) => t.id === savedActiveId) ? savedActiveId : savedTabs[0].id,
    });
  } else {
    addNewTab();
  }
  renderTabBar();
}

export function addNewTab() {
  const tab = { id: makeId('tab'), name: 'New Tab', values: {} };
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
  renderTabBar();
  renderFieldPanel();
  renderCommandPanel();
  persistTabs();
}

export function selectTab(tabId) {
  if (state.activeTabId === tabId) return;
  setState({ activeTabId: tabId });
  renderTabBar();
  renderFieldPanel();
  renderCommandPanel();
  persistTabs();
}

export function clearInputs() {
  const tab = getActiveTab();
  if (!tab) return;

  // Preserve values of locked variables
  const lockedKeys = new Set(
    (state.variables || []).filter((v) => v.locked).map((v) => v.key)
  );
  const preserved = {};
  Object.entries(tab.values || {}).forEach(([k, val]) => {
    if (lockedKeys.has(k)) preserved[k] = val;
  });

  tab.values = preserved;
  tab.name = 'New Tab';
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
    closeBtn.innerHTML = '&times;';
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
