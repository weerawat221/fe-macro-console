// networkConfigOcr.js
// Specialized Network Configuration Parser & Validator for OCR Pipelines.
// Handles IPv4 validation, dropped-dot repair, Port/OLT pattern parsing,
// and Thai/English label-value pair extraction.

/**
 * Validates whether a string is a strictly valid IPv4 address (0-255 per octet).
 * @param {string} ip
 * @returns {boolean}
 */
function isValidIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

/**
 * Recursively partitions an unbroken numeric string into N valid octets (<= 255).
 * Prioritizes standard network prefix headers (192.168, 172.16-31, 100.x, 10.x, 169.254).
 */
function splitToValidOctets(str, count = 4, isFirst = true) {
  if (count === 1) {
    if (str.length >= 1 && str.length <= 3) {
      if (str.length > 1 && str.startsWith('0')) return null;
      const num = parseInt(str, 10);
      return num <= 255 ? [str] : null;
    }
    return null;
  }

  // Priority length checks based on prefix
  let tryLengths = [3, 2, 1];
  if (isFirst) {
    if (str.startsWith('192168') && str.length >= 8) {
      const rest = splitToValidOctets(str.slice(6), 2, false);
      if (rest) return ['192', '168', ...rest];
    }
    if (str.startsWith('172') || str.startsWith('192') || str.startsWith('100') || str.startsWith('169')) {
      tryLengths = [3, 2, 1];
    } else if (str.startsWith('10')) {
      tryLengths = [2, 3, 1];
    }
  }

  for (const len of tryLengths) {
    if (len > str.length - count + 1) continue;
    const part = str.slice(0, len);
    if (part.length > 1 && part.startsWith('0')) continue;
    const num = parseInt(part, 10);
    if (num <= 255) {
      const rest = splitToValidOctets(str.slice(len), count - 1, false);
      if (rest) return [part, ...rest];
    }
  }
  return null;
}

/**
 * Normalizes and repairs common OCR misrecognitions in IPv4 strings.
 * Handles dropped dots, colon/comma substitutions, and glued digits (e.g. 17230.143210 -> 172.30.143.210).
 * @param {string} raw
 * @returns {string}
 */
