const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  tokenizeFormula,
  parseFormula,
  evaluateFormulaAst,
  validateVariableValue,
  detectCircularDependency,
  recalculateVariables,
} = require('../src/shared/formulaEngine.js');

describe('Formula Engine - Tokenizer & Syntax Parser', () => {
  it('enforces outer { ... } block', () => {
    assert.throws(() => {
      parseFormula('lan_ip_cal_1 = "1.1.1.1"', 'lan_ip_cal_1');
    }, /Formula must begin with '\{'/);
  });

  it('rejects unclosed string literal with line/col info', () => {
    assert.throws(() => {
      parseFormula('{\n  x = "unclosed\n}', 'x');
    }, /Unclosed string literal/);
  });

  it('rejects lines that are not assignments', () => {
    assert.throws(() => {
      parseFormula('{\n  toint("123")\n  x = 1\n}', 'x');
    }, /Every line must be an assignment/);
  });

  it('enforces that the last line assigns to targetVarKey', () => {
    assert.throws(() => {
      parseFormula('{\n  temp = 1\n  other = 2\n}', 'lan_ip_cal_1');
    }, /บรรทัดสุดท้ายของสูตรต้องกำหนดค่าให้กับตัวแปร 'lan_ip_cal_1'/);
  });

  it('allows valid single-line split formula', () => {
    const ast = parseFormula('{\n  onu_idx = port.split(":", 1)\n}', 'onu_idx');
    assert.equal(ast.statements.length, 1);
    assert.equal(ast.statements[0].targetName, 'onu_idx');
  });

  it('allows valid multi-line calculation formula', () => {
    const code = `{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 1\n  lan_ip_cal_1 = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}`;
    const ast = parseFormula(code, 'lan_ip_cal_1');
    assert.equal(ast.statements.length, 3);
  });

  it('rejects intermediate variable assignment that collides with existing variables', () => {
    const existingVars = ['lan_ip', 'lan_ip_1', 'lan_ip_2'];
    const invalidCode = `{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 1\n  lan_ip_2 = "192.168.1.3"\n  lan_ip_1 = array[0] + "." + array[1] + "." + array[2] + "." + array[3]\n}`;
    assert.throws(() => {
      parseFormula(invalidCode, 'lan_ip_1', existingVars);
    }, /ไม่อนุญาตให้กำหนดค่าตัวแปร 'lan_ip_2' ซ้ำกับชื่อ Variable ที่มีอยู่แล้วในระบบ/);
  });

  it('isolates local variables like array[] between different formulas', () => {
    const code1 = `{\n  array[] = ip1.split(".")\n  out1 = array[0]\n}`;
    const code2 = `{\n  array[] = ip2.split(".")\n  out2 = array[0]\n}`;
    const ast1 = parseFormula(code1, 'out1');
    const ast2 = parseFormula(code2, 'out2');
    const res1 = evaluateFormulaAst(ast1, { ip1: '10.0.0.1' }, 'out1');
    const res2 = evaluateFormulaAst(ast2, { ip2: '192.168.1.1' }, 'out2');
    assert.equal(res1, '10');
    assert.equal(res2, '192');
  });
});

