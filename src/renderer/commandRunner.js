import { state, getActiveTab } from './state.js';
import { showError } from './ui/errorBanner.js';
import { openConfirmModal } from './ui/confirmModal.js';
import { recalculateVariables } from '../shared/formulaEngine.js';

function buildTemplateData(tab) {
  const v = tab.values || {};
  const vars = Array.isArray(state.variables) ? state.variables : [];
  const data = { ...v };

  // Trim all string values from user input
  Object.keys(data).forEach((k) => {
    if (typeof data[k] === 'string') data[k] = data[k].trim();
  });

  // Populate default constants if not set
  vars.forEach((varDef) => {
    if (data[varDef.key] === undefined || data[varDef.key] === '') {
      if (varDef.default_value !== undefined && varDef.default_value !== null) {
        data[varDef.key] = varDef.default_value;
      }
    }
  });

  // Recalculate derived formula variables in topological order
  const recalcRes = recalculateVariables(vars, data);
  Object.assign(data, recalcRes.values);

  return data;
}

function extractTokens(template) {
  const matches = template.match(/\{(.*?)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

function resolveToken(token, data) {
  const t = token.trim();

  // Direct match from variable data (input, default, or formula-calculated)
  if (data[t] !== undefined && data[t] !== '') {
    return data[t];
  }

  throw new Error(`MISSING_TOKEN:${t}`);
}

/**
 * Unescapes literal string sequences like \t, \n, \r into actual control characters.
 * @param {string} str
 * @returns {string}
 */
export function unescapeMacroString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}

function formatTemplate(template, data) {
  const resolved = template.replace(/\{(.*?)\}/g, (_match, token) => {
    return resolveToken(token, data);
  });
  return unescapeMacroString(resolved);
}

export async function runCommand(template, popupType, label, autoFocus = true, appKey = null) {
  const tab = getActiveTab();
  if (!tab) return;

  const data = buildTemplateData(tab);

  let finalCmd;
  try {
    finalCmd = formatTemplate(template, data);
  } catch (err) {
    const msg = err.message || '';
    if (msg.startsWith('MISSING_TOKEN:')) {
      const missingToken = msg.replace('MISSING_TOKEN:', '');
      showError(`MISSING: ${missingToken.toUpperCase()}`);
    } else {
      showError('TEMPLATE ERROR: unresolved token');
    }
    return;
  }

  const targetApp = appKey || state.lastDetectedMode;

  if (autoFocus && window.feMacro && window.feMacro.focusTarget) {
    await window.feMacro.focusTarget(targetApp);
  }

  if (popupType === 'full') {
    openConfirmModal(label, finalCmd, targetApp);
  } else {
    await sendToTarget(finalCmd, targetApp);
  }
}

export async function sendToTarget(text, appKey = null) {
  const targetApp = appKey || state.lastDetectedMode;
  const result = await window.feMacro.send(text, targetApp);
  if (!result.ok) {
    showError(result.reason || 'Send failed');
  }
  return result;
}