function repairIpv4(raw) {
  if (!raw) return '';
  let str = String(raw).trim();

  // Strip label prefix (e.g. "PE IP: 172.31.127.166", "CE IP - 172.30.143.210", "ไอพี: 10.0.0.1")
  str = str.replace(/^[A-Za-z\u0E00-\u0E7F\s()_]+[:=\-–]\s*/i, '');
  str = str.replace(/^(?:PE\s*IP|CE\s*IP|LAN\s*IP|PE|CE|LAN|IP|Gateway|ไอพี|พอร์ต)\s*[:=\-–]?\s*/i, '');

  // Strip CIDR suffix (e.g. "/29", "/24")
  str = str.replace(/\/\d{1,2}$/, '');

  // Replace common dot substitutes: comma, colon, semicolon, spaces between digits
  str = str.replace(/[,;:]/g, '.').replace(/\s+/g, '');

  // If already perfectly valid IPv4, return it directly
  if (isValidIpv4(str)) {
    return str;
  }

  // If entirely numeric string without dots (e.g. 100120101, 19216811, 17231127166)
  if (/^\d{8,12}$/.test(str)) {
    const partitioned = splitToValidOctets(str, 4, true);
    if (partitioned && partitioned.length === 4) {
      return partitioned.join('.');
    }
  }

  const chunks = str.split('.').filter(Boolean);
  let octets = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const num = parseInt(chunk, 10);

    // If chunk is single valid octet
    if (chunk.length <= 3 && num >= 0 && num <= 255) {
      octets.push(chunk);
      continue;
    }

    // Handle chunk with missing dots (length > 3 or num > 255)
    // 1. Check known prefixes (172, 192, 100, 10, 169) at the beginning of IP
    if (octets.length === 0) {
      if (chunk.startsWith('172') && chunk.length >= 4) {
        octets.push('172');
        const rest = chunk.slice(3);
        if (parseInt(rest, 10) <= 255) octets.push(rest);
        else chunks.splice(i + 1, 0, rest);
        continue;
      }
      if (chunk.startsWith('192168') && chunk.length >= 6) {
        octets.push('192', '168');
        const rest = chunk.slice(6);
        if (rest) chunks.splice(i + 1, 0, rest);
        continue;
      }
      if (chunk.startsWith('192') && chunk.length >= 4) {
        octets.push('192');
        const rest = chunk.slice(3);
        if (parseInt(rest, 10) <= 255) octets.push(rest);
        else chunks.splice(i + 1, 0, rest);
        continue;
      }
      if (chunk.startsWith('100') && chunk.length >= 4) {
        octets.push('100');
        const rest = chunk.slice(3);
        if (parseInt(rest, 10) <= 255) octets.push(rest);
        else chunks.splice(i + 1, 0, rest);
        continue;
      }
      if (chunk.startsWith('10') && chunk.length >= 3) {
        octets.push('10');
        const rest = chunk.slice(2);
        if (parseInt(rest, 10) <= 255) octets.push(rest);
        else chunks.splice(i + 1, 0, rest);
        continue;
      }
    }

    // 2. Decompose 6-digit chunk into two 3-digit octets (e.g. 143210 -> 143, 210)
    if (chunk.length === 6) {
      const o1 = chunk.slice(0, 3);
      const o2 = chunk.slice(3);
      if (parseInt(o1, 10) <= 255 && parseInt(o2, 10) <= 255) {
        octets.push(o1, o2);
        continue;
      }
    }

    // 3. Decompose 5-digit chunk (e.g. 17230 -> 172, 30 OR 25514 -> 255, 14 OR 12716 -> 127, 16)
    if (chunk.length === 5) {
      const a1 = chunk.slice(0, 3);
      const a2 = chunk.slice(3);
      if (parseInt(a1, 10) <= 255 && parseInt(a2, 10) <= 255) {
        octets.push(a1, a2);
        continue;
      }
      const b1 = chunk.slice(0, 2);
      const b2 = chunk.slice(2);
      if (parseInt(b1, 10) <= 255 && parseInt(b2, 10) <= 255) {
        octets.push(b1, b2);
        continue;
      }
    }

    // 4. Decompose 4-digit chunk (e.g. 1271 -> 127, 1 OR 1010 -> 10, 10)
    if (chunk.length === 4) {
      if (octets.length === 2) {
        const c1 = chunk.slice(0, 3);
        const c2 = chunk.slice(3);
        if (parseInt(c1, 10) <= 255 && parseInt(c2, 10) <= 255) {
          octets.push(c1, c2);
          continue;
        }
        const d1 = chunk.slice(0, 2);
        const d2 = chunk.slice(2);
        if (parseInt(d1, 10) <= 255 && parseInt(d2, 10) <= 255) {
          octets.push(d1, d2);
          continue;
        }
        const e1 = chunk.slice(0, 1);
        const e2 = chunk.slice(1);
        if (parseInt(e1, 10) <= 255 && parseInt(e2, 10) <= 255) {
          octets.push(e1, e2);
          continue;
        }
      } else {
        const d1 = chunk.slice(0, 2);
        const d2 = chunk.slice(2);
        if (parseInt(d1, 10) <= 255 && parseInt(d2, 10) <= 255) {
          octets.push(d1, d2);
          continue;
        }
        const c1 = chunk.slice(0, 3);
        const c2 = chunk.slice(3);
        if (parseInt(c1, 10) <= 255 && parseInt(c2, 10) <= 255) {
          octets.push(c1, c2);
          continue;
        }
      }
    }

    octets.push(chunk);
  }

  // Final check: if 4 valid octets were formed
  if (octets.length === 4 && octets.every((o) => /^\d+$/.test(o) && parseInt(o, 10) <= 255)) {
    return octets.join('.');
  }

  return raw.trim();
}

