// editor.js
// Custom command & profile editor with top navigation for Command Sets (Apps) and Variables.
// Supports multi-program assignment per command set, preventing duplicate assignments,
// managing sub-macro sets, command groups, drag-and-drop command reordering / group moving with grip-lines icon,
// full variable/token management, and full Export/Import with Conflict Resolution.

import { state, setState } from '../state.js';
import { renderCommandPanel } from './commandPanel.js';
import { renderModeSelector } from './modeSelector.js';
import { renderFieldPanel } from './fieldPanel.js';
import { showError } from './errorBanner.js';

let editingCommand = null; // { appKey, submodeKey, groupTitle, index }
let editingVarIndex = null; // number | null
let nsAutoNameTracking = true;
let varSearchQuery = '';
let pendingImportData = null; // { incomingSets, incomingVars, conflicts: [] }
let draggedCmdInfo = null; // { appKey, submodeKey, fromGroup, fromIndex }

export function initEditor() {
  const closeBtn = document.getElementById('editorClose');
  if (closeBtn) closeBtn.addEventListener('click', closeEditorModal);


  // Top navbar tab switching (Command sets vs Variables)
  const tabApps = document.getElementById('tabNavApps');
  if (tabApps) tabApps.addEventListener('click', () => switchEditorTab('apps'));

  const tabVars = document.getElementById('tabNavVariables');
  if (tabVars) tabVars.addEventListener('click', () => switchEditorTab('variables'));

  // Export / Import buttons
  const btnExport = document.getElementById('btnExportConfig');
  if (btnExport) btnExport.addEventListener('click', handleExportConfig);

  const btnImport = document.getElementById('btnImportConfig');
  if (btnImport) btnImport.addEventListener('click', handleImportConfig);

  // Apps view actions
  const btnAddMode = document.getElementById('btnAddMode');
  if (btnAddMode) btnAddMode.addEventListener('click', openNewSetModal);

  const btnAddSubmode = document.getElementById('btnAddSubmode');
  if (btnAddSubmode) btnAddSubmode.addEventListener('click', openNewSubmodeModal);

  const btnAddGroup = document.getElementById('btnAddGroup');
  if (btnAddGroup) btnAddGroup.addEventListener('click', addNewGroup);

  const btnAddProc = document.getElementById('btnAddProcToSet');
  if (btnAddProc) btnAddProc.addEventListener('click', openAddProcModal);

  // Variables view actions
  const btnAddVar = document.getElementById('btnAddVariable');
  if (btnAddVar) btnAddVar.addEventListener('click', openNewVariableModal);

  const searchInput = document.getElementById('varSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      varSearchQuery = e.target.value.toLowerCase().trim();
      renderVariablesManager();
    });
  }

  // Global escape key to close open submodals or main modal
  window.addEventListener('keydown', handleGlobalKeydown);

  initNewSetModal();
  initNewSubmodeModal();
  initAddProcModal();
  initCommandFormModal();
  initVariableFormModal();
  initConflictModal();
}

