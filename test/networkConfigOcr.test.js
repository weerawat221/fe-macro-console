const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidIpv4,
  repairIpv4,
  extractIps,
  parsePortOlt,
  extractPorts,
  extractLabeledPairs,
  cleanOcrValueByDataType,
  processOcrText,
} = require('../src/shared/networkConfigOcr');

test('IPv4 Validation - isValidIpv4', () => {
  assert.equal(isValidIpv4('192.168.1.1'), true);
  assert.equal(isValidIpv4('172.30.143.210'), true);
  assert.equal(isValidIpv4('172.31.127.166'), true);
  assert.equal(isValidIpv4('172.16.255.73'), true);
  assert.equal(isValidIpv4('10.0.0.1'), true);
  assert.equal(isValidIpv4('255.255.255.248'), true);
  assert.equal(isValidIpv4('0.0.0.0'), true);

  // Invalid cases
  assert.equal(isValidIpv4('256.0.0.1'), false);
  assert.equal(isValidIpv4('172.300.1.1'), false);
  assert.equal(isValidIpv4('192.168.1'), false);
  assert.equal(isValidIpv4('192.168.1.1.1'), false);
  assert.equal(isValidIpv4('17230.143210'), false);
  assert.equal(isValidIpv4('abc.def.ghi.jkl'), false);
  assert.equal(isValidIpv4(''), false);
});

test('IPv4 Dropped-Dot and OCR Noise Repair - repairIpv4', () => {
  // Real-world user OCR cases:
  assert.equal(repairIpv4('17230.143210'), '172.30.143.210');
  assert.equal(repairIpv4('192168.1.1'), '192.168.1.1');
  assert.equal(repairIpv4('172.31127.166'), '172.31.127.166');
  assert.equal(repairIpv4('172.31.127166'), '172.31.127.166');
  assert.equal(repairIpv4('100120101'), '100.120.10.1');
  
  // Colons / commas / semicolons instead of dots
  assert.equal(repairIpv4('172:30:143:210'), '172.30.143.210');
  assert.equal(repairIpv4('172,31,127,166'), '172.31.127.166');
  assert.equal(repairIpv4('10;0;0;1'), '10.0.0.1');

  // Prefix & CIDR strip
  assert.equal(repairIpv4('PE IP: 172.31.127.166/29'), '172.31.127.166');
  assert.equal(repairIpv4('CE IP: 172.30.143.210/30'), '172.30.143.210');
  assert.equal(repairIpv4('LAN IP: 172.16.255.73/29'), '172.16.255.73');
  assert.equal(repairIpv4('ไอพี: 10.10.10.1'), '10.10.10.1');
});

test('Extract multiple IPs from noisy OCR block - extractIps', () => {
  const noisyText = `
    SR680854 4467d9011
    0. 172.31.127.165 172.31.127.166 172.16.255.73
    . 172.31.127.165 172.31.127.166
    BRM1-Sฆ
    172.31.127.166 172.16.255.73
    CE: 17230.143210
  `;

  const ips = extractIps(noisyText);
  assert.ok(ips.includes('172.31.127.165'));
  assert.ok(ips.includes('172.31.127.166'));
  assert.ok(ips.includes('172.16.255.73'));
  assert.ok(ips.includes('172.30.143.210')); // repaired from 17230.143210
  assert.equal(ips.includes('0.'), false);
});

test('Port / OLT Parsing & Normalization - parsePortOlt', () => {
  const p1 = parsePortOlt('1/1/1:5');
  assert.equal(p1.valid, true);
  assert.equal(p1.raw, '1/1/1:5');
  assert.equal(p1.olt, '1/1/1');
  assert.equal(p1.onu_idx, 5);

  const p2 = parsePortOlt('0/2/3:12');
  assert.equal(p2.valid, true);
  assert.equal(p2.raw, '0/2/3:12');
  assert.equal(p2.olt, '0/2/3');
  assert.equal(p2.onu_idx, 12);

  // Common OCR typos: 'l' -> '1', ';' -> ':'
  const p3 = parsePortOlt('1/l/1:5');
  assert.equal(p3.valid, true);
  assert.equal(p3.raw, '1/1/1:5');

  const p4 = parsePortOlt('1/1/1;5');
  assert.equal(p4.valid, true);
  assert.equal(p4.raw, '1/1/1:5');

  // With prefix
  const p5 = parsePortOlt('Port: 1/1/1:10');
  assert.equal(p5.valid, true);
  assert.equal(p5.raw, '1/1/1:10');
  assert.equal(p5.onu_idx, 10);

  const p6 = parsePortOlt('พอร์ต: 0/1/2:8');
  assert.equal(p6.valid, true);
  assert.equal(p6.raw, '0/1/2:8');
  assert.equal(p6.onu_idx, 8);
});

