// state.js
// Central application state.

import { DEFAULT_VARIABLES } from '../shared/defaultCommandsClient.js';

const listeners = new Set();

export const state = {
  // --- tabs ---
  tabs: [], // [{ id, name, values: { [fieldKey]: string } }]
  activeTabId: null,

  // --- focus tracking ---
  currentTargetHwnd: null,
  focusTitle: '',
  lastDetectedMode: 'RDM',

  // --- active sub-mode mapping per application ---
  // e.g. { RDM: 'AP', LINE: 'DEFAULT', MY_APP: 'CONFIG' }
  activeSubmodes: {
    RDM: 'AP',
  },

  // --- dynamic command sets tree (by application key) ---
  commandSets: {},

  // --- global variable definitions ---
  variables: [...DEFAULT_VARIABLES],

  // --- input fields filter mode ---
  showAllFields: false, // false = used only in active mode, true = show all fields

  // --- transient UI ---
  errorText: '',

  // --- editor modal scratch state ---
  editorNavTab: 'apps', // 'apps' | 'variables'
  editorActiveApp: 'RDM',
  editorActiveSubmode: 'AP',
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getActiveAppSubmode(appKey) {
  const app = state.commandSets[appKey];
  if (!app || !app.submodes) return null;
  const subKeys = Object.keys(app.submodes);
  if (subKeys.length === 0) return null;

  const current = state.activeSubmodes[appKey];
  if (current && app.submodes[current]) {
    return current;
  }
  return subKeys[0];
}