function handleGlobalKeydown(e) {
  if (e.key !== 'Escape') return;

  const openModals = [
    { id: 'commandFormModal', close: closeCommandForm },
    { id: 'varFormModal', close: closeVariableForm },
    { id: 'newSubmodeModal', close: closeNewSubmodeModal },
    { id: 'addProcModal', close: closeAddProcModal },
    { id: 'newSetModal', close: closeNewSetModal },
    { id: 'importConflictModal', close: closeConflictModal },
    { id: 'editorModal', close: closeEditorModal },
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

export function openEditorModal() {
  const appKeys = Object.keys(state.commandSets);
  if (!state.editorActiveApp || !state.commandSets[state.editorActiveApp]) {
    state.editorActiveApp = appKeys[0] || 'RDM';
  }

  const app = state.commandSets[state.editorActiveApp];
  if (app && app.submodes) {
    const subKeys = Object.keys(app.submodes);
    if (!state.editorActiveSubmode || !app.submodes[state.editorActiveSubmode]) {
      state.editorActiveSubmode = subKeys[0] || 'DEFAULT';
    }
  }

  const modal = document.getElementById('editorModal');
  if (modal) modal.classList.remove('modal-overlay--hidden');
  switchEditorTab(state.editorNavTab || 'apps');
}

function closeEditorModal() {
  const modal = document.getElementById('editorModal');
  if (modal) modal.classList.add('modal-overlay--hidden');
  persistCommandSets();
  persistVariables();
  renderModeSelector();
  renderFieldPanel();
  renderCommandPanel();
}

function switchEditorTab(tabKey) {
  state.editorNavTab = tabKey;
  const btnApps = document.getElementById('tabNavApps');
  const btnVars = document.getElementById('tabNavVariables');
  const viewApps = document.getElementById('editorViewApps');
  const viewVars = document.getElementById('editorViewVariables');

  if (tabKey === 'apps') {
    if (btnApps) {
      btnApps.classList.add('editor-top-tab--active');
      btnApps.setAttribute('aria-selected', 'true');
    }
    if (btnVars) {
      btnVars.classList.remove('editor-top-tab--active');
      btnVars.setAttribute('aria-selected', 'false');
    }
    if (viewApps) viewApps.style.display = 'flex';
    if (viewVars) viewVars.style.display = 'none';
    renderEditorNav();
    renderEditorProcs();
    renderEditorSubmodes();
    renderEditorGroups();
  } else {
    if (btnApps) {
      btnApps.classList.remove('editor-top-tab--active');
      btnApps.setAttribute('aria-selected', 'false');
    }
    if (btnVars) {
      btnVars.classList.add('editor-top-tab--active');
      btnVars.setAttribute('aria-selected', 'true');
    }
    if (viewApps) viewApps.style.display = 'none';
    if (viewVars) viewVars.style.display = 'flex';
    renderVariablesManager();
  }
}

async function persistCommandSets() {
  await window.feMacro.storeSet('commandSets', state.commandSets);
}

async function persistVariables() {
  await window.feMacro.storeSet('variables', state.variables);
}

// Helper: map all configured processes to their command sets
function getUsedProcessMap(excludeAppKey = null) {
  const map = new Map();
  Object.entries(state.commandSets).forEach(([appKey, appObj]) => {
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

// =========================================================
// EXPORT & IMPORT SETTINGS WITH CONFLICT RESOLUTION
// =========================================================

async function handleExportConfig() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    commandSets: state.commandSets,
    variables: state.variables,
  };

  try {
    const res = await window.feMacro.exportConfig(payload);
    if (res.ok) {
      showError('Settings exported successfully!');
    } else if (res.error) {
      showError(`Export failed: ${res.error}`);
    }
  } catch (err) {
    showError(`Export error: ${err.message}`);
  }
}

async function handleImportConfig() {
  try {
    const res = await window.feMacro.importConfig();
    if (res.canceled) return;
    if (!res.ok || !res.data) {
      showError(`Import failed: ${res.error || 'Invalid file content'}`);
      return;
    }

    const data = res.data;
    const incomingSets = data.commandSets || {};
    const incomingVars = Array.isArray(data.variables) ? data.variables : [];

    if (Object.keys(incomingSets).length === 0 && incomingVars.length === 0) {
      showError('The selected file does not contain any Command Sets or Variables');
      return;
    }

    // Detect conflicts
    const conflicts = [];

    // Check Command Sets conflicts
    Object.entries(incomingSets).forEach(([appKey, appObj]) => {
      if (state.commandSets[appKey]) {
        conflicts.push({
          type: 'app',
          key: appKey,
          name: appObj.name || appKey,
          incomingData: appObj,
          existingData: state.commandSets[appKey],
        });
      }
    });

    // Check Variables conflicts
    incomingVars.forEach((v) => {
      const existing = state.variables.find((item) => item.key.toLowerCase() === v.key.toLowerCase());
      if (existing) {
        conflicts.push({
          type: 'var',
          key: v.key,
          name: `{${v.key}} - ${v.label || v.key}`,
          incomingData: v,
          existingData: existing,
        });
      }
    });

    if (conflicts.length === 0) {
      // No conflicts: merge directly
      applyImportData(incomingSets, incomingVars, {});
      showError('Settings imported successfully!');
    } else {
      // Show conflict resolution modal
      openConflictModal(incomingSets, incomingVars, conflicts);
    }
  } catch (err) {
    showError(`Import error: ${err.message}`);
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
    badge.textContent = c.type === 'app' ? 'Command Set' : 'Variable';
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

  const choices = {}; // key -> 'overwrite' | 'keep_both' | 'skip'
  conflicts.forEach((c, idx) => {
    const selected = document.querySelector(`input[name="conflict_choice_${idx}"]:checked`);
    choices[`${c.type}_${c.key}`] = selected ? selected.value : 'overwrite';
  });

  applyImportData(incomingSets, incomingVars, choices);
  closeConflictModal();
  showError('Settings imported & merged successfully!');
}

function applyImportData(incomingSets, incomingVars, choices = {}) {
  // Merge Command Sets
  Object.entries(incomingSets).forEach(([appKey, appObj]) => {
    const choiceKey = `app_${appKey}`;
    const choice = choices[choiceKey] || 'overwrite';

    if (!state.commandSets[appKey]) {
      state.commandSets[appKey] = appObj;
    } else if (choice === 'overwrite') {
      state.commandSets[appKey] = appObj;
    } else if (choice === 'keep_both') {
      let newKey = `${appKey}_IMPORTED`;
      let counter = 1;
      while (state.commandSets[newKey]) {
        newKey = `${appKey}_IMPORTED_${counter++}`;
      }
      const renamedObj = JSON.parse(JSON.stringify(appObj));
      renamedObj.name = `${renamedObj.name || appKey} (Imported)`;
      state.commandSets[newKey] = renamedObj;
    }
    // If 'skip', do nothing
  });

  // Merge Variables
  incomingVars.forEach((v) => {
    const choiceKey = `var_${v.key}`;
    const choice = choices[choiceKey] || 'overwrite';
    const existingIdx = state.variables.findIndex((item) => item.key.toLowerCase() === v.key.toLowerCase());

    if (existingIdx === -1) {
      state.variables.push(v);
    } else if (choice === 'overwrite') {
      state.variables[existingIdx] = v;
    } else if (choice === 'keep_both') {
      let newKey = `${v.key}_imported`;
      let counter = 1;
      while (state.variables.some((item) => item.key.toLowerCase() === newKey.toLowerCase())) {
        newKey = `${v.key}_imported_${counter++}`;
      }
      state.variables.push({
        key: newKey,
        label: `${v.label || v.key} (Imported)`,
        description: v.description || '',
      });
    }
    // If 'skip', do nothing
  });

  setState({
    commandSets: { ...state.commandSets },
    variables: [...state.variables],
  });

  persistCommandSets();
  persistVariables();

  // Refresh UI
  renderEditorNav();
  renderEditorProcs();
  renderEditorSubmodes();
  renderEditorGroups();
  renderVariablesManager();
  renderModeSelector();
  renderFieldPanel();
  renderCommandPanel();
}

// =========================================================
// Sidebar: List of Applications (Command Sets)
// =========================================================

function renderEditorNav() {
  const list = document.getElementById('editorModeList');
  if (!list) return;
  list.innerHTML = '';

  Object.entries(state.commandSets).forEach(([appKey, appObj]) => {
    const item = document.createElement('div');
    item.className = 'editor-mode-item' + (appKey === state.editorActiveApp ? ' editor-mode-item--active' : '');

    const label = document.createElement('span');
    label.className = 'editor-mode-item-title';
    label.textContent = appObj.name || appKey;
    item.appendChild(label);

    const del = document.createElement('span');
    del.className = 'editor-mode-item-del';
    del.innerHTML = '&times;';
    del.title = 'Delete this command set';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCommandSet(appKey);
    });
    item.appendChild(del);

    item.addEventListener('click', () => {
      state.editorActiveApp = appKey;
      const app = state.commandSets[appKey];
      if (app && app.submodes) {
        state.editorActiveSubmode = Object.keys(app.submodes)[0] || 'DEFAULT';
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
  const appObj = state.commandSets[appKey];
  const name = appObj ? appObj.name || appKey : appKey;
  if (!confirm(`Delete "${name}" and all its sub-modes and commands? This cannot be undone.`)) {
    return;
  }

  delete state.commandSets[appKey];
  const remainingKeys = Object.keys(state.commandSets);
  if (state.editorActiveApp === appKey) {
    state.editorActiveApp = remainingKeys[0] || null;
    if (state.editorActiveApp && state.commandSets[state.editorActiveApp]) {
      state.editorActiveSubmode = Object.keys(state.commandSets[state.editorActiveApp].submodes || {})[0] || null;
    }
  }

  setState({ commandSets: { ...state.commandSets } });
  renderEditorNav();
  renderEditorProcs();
  renderEditorSubmodes();
  renderEditorGroups();
  persistCommandSets();
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

  const app = state.commandSets[state.editorActiveApp];
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
    del.innerHTML = '&times;';
    del.title = `Remove ${procName} from this set`;
    del.addEventListener('click', () => {
      removeProcFromSet(procName);
    });
    pill.appendChild(del);

    container.appendChild(pill);
  });
}

function removeProcFromSet(procName) {
  const app = state.commandSets[state.editorActiveApp];
  if (!app) return;

  let procs = getAppProcesses(app);
  procs = procs.filter((p) => p.toLowerCase() !== procName.toLowerCase());

  app.processes = procs;
  app.process = procs[0] || '';

  setState({ commandSets: { ...state.commandSets } });
  renderEditorProcs();
  persistCommandSets();
}

function initAddProcModal() {
  document.getElementById('addProcCancel')?.addEventListener('click', closeAddProcModal);
  document.getElementById('addProcConfirm')?.addEventListener('click', confirmAddProcToSet);
}

async function openAddProcModal() {
  const app = state.commandSets[state.editorActiveApp];
  if (!app) return;

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
  const usedMap = getUsedProcessMap(state.editorActiveApp);

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
  const app = state.commandSets[state.editorActiveApp];
  if (!app) return;

  const select = document.getElementById('addProcSelect');
  const procName = select.value;
  if (!procName) {
    showError('Please select a program');
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

  setState({ commandSets: { ...state.commandSets } });
  closeAddProcModal();
  renderEditorProcs();
  persistCommandSets();
}

// =========================================================
// Sub-mode management (e.g. AP, ONU, Switch)
// =========================================================

function renderEditorSubmodes() {
  const container = document.getElementById('editorSubmodeList');
  if (!container) return;
  container.innerHTML = '';

  const app = state.commandSets[state.editorActiveApp];
  if (!app || !app.submodes) return;

  const subKeys = Object.keys(app.submodes);

  subKeys.forEach((subKey) => {
    const subObj = app.submodes[subKey];
    const pill = document.createElement('div');
    pill.className = 'editor-submode-pill' + (subKey === state.editorActiveSubmode ? ' editor-submode-pill--active' : '');

    const label = document.createElement('span');
    label.textContent = subObj.name || subKey;
    pill.appendChild(label);

    if (subKeys.length > 1) {
      const del = document.createElement('span');
      del.className = 'editor-submode-del';
      del.innerHTML = '&times;';
      del.title = 'Delete sub-mode';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSubmode(subKey);
      });
      pill.appendChild(del);
    }

    pill.addEventListener('click', () => {
      state.editorActiveSubmode = subKey;
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
  const input = document.getElementById('nsubName');
  input.value = '';
  document.getElementById('newSubmodeModal').classList.remove('modal-overlay--hidden');
  input.focus();
}

function closeNewSubmodeModal() {
  document.getElementById('newSubmodeModal').classList.add('modal-overlay--hidden');
}

function confirmCreateSubmode() {
  const app = state.commandSets[state.editorActiveApp];
  if (!app) return;

  const nameInput = document.getElementById('nsubName').value.trim();
  if (!nameInput) {
    showError('Please enter a sub-mode name');
    return;
  }

  const key = nameInput.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  if (!app.submodes) app.submodes = {};
  if (app.submodes[key]) {
    showError(`A sub-mode with key "${key}" already exists`);
    return;
  }

  app.submodes[key] = {
    name: nameInput,
    groups: {},
  };

  state.editorActiveSubmode = key;
  setState({ commandSets: { ...state.commandSets } });
  closeNewSubmodeModal();
  renderEditorSubmodes();
  renderEditorGroups();
  persistCommandSets();
}

function deleteSubmode(subKey) {
  const app = state.commandSets[state.editorActiveApp];
  if (!app || !app.submodes) return;

  const subKeys = Object.keys(app.submodes);
  if (subKeys.length <= 1) {
    showError('Cannot delete the only sub-mode');
    return;
  }

  if (!confirm(`Delete sub-mode "${app.submodes[subKey].name || subKey}" and all its commands?`)) return;

  delete app.submodes[subKey];
  const remaining = Object.keys(app.submodes);
  if (state.editorActiveSubmode === subKey) {
    state.editorActiveSubmode = remaining[0];
  }

  setState({ commandSets: { ...state.commandSets } });
  renderEditorSubmodes();
  renderEditorGroups();
  persistCommandSets();
}

// =========================================================
// Main panel: Groups + Command Rows (with Drag and Drop Reordering)
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
  const subObj = state.commandSets[appKey]?.submodes?.[submodeKey];
  if (!subObj || !subObj.groups) return;

  const sourceList = subObj.groups[fromGroup];
  const targetList = subObj.groups[toGroup];
  if (!sourceList || !targetList) return;

  // Extract the item from source
  const [item] = sourceList.splice(fromIndex, 1);
  if (!item) return;

  // If same group and moving downwards, adjust targetIndex
  let adjustedIndex = toIndex;
  if (fromGroup === toGroup && fromIndex < toIndex) {
    adjustedIndex = Math.max(0, adjustedIndex - 1);
  }

  // Insert into target group
  targetList.splice(adjustedIndex, 0, item);

  setState({ commandSets: { ...state.commandSets } });
  persistCommandSets();
  renderEditorGroups();
  renderCommandPanel();
}

function renderEditorGroups() {
  const container = document.getElementById('editorGroups');
  if (!container) return;
  container.innerHTML = '';

  const appKey = state.editorActiveApp;
  const app = state.commandSets[appKey];
  if (!app || !app.submodes) return;

  const subKey = state.editorActiveSubmode || Object.keys(app.submodes)[0];
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
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Delete group';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGroup(groupTitle);
    });
    actions.appendChild(delBtn);

    header.appendChild(actions);
    block.appendChild(header);

    // Block level drop target (dropping into empty group or bottom of group)
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
      // Handled at row level if dropped on a specific row
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

      // Grip-lines drag handle
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

      // Drag & Drop Event Handlers
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

      // Click to open command editor
      row.addEventListener('click', (e) => {
        if (e.target.closest('.cmd-drag-handle')) return;
        openCommandForm(appKey, subKey, groupTitle, index);
      });

      block.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'editor-add-cmd';
    addRow.textContent = '+ Add command';
    addRow.addEventListener('click', () => openCommandForm(appKey, subKey, groupTitle, null));
    block.appendChild(addRow);

    container.appendChild(block);
  });
}

function addNewGroup() {
  const appKey = state.editorActiveApp;
  const app = state.commandSets[appKey];
  if (!app) return;

  const subKey = state.editorActiveSubmode || Object.keys(app.submodes)[0];
  const subObj = app.submodes[subKey];
  if (!subObj) return;

  const input = document.getElementById('editorGroupTitle');
  const title = input.value.trim();
  if (!title) {
    showError('Enter a group title');
    return;
  }

  if (!subObj.groups) subObj.groups = {};
  if (subObj.groups[title]) {
    showError('A group with that name already exists in this sub-mode');
    return;
  }

  subObj.groups[title] = [];
  input.value = '';
  setState({ commandSets: { ...state.commandSets } });
  renderEditorGroups();
  persistCommandSets();
}

function deleteGroup(groupTitle) {
  const appKey = state.editorActiveApp;
  const app = state.commandSets[appKey];
  if (!app) return;

  const subKey = state.editorActiveSubmode;
  const subObj = app.submodes[subKey];
  if (!subObj || !subObj.groups) return;

  if (!confirm(`Delete group "${groupTitle}" and all its commands?`)) return;

  delete subObj.groups[groupTitle];
  setState({ commandSets: { ...state.commandSets } });
  renderEditorGroups();
  persistCommandSets();
}

// =========================================================
// Modal: Add New Command Set (with Multi-Program Selection)
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
    showError('Please select at least one program or enter a Display Name');
    return;
  }

  const appName = nameInput || selectedProcs.join(' + ');
  const baseKey = (selectedProcs[0] || nameInput).toUpperCase().replace(/\.EXE$/i, '').replace(/[^A-Z0-9_]/g, '_');
  let appKey = baseKey;
  let counter = 1;
  while (state.commandSets[appKey]) {
    appKey = `${baseKey}_${counter++}`;
  }

  // Parse sub-macro sets
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

  state.commandSets[appKey] = newApp;
  state.editorActiveApp = appKey;
  state.editorActiveSubmode = Object.keys(submodes)[0];

  setState({ commandSets: { ...state.commandSets } });
  closeNewSetModal();
  renderEditorNav();
  renderEditorProcs();
  renderEditorSubmodes();
  renderEditorGroups();
  persistCommandSets();
}

// =========================================================
// Command Row Form Modal
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
  const subObj = state.commandSets[appKey].submodes[submodeKey];
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
  const vars = Array.isArray(state.variables) ? state.variables : [];
  const baseKeys = vars.map((v) => v.key);
  return [
    ...baseKeys,
    'onu_idx',
    'olt',
    'lan_ip+1',
    'lan_ip+2',
    'lan_mask',
    'lan_ip:blue_full',
    'lan_ip:tab',
    'lan_ip:blue',
    'ce_ip+1',
    'pe_ip+1',
  ];
}

