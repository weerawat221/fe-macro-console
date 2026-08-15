import { state, getActiveTab } from './state.js';
import { showError } from './ui/errorBanner.js';
import { openConfirmModal } from './ui/confirmModal.js';

export function calculateIp(baseIp, increment) {
  try {
    const parts = (baseIp || '').trim().split('.');
    if (parts.length !== 4) return baseIp;
    const lastVal = parseInt(parts[3], 10) + increment;
    if (Number.isNaN(lastVal)) return baseIp;
    return `${parts[0]}.${parts[1]}.${parts[2]}.${lastVal}`;
  } catch {
    return baseIp;
  }
}

export function formatBlueIp(ipString) {
  try {
    const parts = (ipString || '').trim().split('.');
    if (parts.length !== 4) return ipString;
    return parts.map((seg, i) => (i < 3 ? (seg.length < 3 ? `${seg}\t` : seg) : `${seg}\t`)).join('');
  } catch {
    return ipString;
  }
}

export function formatBlueConfigFull(ipBase, mask) {
  const effectiveMask = mask || getSystemVarDefault('lan_mask') || '255.255.255.248';
  const ip2 = calculateIp(ipBase, 1);
  const ip3 = calculateIp(ipBase, 2);
  return `${formatBlueIp(ipBase)}${formatBlueIp(effectiveMask)}${formatBlueIp(ip2)}${formatBlueIp(ip3)}\t${formatBlueIp(ipBase)}`;
}

/** Lookup default_value for a system variable from state.variables */
function getSystemVarDefault(key) {
  const vars = Array.isArray(state.variables) ? state.variables : [];
  const def = vars.find((v) => v.key === key);
  return def ? (def.default_value || null) : null;
}

/** Evaluate a formula variable (e.g. olt, onu_idx) given input values */
function evaluateFormula(formula, values) {
  if (!formula) return '';
  try {
    // Safe eval: only simple split/index expressions
    const portVal = (values.port || '').trim();
    if (formula === 'port.split(":")[0]') return portVal.split(':')[0] || '';
    if (formula === 'port.split(":")[1]') {
      const parts = portVal.split(':');
      return parts.length > 1 ? parts[parts.length - 1] : portVal;
    }
    return '';
  } catch {
    return '';
  }
}

function buildTemplateData(tab) {
  const v = tab.values || {};
  const vars = Array.isArray(state.variables) ? state.variables : [];
  const data = { ...v };

  // Trim all string values from user input
  Object.keys(data).forEach((k) => {
    if (typeof data[k] === 'string') data[k] = data[k].trim();
  });

  // Resolve system variables: formula-based first, then default_value constants
  vars.forEach((varDef) => {
    if (!varDef.system) return;
    if (data[varDef.key]) return; // user already set value in tab

    if (varDef.formula) {
      data[varDef.key] = evaluateFormula(varDef.formula, data);
    } else if (varDef.default_value !== undefined) {
      data[varDef.key] = varDef.default_value;
    }
  });

  // Fallback for lan_mask / mask if not defined in variables list
  if (!data.lan_mask) data.lan_mask = getSystemVarDefault('lan_mask') || '255.255.255.248';
  if (!data.mask) data.mask = data.lan_mask;

  return data;
}

function extractTokens(template) {
  const matches = template.match(/\{(.*?)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

function resolveToken(token, data) {
  const t = token.trim();

  // 1. Direct match (e.g. sr_ap, lan_ip, lan_mask)
  if (data[t] !== undefined && data[t] !== '') {
    return data[t];
  }

  // 2. Full Blue Config shortcut (e.g. lan_ip:blue_full)
  if (t.endsWith(':blue_full')) {
    const baseField = t.replace(':blue_full', '');
    const baseIp = data[baseField] || '';
    if (!baseIp) throw new Error(`MISSING_TOKEN:${baseField}`);
    return formatBlueConfigFull(baseIp, data.lan_mask || '255.255.255.248');
  }

  // 3. Octet Auto-Tab format (e.g. lan_ip:blue, lan_ip:tab, lan_ip+1:blue, lan_mask:tab)
  if (t.includes(':blue') || t.includes(':tab')) {
    const expr = t.replace(/:blue|:tab/g, '');
    const resolvedIp = resolveToken(expr, data);
    return formatBlueIp(resolvedIp);
  }

  // 4. Specific Octet extraction (e.g. lan_ip.1, lan_ip.4, lan_ip+1.4)
  const octetMatch = t.match(/^(.*?)\.([1-4])$/);
  if (octetMatch) {
    const expr = octetMatch[1];
    const octetIdx = parseInt(octetMatch[2], 10) - 1;
    const resolvedIp = resolveToken(expr, data);
    const parts = (resolvedIp || '').split('.');
    if (parts.length === 4 && parts[octetIdx] !== undefined) {
      return parts[octetIdx];
    }
  }

  // 5. IP arithmetic token (e.g. lan_ip+1, lan_ip+2, ce_ip+1, pe_ip+1)
  const mathMatch = t.match(/^([a-zA-Z0-9_]+)([+-]\d+)$/);
  if (mathMatch) {
    const baseField = mathMatch[1];
    const offset = parseInt(mathMatch[2], 10);
    const baseIp = data[baseField] || '';
    if (!baseIp) throw new Error(`MISSING_TOKEN:${baseField}`);
    return calculateIp(baseIp, offset);
  }

  if (t === 'lan_mask' || t === 'mask') {
    return data[t] || getSystemVarDefault(t) || '255.255.255.248';
  }

  throw new Error(`MISSING_TOKEN:${t}`);
}

function formatTemplate(template, data) {
  return template.replace(/\{(.*?)\}/g, (_match, token) => {
    return resolveToken(token, data);
  });
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