/**
 * Extracts all IPv4 addresses found in a text block, repairing dropped dots.
 * @param {string} text
 * @returns {string[]}
 */
function extractIps(text) {
  if (!text) return [];
  const found = new Set();

  // 1. Look for explicit standard IPs
  const explicitMatches = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g) || [];
  explicitMatches.forEach((m) => {
    const repaired = repairIpv4(m);
    if (isValidIpv4(repaired)) found.add(repaired);
  });

  // 2. Scan individual tokens and lines for glued/damaged IP sequences
  const tokens = text.split(/[\s,;|\n]+/);
  tokens.forEach((token) => {
    if (token.length >= 7 && /\d/.test(token)) {
      const candidate = repairIpv4(token);
      if (isValidIpv4(candidate)) {
        found.add(candidate);
      }
    }
  });

  return Array.from(found);
}

/**
 * Parses Port / OLT string in slot/card/port:onu_idx format (e.g. "1/1/1:5", "0/2/3:12", "1/1/1").
 * @param {string} raw
 * @returns {{ raw: string, olt: string, onu_idx: number | null, valid: boolean }}
 */
function parsePortOlt(raw) {
  if (!raw) return { raw: '', olt: '', onu_idx: null, valid: false };
  let str = String(raw).trim();

  // Strip label prefix (e.g. "Port: 1/1/1:5", "พอร์ต: 1/1/1:5", "OLT Port - 0/2/1:10")
  str = str.replace(/^(?:Port\s*OLT|Port|OLT|พอร์ต)\s*[:=\-–]?\s*/i, '');

  // Fix common OCR typos in port strings:
  // - Letter 'l', 'I', '|' -> '1'
  // - Semicolon or dash before onu_idx -> colon
  str = str
    .replace(/[;–—\-]/g, ':')
    .replace(/([0-9/])[lI|]([0-9/])/g, '$11$2')
    .replace(/^[lI|]\//, '1/')
    .replace(/\s+/g, '');

  // Match slot/card/port:onu_idx
  const matchFull = str.match(/^(\d+\/\d+\/\d+):(\d+)$/);
  if (matchFull) {
    return {
      raw: `${matchFull[1]}:${matchFull[2]}`,
      olt: matchFull[1],
      onu_idx: parseInt(matchFull[2], 10),
      valid: true,
    };
  }

  // Match slot/card/port without onu_idx
  const matchOltOnly = str.match(/^(\d+\/\d+\/\d+)$/);
  if (matchOltOnly) {
    return {
      raw: matchOltOnly[1],
      olt: matchOltOnly[1],
      onu_idx: null,
      valid: true,
    };
  }

  return { raw: str, olt: '', onu_idx: null, valid: false };
}

/**
 * Extracts all Port/OLT occurrences in text.
 * @param {string} text
 * @returns {{ raw: string, olt: string, onu_idx: number | null }[]}
 */
function extractPorts(text) {
  if (!text) return [];
  const results = [];
  const tokens = text.split(/[\s,;|\n]+/);

  tokens.forEach((token) => {
    const parsed = parsePortOlt(token);
    if (parsed.valid) {
      results.push({
        raw: parsed.raw,
        olt: parsed.olt,
        onu_idx: parsed.onu_idx,
      });
    }
  });

  return results;
}

/** Known label definitions for Thai and English network config tokens */
const LABEL_PATTERNS = [
  { key: 'pe_ip', regex: /(?:^|\b)(?:PE\s*IP|PE(?:\s*Address)?|พีอี(?:\s*ไอพี)?)\s*[:=\-–]\s*([0-9.,:;\s]+)/i },
  { key: 'ce_ip', regex: /(?:^|\b)(?:CE\s*IP|CE(?:\s*Address)?|ซีอี(?:\s*ไอพี)?|66\s*:|C6\s*:)\s*[:=\-–]\s*([0-9.,:;\s]+)/i },
  { key: 'vlan', regex: /(?:^|\b)(?:VLAN(?:\s*ID)?|วีแลน)\s*[:=\-–]\s*(\d{1,4})/i },
  { key: 'lan_ip', regex: /(?:^|\b)(?:LAN\s*IP|\bLAN\b|Gateway|แลน(?:\s*ไอพี)?|เกตเวย์)\s*[:=\-–]\s*([0-9.,:;\s]+)/i },
  { key: 'stelnet_ip', regex: /(?:^|\b)(?:Stelnet\s*IP|Stelnet)\s*[:=\-–]\s*([0-9.,:;\s]+)/i },
  { key: 'port', regex: /(?:^|\b)(?:Port(?:\s*OLT)?|OLT(?:\s*Port)?|พอร์ต)\s*[:=\-–]\s*([0-9/lI|:;\-–\s]+)/i },
  { key: 'sr_ap', regex: /(?:^|\b)(?:SR\s*(?:Name|AP)?|Service\s*Request)\s*[:=\-–]\s*([A-Za-z0-9_\-]+)/i },
  { key: 'group_id', regex: /(?:^|\b)(?:Group\s*ID|ID\s*\(AP\)|รหัสกลุ่ม)\s*[:=\-–]\s*([A-Za-z0-9_\-]+)/i },
  { key: 'group_name', regex: /(?:^|\b)(?:Group\s*Name|ชื่อกลุ่ม)\s*[:=\-–]\s*([A-Za-z0-9_\-\u0E00-\u0E7F\s]+)/i },
  { key: 'captcha', regex: /(?:^|\b)(?:Captcha|Login\s*Code|รหัสยืนยัน)\s*[:=\-–]\s*([A-Za-z0-9]+)/i },
];

/**
 * Extracts labeled key-value pairs from text (e.g. "PE IP: 172.31.127.166", "พอร์ต: 1/1/1:5").
 * @param {string} text
 * @returns {{ label: string, value: string, varKey?: string }[]}
 */
function extractLabeledPairs(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const pairs = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    for (const pat of LABEL_PATTERNS) {
      const match = trimmed.match(pat.regex);
      if (match && match[1]) {
        let val = match[1].trim();

        // Clean values according to type
        if (pat.key.includes('ip')) {
          val = repairIpv4(val);
        } else if (pat.key === 'port') {
          const p = parsePortOlt(val);
          if (p.valid) val = p.raw;
        }

        pairs.push({
          label: pat.key.toUpperCase().replace(/_/g, ' '),
          value: val,
          varKey: pat.key,
        });
        break;
      }
    }
  });

  return pairs;
}

