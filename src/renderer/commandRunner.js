// commandRunner.js
// Dynamic command template resolution, IP calculations, and native execution.

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

export function formatBlueConfigFull(ipBase, mask = '255.255.255.248') {
  const ip2 = calculateIp(ipBase, 1);
  const ip3 = calculateIp(ipBase, 2);
  return `${formatBlueIp(ipBase)}${formatBlueIp(mask)}${formatBlueIp(ip2)}${formatBlueIp(ip3)}\t${formatBlueIp(ipBase)}`;
}

function buildTemplateData(tab) {
  const v = tab.values || {};
  const portVal = (v.port || '').trim();
  const hasColon = portVal.includes(':');
  const onuIdx = hasColon ? portVal.split(':').pop() : portVal;
  const olt = hasColon ? portVal.split(':')[0].trim() : '';

  const data = {
    ...v,
    onu_idx: onuIdx,
    olt,
    lan_mask: '255.255.255.248',
    mask: '255.255.255.248',
  };

  // Trim all string values
  Object.keys(data).forEach((k) => {
    if (typeof data[k] === 'string') data[k] = data[k].trim();
  });

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
    return '255.255.255.248';
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
