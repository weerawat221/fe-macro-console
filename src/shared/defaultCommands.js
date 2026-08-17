// defaultCommands.js
// Standard command sets and default variables for FE Macro Console (clean empty slate by default).

const DEFAULT_COMMAND_SETS = {};

const DEFAULT_VARIABLES = [];

const OBSOLETE_KEYS = new Set([
  'lan_mask',
  'mask',
  'cred_ap_pass_old',
  'cred_ap_pass_new',
  'lan_ip+1',
  'lan_ip+2',
  'lan_ip:tab',
  'lan_ip:blue',
  'lan_ip:blue_full',
  'lan_mask:tab',
  'lan_ip+1:tab',
]);

function upgradeTemplateTokens(tmpl) {
  if (typeof tmpl !== 'string') return tmpl;
  return tmpl
    .replace(/\{lan_ip:blue_full\}/g, '{lan_ip}\t{subnetmask29}\t{lan_ip_1}\t{lan_ip_2}\t{lan_ip}')
    .replace(/\{lan_ip:blue\}/g, '{lan_ip}')
    .replace(/\{lan_ip:tab\}/g, '{lan_ip}')
    .replace(/\{lan_mask:tab\}/g, '{subnetmask29}')
    .replace(/\{lan_ip\+1:tab\}/g, '{lan_ip_1}')
    .replace(/\{lan_ip\+1\}/g, '{lan_ip_1}')
    .replace(/\{lan_ip\+2\}/g, '{lan_ip_2}')
    .replace(/\{lan_mask\}/g, '{subnetmask29}')
    .replace(/\{mask\}/g, '{subnetmask29}')
    .replace(/\{cred_ap_pass_old\}/g, '')
    .replace(/\{cred_ap_pass_new\}/g, '');
}

function normalizeVariables(stored) {
  if (!Array.isArray(stored)) return [];

  const keyMap = new Map();
  stored.forEach((v) => {
    if (v && v.key && !OBSOLETE_KEYS.has(v.key)) {
      keyMap.set(v.key, {
        key: v.key,
        label: v.label || v.key,
        description: v.description || '',
        locked: !!v.locked,
        hidden: !!v.hidden,
        formula: v.formula || null,
        dataType: v.dataType || 'String',
        default_value: v.default_value !== undefined ? v.default_value : null,
      });
    }
  });

  return Array.from(keyMap.values());
}

function normalizeCommandSets(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};

  const result = JSON.parse(JSON.stringify(stored));

  // Upgrade legacy template tokens across all command sets
  Object.values(result).forEach((app) => {
    if (app && app.submodes) {
      Object.values(app.submodes).forEach((sub) => {
        if (sub && sub.groups) {
          Object.values(sub.groups).forEach((cmdList) => {
            (cmdList || []).forEach((cmd) => {
              if (cmd && cmd.template) {
                cmd.template = upgradeTemplateTokens(cmd.template);
              }
            });
          });
        }
      });
    }
  });

  return result;
}

module.exports = {
  DEFAULT_COMMAND_SETS,
  DEFAULT_VARIABLES,
  normalizeVariables,
  normalizeCommandSets,
};