/**
 * Complete OCR post-processing pipeline.
 * @param {string} rawText
 * @param {Array<{ text: string, confidence: number }>} words
 * @returns {{
 *   rawText: string,
 *   ips: string[],
 *   ports: { raw: string, olt: string, onu_idx: number | null }[],
 *   labeledPairs: { label: string, value: string, varKey?: string }[],
 *   autoAssignments: Record<string, string>,
 *   lowConfidenceWords: { text: string, confidence: number }[]
 * }}
 */
function processOcrText(rawText, words = []) {
  const text = rawText || '';
  const ips = extractIps(text);
  const ports = extractPorts(text);
  const labeledPairs = extractLabeledPairs(text);

  const autoAssignments = {};
  labeledPairs.forEach((pair) => {
    if (pair.varKey && pair.value) {
      autoAssignments[pair.varKey] = pair.value;
    }
  });

  // Track words with confidence < 60
  const lowConfidenceWords = (words || []).filter((w) => typeof w.confidence === 'number' && w.confidence < 60);

  return {
    rawText: text,
    ips,
    ports,
    labeledPairs,
    autoAssignments,
    lowConfidenceWords,
  };
}

/**
 * Cleans and extracts the relevant portion of an OCR string based on the variable's dataType and key.
 * @param {string} rawText
 * @param {string} [dataType='String'] - 'IP' | 'Port' | 'Number' | 'String'
 * @param {string} [varKey=''] - optional variable key for extra heuristic hints (e.g. 'vlan', 'lan_ip')
 * @returns {string}
 */
