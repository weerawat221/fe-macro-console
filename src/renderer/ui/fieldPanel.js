// fieldPanel.js
// Context-aware dynamic input fields.
// Dynamically resolves system variables (formula-based) and shows lock/hidden icons.

import { state, getActiveTab, getActiveAppSubmode } from '../state.js';
import { onTabFieldChange } from './tabs.js';

let lastRenderedVarKeys = '';

function buildFormulaSourceMap(varDefs) {
  const map = new Map();
  (varDefs || []).forEach((v) => {
    if (v.formula) {
      const src = v.formula.match(/^([a-zA-Z0-9_]+)\./);
      if (src) map.set(v.key, src[1]);
    }
  });
  return map;
}

function extractBaseToken(rawToken, varDefs) {
  const t = rawToken.trim();
  const formulaMap = buildFormulaSourceMap(varDefs);
  if (formulaMap.has(t)) return formulaMap.get(t);
  if (t === 'lan_mask' || t === 'mask') return null;
  if (t.includes(':blue') || t.includes(':tab')) {
    return extractBaseToken(t.replace(/:blue_full|:blue|:tab/g, ''), varDefs);
  }
  const octetMatch = t.match(/^(.*?)\.([1-4])$/);
  if (octetMatch) return extractBaseToken(octetMatch[1], varDefs);
  const mathMatch = t.match(/^([a-zA-Z0-9_]+)([+-]\d+)$/);
  if (mathMatch) return mathMatch[1];
  return t;
}

function getActiveVariablesForCurrentMode() {
  const varDefs = Array.isArray(state.variables) ? state.variables : [];
  const activeAppKey = state.lastDetectedMode || Object.keys(state.commandSets)[0] || 'RDM';
  const app = state.commandSets[activeAppKey];
  if (!app || !app.submodes) return [];
  const subKey = getActiveAppSubmode(activeAppKey);
  const subObj = app.submodes[subKey];
  if (!subObj || !subObj.groups) return [];
  const usedKeys = new Set();
  Object.values(subObj.groups).forEach((cmdList) => {
    (cmdList || []).forEach((cmd) => {
      const tmpl = cmd.template || '';
      (tmpl.match(/\{(.*?)\}/g) || []).forEach((m) => {
        const baseKey = extractBaseToken(m.slice(1, -1), varDefs);
        if (baseKey) usedKeys.add(baseKey);
      });
    });
  });
  const relevant = varDefs.filter((v) => {
    if (v.system && v.formula) return false;
    if (v.system && !usedKeys.has(v.key)) return false;
    return usedKeys.has(v.key);
  });
  usedKeys.forEach((key) => {
    if (!relevant.some((v) => v.key === key)) {
      const def = varDefs.find((v) => v.key === key);
      if (!def || !(def.system && def.formula)) {
        relevant.push(def || { key, label: key.toUpperCase().replace(/_/g, ' '), description: '' });
      }
    }
  });
  return relevant;
}

function getVisibleVariables() {
  const varDefs = Array.isArray(state.variables) && state.variables.length > 0 ? state.variables : [];
  if (state.showAllFields) {
    const userVars = varDefs.filter((v) => !(v.system && v.formula));
    if (userVars.length > 0) return userVars;
  }
  return getActiveVariablesForCurrentMode();
}

export function renderFieldPanel() {
  const panel = document.getElementById('fieldPanel');
  if (!panel) return;
  const tab = getActiveTab();
  if (!tab) { panel.innerHTML = ''; panel.style.display = 'none'; lastRenderedVarKeys = ''; return; }
  const relevantVars = getVisibleVariables();
  if (relevantVars.length === 0) { panel.innerHTML = ''; panel.style.display = 'none'; lastRenderedVarKeys = ''; return; }
  const sig = (state.showAllFields ? 'ALL:' : 'USED:') +
    relevantVars.map((v) => v.key + (v.locked ? ':L' : '') + (v.hidden ? ':H' : '')).join(',');
  if (lastRenderedVarKeys === sig && panel.children.length > 0) {
    relevantVars.forEach((v) => {
      const input = document.getElementById(`field_${v.key}`);
      if (input && document.activeElement !== input) input.value = tab.values[v.key] || '';
    });
    panel.style.display = 'grid';
    return;
  }
  lastRenderedVarKeys = sig;
  panel.innerHTML = '';
  panel.style.display = 'grid';
  const mid = Math.ceil(relevantVars.length / 2);
  panel.appendChild(buildColumn(relevantVars.slice(0, mid), tab));
  if (relevantVars.length > mid) panel.appendChild(buildColumn(relevantVars.slice(mid), tab));
}

function buildColumn(fieldDefs, tab) {
  const col = document.createElement('div');
  col.className = 'field-col';
  fieldDefs.forEach((def) => {
    const group = document.createElement('div');
    group.className = 'field-group';
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = def.label || def.key;
    label.htmlFor = `field_${def.key}`;
    labelRow.appendChild(label);
    if (def.locked) {
      const s = document.createElement('span');
      s.title = 'Locked — value preserved on Clear';
      s.style.cssText = 'font-size:10px;opacity:0.65;';
      s.textContent = String.fromCodePoint(0x1F512);
      labelRow.appendChild(s);
    }
    if (def.hidden) {
      const s = document.createElement('span');
      s.title = 'Hidden — value protected';
      s.style.cssText = 'font-size:10px;opacity:0.65;';
      s.textContent = String.fromCodePoint(0x1F510);
      labelRow.appendChild(s);
    }
    const input = document.createElement('input');
    input.className = 'field-input';
    input.id = `field_${def.key}`;
    input.type = def.hidden ? 'password' : 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = def.description || '';
    input.value = tab.values[def.key] || '';
    input.addEventListener('input', (e) => { onTabFieldChange(def.key, e.target.value); });
    group.appendChild(labelRow);
    group.appendChild(input);
    col.appendChild(group);
  });
  return col;
}