test('Extract Labeled Key-Value Pairs (Thai & English) - extractLabeledPairs', () => {
  const sampleConfigText = `
    PE IP: 172.31.127.166
    CE IP: 17230.143210
    LAN IP: 172.16.255.73
    พอร์ต: 1/1/1:5
    VLAN: 120
    SR Name: SR680854
    Group ID: AP_GRP_01
    ชื่อกลุ่ม: BRM1-Sฆ
  `;

  const pairs = extractLabeledPairs(sampleConfigText);
  assert.ok(pairs.length >= 6);

  const pe = pairs.find((p) => p.varKey === 'pe_ip');
  assert.ok(pe);
  assert.equal(pe.value, '172.31.127.166');

  const ce = pairs.find((p) => p.varKey === 'ce_ip');
  assert.ok(ce);
  assert.equal(ce.value, '172.30.143.210'); // repaired

  const lan = pairs.find((p) => p.varKey === 'lan_ip');
  assert.ok(lan);
  assert.equal(lan.value, '172.16.255.73');

  const port = pairs.find((p) => p.varKey === 'port');
  assert.ok(port);
  assert.equal(port.value, '1/1/1:5');

  const vlan = pairs.find((p) => p.varKey === 'vlan');
  assert.ok(vlan);
  assert.equal(vlan.value, '120');

  const sr = pairs.find((p) => p.varKey === 'sr_ap');
  assert.ok(sr);
  assert.equal(sr.value, 'SR680854');
});

test('Full OCR Post-Processing Pipeline - processOcrText', () => {
  const text = `
    BRM1-S
    172.31.127.165 172.31.127.166 172.16.255.73
    PE IP: 172.31.127.166
    CE IP: 17230.143210
    Port: 1/1/1:5
  `;

  const words = [
    { text: 'PE', confidence: 95 },
    { text: '172.31.127.166', confidence: 92 },
    { text: 'CE', confidence: 88 },
    { text: '17230.143210', confidence: 45 },
  ];

  const result = processOcrText(text, words);
  assert.ok(result.ips.includes('172.31.127.166'));
  assert.ok(result.ips.includes('172.30.143.210'));
  assert.equal(result.ports.length, 1);
  assert.equal(result.ports[0].raw, '1/1/1:5');
  assert.equal(result.autoAssignments['pe_ip'], '172.31.127.166');
  assert.equal(result.autoAssignments['ce_ip'], '172.30.143.210');
  assert.equal(result.autoAssignments['port'], '1/1/1:5');
  assert.equal(result.lowConfidenceWords.length, 1);
  assert.equal(result.lowConfidenceWords[0].text, '17230.143210');
});

test('Data-Type Aware OCR Cleaning - cleanOcrValueByDataType', () => {
  // IP Data Type
  assert.equal(cleanOcrValueByDataType('6 : 192.168.1.1', 'IP', 'pe_ip'), '192.168.1.1');
  assert.equal(cleanOcrValueByDataType('PE IP: 172.31.211.45', 'IP', 'pe_ip'), '172.31.211.45');
  assert.equal(cleanOcrValueByDataType('CE : 172.31.211.46/29', 'IP', 'ce_ip'), '172.31.211.46');
  assert.equal(cleanOcrValueByDataType('Lan: 172.17.166.89/29', 'IP', 'lan_ip'), '172.17.166.89');
  assert.equal(cleanOcrValueByDataType('172.17.166.90/29', 'IP', 'lan_ip_1'), '172.17.166.90');
  assert.equal(cleanOcrValueByDataType('17230.143210', 'IP', 'ce_ip'), '172.30.143.210');

  // Number Data Type
  assert.equal(cleanOcrValueByDataType('vlan204', 'Number', 'vlan'), '204');
  assert.equal(cleanOcrValueByDataType('Vlan214', 'Number', 'user_vlan'), '214');
  assert.equal(cleanOcrValueByDataType('VLAN : 204', 'Number', 'vlan'), '204');
  assert.equal(cleanOcrValueByDataType('ONU: 5', 'Number', 'onu_idx'), '5');
  assert.equal(cleanOcrValueByDataType('24,700', 'Number', 'count'), '24700');
  assert.equal(cleanOcrValueByDataType('Total: 67', 'Number', 'number_var'), '67');

  // Port Data Type
  assert.equal(cleanOcrValueByDataType('Port: 1/1/1:5', 'Port', 'port'), '1/1/1:5');
  assert.equal(cleanOcrValueByDataType('OLT: 1/1/1:1', 'Port', 'olt'), '1/1/1:1');
  assert.equal(cleanOcrValueByDataType('Te0/0/4', 'Port', 'port'), 'Te0/0/4');

  // String Data Type
  assert.equal(cleanOcrValueByDataType('SR NO: SR701234', 'String', 'sr_ap'), 'SR701234');
  assert.equal(cleanOcrValueByDataType('Location: หมู่ 5 โนนนาก', 'String', 'location'), 'หมู่ 5 โนนนาก');
});