describe('Formula Engine - Type Coercion & Operators', () => {
  it('handles + with string as string concatenation ("250" + 1 -> "2501")', () => {
    const ast = parseFormula('{\n  res = "250" + 1\n}', 'res');
    const val = evaluateFormulaAst(ast, {}, 'res');
    assert.equal(val, '2501');
  });

  it('handles + with number as addition (1 + 2 -> 3)', () => {
    const ast = parseFormula('{\n  res = 1 + 2\n}', 'res');
    const val = evaluateFormulaAst(ast, {}, 'res');
    assert.equal(val, 3);
  });

  it('throws error when - is applied to string operands', () => {
    const ast = parseFormula('{\n  res = "10" - 2\n}', 'res');
    assert.throws(() => {
      evaluateFormulaAst(ast, {}, 'res');
    }, /ตัวดำเนินการ '-' ใช้ได้กับตัวเลขเท่านั้น กรุณาใช้ toint/);
  });

  it('throws error when * or / or mod is applied to string operands', () => {
    const ast1 = parseFormula('{\n  res = "10" * 2\n}', 'res');
    assert.throws(() => evaluateFormulaAst(ast1, {}, 'res'), /ตัวดำเนินการ '\*'/);

    const ast2 = parseFormula('{\n  res = "10" / 2\n}', 'res');
    assert.throws(() => evaluateFormulaAst(ast2, {}, 'res'), /ตัวดำเนินการ '\/'/);

    const ast3 = parseFormula('{\n  res = "10" mod 2\n}', 'res');
    assert.throws(() => evaluateFormulaAst(ast3, {}, 'res'), /ตัวดำเนินการ 'mod'/);
  });

  it('calculates numeric math operations correctly when cast with toint()', () => {
    const code = `{\n  res = (toint("10") + 5) * 2 - 4 / 2 + 10 mod 3\n}`;
    const ast = parseFormula(code, 'res');
    const val = evaluateFormulaAst(ast, {}, 'res');
    // (15 * 2) - 2 + 1 = 30 - 2 + 1 = 29
    assert.equal(val, 29);
  });

  it('throws error on division by zero', () => {
    const ast = parseFormula('{\n  res = 10 / 0\n}', 'res');
    assert.throws(() => evaluateFormulaAst(ast, {}, 'res'), /ไม่สามารถหารด้วย 0 ได้/);
  });
});

describe('Formula Engine - Whitelisted Functions (toint, tostring, split)', () => {
  it('toint() throws error on invalid string instead of NaN or 0', () => {
    const ast = parseFormula('{\n  res = toint("abc") + 1\n}', 'res');
    assert.throws(() => {
      evaluateFormulaAst(ast, {}, 'res');
    }, /toint\(\) ล้มเหลว — 'abc' ไม่ใช่ตัวเลขที่ถูกต้อง/);
  });

  it('tostring() converts numbers to string', () => {
    const ast = parseFormula('{\n  res = tostring(251)\n}', 'res');
    const val = evaluateFormulaAst(ast, {}, 'res');
    assert.equal(val, '251');
  });

  it('split() throws error when separator is missing from source value', () => {
    const ast = parseFormula('{\n  onu_idx = port.split(":", 1)\n}', 'onu_idx');
    assert.throws(() => {
      evaluateFormulaAst(ast, { port: '1/1/1' }, 'onu_idx');
    }, /ไม่พบตัวคั่น ':' ในค่าของ port/);
  });

  it('split() throws error when index is out of bounds', () => {
    const ast = parseFormula('{\n  onu_idx = port.split(":", 5)\n}', 'onu_idx');
    assert.throws(() => {
      evaluateFormulaAst(ast, { port: '1/1/1:5' }, 'onu_idx');
    }, /split\(':', 5\) — index เกินขอบเขต \(ผลลัพธ์มีแค่ 2 ส่วน: index 0-1\)/);
  });

  it('executes full example 1: IP octet calculation', () => {
    const code = `{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 1\n  lan_ip_cal_1 = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}`;
    const ast = parseFormula(code, 'lan_ip_cal_1');
    const val = evaluateFormulaAst(ast, { lan_ip: '192.168.1.1' }, 'lan_ip_cal_1');
    assert.equal(val, '192.168.1.2');
  });

  it('executes full example 2: port split', () => {
    const code = `{\n  onu_idx = port.split(":", 1)\n}`;
    const ast = parseFormula(code, 'onu_idx');
    const val = evaluateFormulaAst(ast, { port: '1/1/1:12' }, 'onu_idx');
    assert.equal(val, '12');
  });
});

