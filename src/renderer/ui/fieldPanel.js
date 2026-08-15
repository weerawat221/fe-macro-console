import { state, getActiveTab, getActiveAppSubmode } from '../state.js';
import { onTabFieldChange, recalculateActiveTabVariables } from './tabs.js';
import { extractReferencedVariables } from '../../shared/formulaEngine.js';

let lastRenderedVarKeys = '';

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
        const key = m.slice(1, -1).trim();
        if (key) {
          usedKeys.add(key);
          const directDef = varDefs.find((v) => v.key === key);
          if (directDef && directDef.formula) {
            const deps = extractReferencedVariables(directDef.formula, directDef.key);
            deps.forEach((d) => usedKeys.add(d));
          }
        }
      });
    });
  });

  // Also include formula companion variables if their source variable is used
  varDefs.forEach((v) => {
    if (v.formula && !usedKeys.has(v.key)) {
      const deps = extractReferencedVariables(v.formula, v.key);
      if (deps.length > 0 && deps.every((d) => usedKeys.has(d))) {
        usedKeys.add(v.key);
      }
    }
  });

  const relevant = varDefs.filter((v) => usedKeys.has(v.key));

  usedKeys.forEach((key) => {
    if (!relevant.some((v) => v.key === key)) {
      const def = varDefs.find((v) => v.key === key);
      relevant.push(def || { key, label: key.toUpperCase().replace(/_/g, ' '), description: '' });
    }
  });

  return relevant;
}

function getVisibleVariables() {
  const varDefs = Array.isArray(state.variables) && state.variables.length > 0 ? state.variables : [];
  if (state.showAllFields) {
    return varDefs;
  }
  return getActiveVariablesForCurrentMode();
}

export function renderFieldPanel() {
  const panel = document.getElementById('fieldPanel');
  if (!panel) return;
  const tab = getActiveTab();
  if (!tab) { panel.innerHTML = ''; panel.style.display = 'none'; lastRenderedVarKeys = ''; return; }

  // Recalculate formula values for the active tab before rendering
  recalculateActiveTabVariables(tab);

  const relevantVars = getVisibleVariables();
  if (relevantVars.length === 0) { panel.innerHTML = ''; panel.style.display = 'none'; lastRenderedVarKeys = ''; return; }

  const sig = (state.showAllFields ? 'ALL:' : 'USED:') +
    relevantVars.map((v) => v.key + (v.locked ? ':L' : '') + (v.hidden ? ':H' : '') + (v.formula ? ':F' : '')).join(',');

  if (lastRenderedVarKeys === sig && panel.children.length > 0) {
    relevantVars.forEach((v) => {
      const input = document.getElementById(`field_${v.key}`);
      if (input) {
        if (v.formula || document.activeElement !== input) {
          input.value = tab.values[v.key] || '';
        }
      }
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
    const hasFormula = Boolean(def.formula);
    const group = document.createElement('div');
    group.className = 'field-group';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex;align-items:center;gap:4px;';

    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = def.label || def.key;
    label.htmlFor = `field_${def.key}`;
    labelRow.appendChild(label);

    if (hasFormula) {
      const formulaBadge = document.createElement('span');
      formulaBadge.className = 'field-badge--formula';
      formulaBadge.textContent = '📐 auto';
      formulaBadge.title = `Auto-calculated by formula:\n${def.formula}`;
      labelRow.appendChild(formulaBadge);
    }

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
    input.className = 'field-input' + (hasFormula ? ' field-input--readonly' : '');
    input.id = `field_${def.key}`;
    input.type = def.hidden ? 'password' : 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const currentVal = (tab.values[def.key] !== undefined && tab.values[def.key] !== null && tab.values[def.key] !== '')
      ? tab.values[def.key]
      : (def.default_value !== undefined && def.default_value !== null ? def.default_value : '');
    input.value = currentVal;

    if (hasFormula) {
      input.readOnly = true;
      input.title = `Auto-calculated formula for {${def.key}}:\n${def.formula}`;
    } else {
      input.addEventListener('input', (e) => { onTabFieldChange(def.key, e.target.value); });
    }

    group.appendChild(labelRow);
    group.appendChild(input);
    col.appendChild(group);
  });
  return col;
}
