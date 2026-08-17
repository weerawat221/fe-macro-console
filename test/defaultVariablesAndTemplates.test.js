const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_COMMAND_SETS,
  DEFAULT_VARIABLES,
  normalizeVariables,
  normalizeCommandSets,
} = require('../src/shared/defaultCommands.js');
const { recalculateVariables } = require('../src/shared/formulaEngine.js');

describe('Default Variables and Dynamic Template Substitution (Clean Slate)', () => {
  it('provides an empty default state with no preloaded command sets or variables', () => {
    assert.deepEqual(DEFAULT_COMMAND_SETS, {}, 'DEFAULT_COMMAND_SETS should be an empty object {}');
    assert.deepEqual(DEFAULT_VARIABLES, [], 'DEFAULT_VARIABLES should be an empty array []');
  });

  it('normalizes null or undefined input to clean empty state', () => {
    assert.deepEqual(normalizeVariables(null), []);
    assert.deepEqual(normalizeVariables(undefined), []);
    assert.deepEqual(normalizeCommandSets(null), {});
    assert.deepEqual(normalizeCommandSets(undefined), {});
  });

  it('preserves user variables and computes formulas accurately', () => {
    const userVars = [
      { key: 'lan_ip', label: 'LAN IP', dataType: 'IP' },
      {
        key: 'lan_ip_1',
        label: 'LAN IP 1',
        dataType: 'IP',
        formula: '{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 1\n  lan_ip_1 = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}',
      },
      {
        key: 'lan_ip_2',
        label: 'LAN IP 2',
        dataType: 'IP',
        formula: '{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 2\n  lan_ip_2 = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}',
      },
      { key: 'port', label: 'Port', dataType: 'Port' },
      { key: 'olt', label: 'OLT', dataType: 'Port', formula: '{\n  olt = port.split(":", 0)\n}' },
      { key: 'onu_idx', label: 'ONU Index', dataType: 'Number', formula: '{\n  onu_idx = port.split(":", 1)\n}' },
    ];

    const normalized = normalizeVariables(userVars);
    assert.equal(normalized.length, 6);

    const data = {
      lan_ip: '172.17.218.17',
      port: '1/1/1:5',
    };

    const res = recalculateVariables(normalized, data);
    assert.equal(res.values.lan_ip_1, '172.17.218.18');
    assert.equal(res.values.lan_ip_2, '172.17.218.19');
    assert.equal(res.values.olt, '1/1/1');
    assert.equal(res.values.onu_idx, '5');
  });

  it('correctly upgrades legacy tokens in user command templates', () => {
    const userCommandSets = {
      MY_APP: {
        name: 'My Application',
        submodes: {
          DEFAULT: {
            name: 'Default',
            groups: {
              Network: [
                { label: 'Ping LAN 1', template: 'ping {lan_ip+1}\n' },
                { label: 'Ping LAN 2', template: 'ping {lan_ip+2}\n' },
                { label: 'Mask', template: 'mask {lan_mask}\n' },
              ],
            },
          },
        },
      },
    };

    const normalized = normalizeCommandSets(userCommandSets);
    const cmds = normalized.MY_APP.submodes.DEFAULT.groups.Network;

    assert.equal(cmds[0].template, 'ping {lan_ip_1}\n');
    assert.equal(cmds[1].template, 'ping {lan_ip_2}\n');
    assert.equal(cmds[2].template, 'mask {subnetmask29}\n');
  });
});
