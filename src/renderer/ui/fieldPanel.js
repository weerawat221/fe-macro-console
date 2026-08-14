// fieldPanel.js
// Context-aware dynamic input fields:
// Only displays text inputs for variables that are actively used by the
// currently active/focused application and its active sub-mode commands.
// Optimized to preserve user input focus and cursor position.

import { state, getActiveTab, getActiveAppSubmode } from '../state.js';
import { onTabFieldChange } from './tabs.js';

let lastRenderedVarKeys = '';

function extractBaseToken(rawToken) {
  const t = rawToken.trim();

  // Special aliases that map to port
  if (t === 'onu_idx' || t === 'olt') return 'port';
  if (t === 'lan_mask' || t === 'mask') return null; // constant mask

  // Full blue shortcut or octet modifier
  if (t.includes(':blue') || t.includes(':tab')) {
    const base = t.replace(/:blue_full|:blue|:tab/g, '');
    return extractBaseToken(base);
  }

  // Octet index (e.g. lan_ip.4)
  const octetMatch = t.match(/^(.*?)\.([1-4])$/);
  if (octetMatch) {
    return extractBaseToken(octetMatch[1]);
  }

  // Math modifier (e.g. lan_ip+1, ce_ip+2)
  const mathMatch = t.match(/^([a-zA-Z0-9_]+)([+-]\d+)$/);
  if (mathMatch) {
    return mathMatch[1];
  }

  return t;
}

function getActiveVariablesForCurrentMode() {
  const activeAppKey = state.lastDetectedMode || Object.keys(state.commandSets)[0] || 'RDM';
  const app = state.commandSets[activeAppKey];
  if (!app || !app.submodes) return [];

  const subKey = getActiveAppSubmode(activeAppKey);
  const subObj = app.submodes[subKey];
  if (!subObj || !subObj.groups) return [];

  // Scan all command templates in current sub-mode
  const usedKeys = new Set();

  Object.values(subObj.groups).forEach((cmdList) => {
    (cmdList || []).forEach((cmd) => {
      const tmpl = cmd.template || '';
      const matches = tmpl.match(/\{(.*?)\}/g) || [];
      matches.forEach((m) => {
        const rawToken = m.slice(1, -1);
        const baseKey = extractBaseToken(rawToken);
        if (baseKey) usedKeys.add(baseKey);
      });
    });
  });

  const varList = Array.isArray(state.variables) ? state.variables : [];

  // Return only variables whose keys are used in this mode
  const relevant = varList.filter((v) => usedKeys.has(v.key));

  // Add any ad-hoc keys that are used in templates but not in default definitions
  usedKeys.forEach((key) => {
    if (!relevant.some((v) => v.key === key)) {
      relevant.push({
        key,
        label: key.toUpperCase().replace(/_/g, ' '),
        description: '',
      });
    }
  });

  return relevant;
}

export function renderFieldPanel() {
  const panel = document.getElementById('fieldPanel');
  if (!panel) return;

  const tab = getActiveTab();
  if (!tab) {
    panel.innerHTML = '';
    panel.style.display = 'none';
    lastRenderedVarKeys = '';
    return;
  }

  const relevantVars = getActiveVariablesForCurrentMode();

  if (relevantVars.length === 0) {
    panel.innerHTML = '';
    panel.style.display = 'none';
    lastRenderedVarKeys = '';
    return;
  }

  const currentKeySignature = relevantVars.map((v) => v.key).join(',');

  // If DOM structure matches current signature, update values in-place without destroying focus
  if (lastRenderedVarKeys === currentKeySignature && panel.children.length > 0) {
    relevantVars.forEach((v) => {
      const input = document.getElementById(`field_${v.key}`);
      if (input && document.activeElement !== input) {
        input.value = tab.values[v.key] || '';
      }
    });
    panel.style.display = 'grid';
    return;
  }

  lastRenderedVarKeys = currentKeySignature;
  panel.innerHTML = '';
  panel.style.display = 'grid';

  // Balance into 2 columns if > 2 fields, otherwise 1 column
  const mid = Math.ceil(relevantVars.length / 2);
  const leftFields = relevantVars.slice(0, mid);
  const rightFields = relevantVars.slice(mid);

  const leftCol = buildColumn(leftFields, tab);
  panel.appendChild(leftCol);

  if (rightFields.length > 0) {
    const rightCol = buildColumn(rightFields, tab);
    panel.appendChild(rightCol);
  }
}

function buildColumn(fieldDefs, tab) {
  const col = document.createElement('div');
  col.className = 'field-col';

  fieldDefs.forEach((def) => {
    const group = document.createElement('div');
    group.className = 'field-group';

    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = def.label || def.key;
    label.htmlFor = `field_${def.key}`;

    const input = document.createElement('input');
    input.className = 'field-input';
    input.id = `field_${def.key}`;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = def.description || '';
    input.value = tab.values[def.key] || '';

    input.addEventListener('input', (e) => {
      onTabFieldChange(def.key, e.target.value);
    });

    group.appendChild(label);
    group.appendChild(input);
    col.appendChild(group);
  });

  return col;
}