describe('Formula Engine - Data Type Validation', () => {
  it('validates IP type strictly and reports octet overflow', () => {
    assert.equal(validateVariableValue('IP', '192.168.1.1').valid, true);
    assert.equal(validateVariableValue('IP', '0.0.0.0').valid, true);
    assert.equal(validateVariableValue('IP', '255.255.255.255').valid, true);

    const res1 = validateVariableValue('IP', '192.168.1.256');
    assert.equal(res1.valid, false);
    assert.match(res1.error, /octet ที่ 4 มีค่า 256 เกินช่วงที่อนุญาต \(0-255\)/);

    const res2 = validateVariableValue('IP', '192.168.1');
    assert.equal(res2.valid, false);
    assert.match(res2.error, /รูปแบบ IP ต้องมี 4 octet/);
  });

  it('validates Port type', () => {
    assert.equal(validateVariableValue('Port', '1/1/1').valid, true);
    assert.equal(validateVariableValue('Port', '1/1/1:5').valid, true);
    assert.equal(validateVariableValue('Port', 'invalid_port').valid, false);
  });

  it('validates Number type', () => {
    assert.equal(validateVariableValue('Number', '123').valid, true);
    assert.equal(validateVariableValue('Number', '-45').valid, true);
    assert.equal(validateVariableValue('Number', 'abc').valid, false);
  });
});

describe('Formula Engine - Circular Dependency Detection', () => {
  it('detects direct self-reference and transitive cycles with full chain', () => {
    const vars = [
      { key: 'a', formula: '{\n  a = b + 1\n}' },
      { key: 'b', formula: '{\n  b = c + 1\n}' },
      { key: 'c', formula: '{\n  c = a + 1\n}' },
    ];
    const res = detectCircularDependency(vars);
    assert.equal(res.hasCycle, true);
    assert.match(res.message, /Circular dependency detected: a → b → c → a/);
  });

  it('passes when graph is an acyclic DAG', () => {
    const vars = [
      { key: 'port', default_value: '1/1/1:5' },
      { key: 'olt', formula: '{\n  olt = port.split(":", 0)\n}' },
      { key: 'onu_idx', formula: '{\n  onu_idx = port.split(":", 1)\n}' },
    ];
    const res = detectCircularDependency(vars);
    assert.equal(res.hasCycle, false);
  });
});

describe('Formula Engine - Reactive Recalculation Engine', () => {
  it('recalculates derived variables in topological order', () => {
    const varDefs = [
      { key: 'port' },
      { key: 'olt', formula: '{\n  olt = port.split(":", 0)\n}', dataType: 'Port' },
      { key: 'onu_idx', formula: '{\n  onu_idx = port.split(":", 1)\n}', dataType: 'Number' },
      { key: 'next_onu', formula: '{\n  next_onu = tostring(toint(onu_idx) + 1)\n}', dataType: 'Number' },
    ];

    const inputValues = { port: '1/2/3:8' };
    const res = recalculateVariables(varDefs, inputValues);

    assert.equal(res.success, true);
    assert.equal(res.values.olt, '1/2/3');
    assert.equal(res.values.onu_idx, '8');
    assert.equal(res.values.next_onu, '9');
  });

  it('halts cascade on validation failure and preserves error state', () => {
    const varDefs = [
      { key: 'lan_ip' },
      {
        key: 'lan_overflow',
        formula: '{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 10\n  lan_overflow = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}',
        dataType: 'IP',
      },
      {
        key: 'derived_after_overflow',
        formula: '{\n  derived_after_overflow = lan_overflow + ":8080"\n}',
      },
    ];

    const inputValues = { lan_ip: '192.168.1.250' }; // 250 + 10 = 260 -> IP octet overflow
    const res = recalculateVariables(varDefs, inputValues);

    assert.equal(res.success, false);
    assert.match(res.errors.lan_overflow, /octet ที่ 4 มีค่า 260 เกินช่วงที่อนุญาต/);
    assert.match(res.errors.derived_after_overflow, /Cannot compute 'derived_after_overflow'/);
  });
});