function updateTokenHint() {
  const textarea = document.getElementById('cfTemplate');
  const template = textarea.value;
  const hintEl = document.getElementById('cfTokenHint');
  const found = [...template.matchAll(/\{(.*?)\}/g)].map((m) => m[1]);

  const availableTokens = getAllAvailableTokens();
  const known = new Set(availableTokens);

  const isTokenValid = (t) => {
    if (known.has(t)) return true;
    if (t.match(/^([a-zA-Z0-9_]+)([+-]\d+)$/)) return true;
    if (t.match(/^(.*?)\.([1-4])$/)) return true;
    if (t.includes(':blue') || t.includes(':tab') || t.includes(':blue_full')) return true;
    return false;
  };

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

  // Attach click to insert
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
    showError('Enter a button label');
    return;
  }
  if (!template) {
    showError('Enter a command template');
    return;
  }

  const newCmd = { label, template, popup, autoFocus };
  const subObj = state.commandSets[appKey].submodes[submodeKey];
  const groupArr = subObj.groups[groupTitle];

  if (index === null) {
    groupArr.push(newCmd);
  } else {
    groupArr[index] = newCmd;
  }

  setState({ commandSets: { ...state.commandSets } });
  closeCommandForm();
  renderEditorGroups();
  persistCommandSets();
}