function cleanOcrValueByDataType(rawText, dataType = 'String', varKey = '') {
  if (rawText === undefined || rawText === null) return '';
  let str = String(rawText).trim();
  if (!str) return '';

  const dt = (dataType || 'String').toLowerCase();
  const k = (varKey || '').toLowerCase();

  // 1. DATA TYPE: STRING (Do not cut or strip anything for string variables)
  if (dt === 'string') {
    return str;
  }

  // 2. DATA TYPE: NUMBER (or variable key matches number/vlan/onu heuristics)
  if (dt === 'number' || k.includes('vlan') || k.includes('onu_idx') || k.includes('idx') || k.includes('count') || k.includes('num')) {
    // Remove thousand separators (e.g. "24,700" -> "24700")
    const withoutCommas = str.replace(/,/g, '');
    // Extract first integer or floating number
    const numMatch = withoutCommas.match(/-?\d+(?:\.\d+)?/);
    if (numMatch) {
      return numMatch[0];
    }
    return str;
  }

  // 3. DATA TYPE: PORT (or variable key matches port/olt heuristics)
  if (dt === 'port' || k.includes('port') || k.includes('olt') || k.includes('interface') || k.includes('slot')) {
    // Strip leading label prefix like "PORT: ", "OLT: ", "INTERFACE: "
    let stripped = str.replace(/^(?:PORT|OLT|INTERFACE|INT|SLOT|PON)\s*[:=\-–]?\s*/i, '');
    const p = parsePortOlt(stripped);
    if (p.valid) {
      return p.raw;
    }
    const pOrig = parsePortOlt(str);
    if (pOrig.valid) {
      return pOrig.raw;
    }
    return stripped || str;
  }

  // 4. DATA TYPE: IP (or variable key matches IP heuristics)
  if (dt === 'ip' || (!k.includes('vlan') && (k.includes('ip') || k.startsWith('pe') || k.startsWith('ce') || k.startsWith('lan') || k.includes('stelnet')))) {
    // Check if string contains a standard IPv4 address (possibly surrounded by garbage e.g. "6 : 192.168.1.1", "PE IP: 10.0.0.1/24", "Lan: 172.17.166.89/29")
    const ipMatch = str.match(/(?:^|[^\d.])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\/\d{1,2})?(?:[^\d.]|$)/);
    if (ipMatch && isValidIpv4(ipMatch[1])) {
      return ipMatch[1];
    }

    // Try stripping leading label prefix and running repairIpv4
    let stripped = str.replace(/^[^\d\n]*\d{0,3}\s*[:=\-–]\s*/i, '');
    let repaired = repairIpv4(stripped);
    if (isValidIpv4(repaired)) {
      return repaired;
    }

    // Fallback: try repairIpv4 on the original string
    repaired = repairIpv4(str);
    if (isValidIpv4(repaired)) {
      return repaired;
    }

    // Fallback 2: try extractIps
    const ips = extractIps(str);
    if (ips.length > 0) {
      return ips[0];
    }

    return repaired || str;
  }

  return str;
}

export {
  isValidIpv4,
  repairIpv4,
  extractIps,
  parsePortOlt,
  extractPorts,
  extractLabeledPairs,
  cleanOcrValueByDataType,
  processOcrText,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isValidIpv4,
    repairIpv4,
    extractIps,
    parsePortOlt,
    extractPorts,
    extractLabeledPairs,
    cleanOcrValueByDataType,
    processOcrText,
  };
}

