const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_COMMAND_SETS, DEFAULT_VARIABLES, normalizeVariables } = require('../src/shared/defaultCommands.js');
const { recalculateVariables } = require('../src/shared/formulaEngine.js');

describe('Default Variables and Dynamic Template Substitution', () => {
  it('contains no system locks on default variables so users can fully edit/delete', () => {
    DEFAULT_VARIABLES.forEach((v) => {
      assert.equal(Boolean(v.system), false, `Variable ${v.key} should not have system=true`);
    });
  });

  it('contains proper default formulas for lan_ip_1, lan_ip_2, olt, onu_idx', () => {
    const lan1 = DEFAULT_VARIABLES.find((v) => v.key === 'lan_ip_1');
    const lan2 = DEFAULT_VARIABLES.find((v) => v.key === 'lan_ip_2');
    const olt = DEFAULT_VARIABLES.find((v) => v.key === 'olt');
    const onu = DEFAULT_VARIABLES.find((v) => v.key === 'onu_idx');

    assert.ok(lan1 && lan1.formula);
    assert.ok(lan2 && lan2.formula);
    assert.ok(olt && olt.formula);
    assert.ok(onu && onu.formula);

    const data = {
      lan_ip: '172.17.218.17',
      port: '1/1/1:5',
    };

    const res = recalculateVariables(DEFAULT_VARIABLES, data);
    assert.equal(res.values.lan_ip_1, '172.17.218.18');
    assert.equal(res.values.lan_ip_2, '172.17.218.19');
    assert.equal(res.values.olt, '1/1/1');
    assert.equal(res.values.onu_idx, '5');
  });

  it('contains no hardcoded passwords or fixed IPs in command templates', () => {
    // Check all templates in DEFAULT_COMMAND_SETS
    const allTemplates = [];
    Object.values(DEFAULT_COMMAND_SETS).forEach((app) => {
      Object.values(app.submodes || {}).forEach((sub) => {
        Object.values(sub.groups || {}).forEach((cmdList) => {
          (cmdList || []).forEach((cmd) => {
            allTemplates.push({ label: cmd.label, template: cmd.template });
          });
        });
      });
    });

    allTemplates.forEach(({ label, template }) => {
      // Check no legacy tokens like :blue_full, :blue, :tab, +1, +2
      assert.ok(!template.includes(':blue_full'), `Template '${label}' should not contain :blue_full`);
      assert.ok(!template.includes(':blue}'), `Template '${label}' should not contain :blue`);
      assert.ok(!template.includes('{lan_ip+1}'), `Template '${label}' should not contain {lan_ip+1}`);
      assert.ok(!template.includes('{lan_ip+2}'), `Template '${label}' should not contain {lan_ip+2}`);
      assert.ok(!template.includes('{lan_mask}'), `Template '${label}' should not contain {lan_mask}`);
      assert.ok(!template.includes('{mask}'), `Template '${label}' should not contain {mask}`);
    });
  });

  it('respects user variable deletions when normalizing stored variables', () => {
    // User deleted 'captcha' and 'user_vlan'
    const stored = DEFAULT_VARIABLES.filter((v) => v.key !== 'captcha' && v.key !== 'user_vlan');
    const normalized = normalizeVariables(stored);

    assert.equal(normalized.some((v) => v.key === 'captcha'), false);
    assert.equal(normalized.some((v) => v.key === 'user_vlan'), false);
    assert.equal(normalized.length, stored.length);
  });
});