function deleteCommandForm() {
  if (!editingCommand || editingCommand.index === null) return;
  const { appKey, submodeKey, groupTitle, index } = editingCommand;

  if (!confirm('Delete this command?')) return;

  const subObj = state.commandSets[appKey].submodes[submodeKey];
  subObj.groups[groupTitle].splice(index, 1);

  setState({ commandSets: { ...state.commandSets } });
  closeCommandForm();
  renderEditorGroups();
  persistCommandSets();
}

// =========================================================
// Variables Manager View & Modal
// =========================================================

function getVariableUsageMap() {
  const usageMap = new Map(); // varKey -> Set of "AppName (Submode)"
  const vars = Array.isArray(state.variables) ? state.variables : [];
  vars.forEach((v) => usageMap.set(v.key, new Set()));

  Object.entries(state.commandSets).forEach(([appKey, appObj]) => {
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

  const vars = Array.isArray(state.variables) ? state.variables : [];
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
    const originalIndex = state.variables.findIndex((item) => item.key === v.key);
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

    // System badge
    if (v.system) {
      const sysBadge = document.createElement('span');
      sysBadge.textContent = v.formula ? '⚙ auto' : '⚙ const';
      sysBadge.style.cssText = 'font-size:9px;opacity:0.6;padding:1px 4px;border-radius:3px;background:var(--bg-surface);';
      actions.appendChild(sysBadge);
    }

    // Lock toggle button
    const lockBtn = document.createElement('button');
    lockBtn.className = 'btn btn--ghost btn--xs';
    lockBtn.title = v.locked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)';
    lockBtn.textContent = v.locked ? String.fromCodePoint(0x1F512) : String.fromCodePoint(0x1F513);
    lockBtn.addEventListener('click', () => {
      state.variables[originalIndex] = { ...state.variables[originalIndex], locked: !v.locked };
      setState({ variables: [...state.variables] });
      persistVariables();
      renderVariablesManager();
    });
    actions.appendChild(lockBtn);

    // Hidden badge
    if (v.hidden) {
      const hidBadge = document.createElement('span');
      hidBadge.textContent = String.fromCodePoint(0x1F510);
      hidBadge.title = 'Hidden — password-protected';
      hidBadge.style.cssText = 'font-size:12px;';
      actions.appendChild(hidBadge);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--ghost btn--xs';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openVariableForm(originalIndex));
    actions.appendChild(editBtn);

    header.appendChild(actions);
    card.appendChild(header);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'var-card-label';
    labelSpan.textContent = v.label || v.key;
    if (v.hidden) labelSpan.textContent += ' 🔐';
    if (v.locked) labelSpan.textContent += ' 🔒';
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
      defSpan.textContent = `Default: ${v.default_value}`;
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
}

function openNewVariableModal() {
  openVariableForm(null);
}

function openVariableForm(index) {
  editingVarIndex = index;
  const isNew = index === null;
  const v = isNew ? { key: '', label: '', description: '', default_value: '', locked: false, hidden: false } : state.variables[index];

  document.getElementById('varFormTitle').textContent = isNew ? 'Add Variable' : 'Edit Variable';
  const keyInput = document.getElementById('vfKey');
  keyInput.value = v.key || '';
  keyInput.disabled = !isNew;

  document.getElementById('vfLabel').value = v.label || '';
  document.getElementById('vfDescription').value = v.description || '';
  const dvEl = document.getElementById('vfDefaultValue');
  if (dvEl) dvEl.value = v.default_value || '';
  const lockEl = document.getElementById('vfLocked');
  if (lockEl) lockEl.checked = Boolean(v.locked);
  const hidEl = document.getElementById('vfHidden');
  if (hidEl) hidEl.checked = Boolean(v.hidden);
  document.getElementById('vfDelete').style.display = isNew ? 'none' : 'inline-flex';

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
  const dvEl = document.getElementById('vfDefaultValue');
  const default_value = dvEl ? dvEl.value.trim() : '';
  const lockEl = document.getElementById('vfLocked');
  const locked = lockEl ? lockEl.checked : false;
  const hidEl = document.getElementById('vfHidden');
  const hidden = hidEl ? hidEl.checked : false;

  if (!rawKey) { showError('Variable key is required'); return; }
  const key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!label) { showError('Field label is required'); return; }

  const isNew = editingVarIndex === null;
  const varObj = {
    key,
    label,
    description,
    default_value: default_value || null,
    locked: Boolean(locked || hidden),
    hidden: Boolean(hidden),
  };

  if (isNew) {
    if (state.variables.some((v) => v.key.toLowerCase() === key)) {
      showError(`Variable key "${key}" already exists`);
      return;
    }
    state.variables.push(varObj);
  } else {
    const origKey = state.variables[editingVarIndex].key;
    state.variables[editingVarIndex] = {
      ...state.variables[editingVarIndex],
      ...varObj,
      key: origKey,
    };
  }

  setState({ variables: [...state.variables] });
  closeVariableForm();
  renderVariablesManager();
  renderFieldPanel();
  persistVariables();
}

function deleteVariableForm() {
  if (editingVarIndex === null) return;
  const v = state.variables[editingVarIndex];

  if (!confirm(`Delete variable "{${v.key}}"?`)) return;

  state.variables.splice(editingVarIndex, 1);
  setState({ variables: [...state.variables] });
  closeVariableForm();
  renderVariablesManager();
  renderFieldPanel();
  persistVariables();
}
