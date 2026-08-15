// formulaEngine.js
// Custom Lexer, AST Parser, Safe Whitelisted Evaluator, Type Validators,
// Dependency Graph Cycle Detector, and Reactive Cascade Calculation Engine for Variables.
// Strictly avoids eval() and new Function().

/**
 * Token types for formula lexing.
 */
const TokenType = {
  IDENTIFIER: 'IDENTIFIER',
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  OPERATOR: 'OPERATOR',
  ASSIGN: 'ASSIGN',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  COMMA: 'COMMA',
  DOT: 'DOT',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
};

const KEYWORDS = new Set(['toint', 'tostring', 'split', 'mod']);

/**
 * Tokenizes formula code into token stream with line & column tracking.
 * @param {string} source
 * @returns {Array<{ type: string, value: any, line: number, col: number }>}
 */
function tokenizeFormula(source) {
  if (typeof source !== 'string') return [];
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  while (i < source.length) {
    const ch = source[i];

    // Single-line comment // ...
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Newlines
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      tokens.push({ type: TokenType.NEWLINE, value: '\n', line, col });
      line++;
      col = 1;
      i++;
      continue;
    }

    // Whitespace
    if (ch === ' ' || ch === '\t') {
      i++;
      col++;
      continue;
    }

    // Braces, Parens, Brackets, Punctuation
    if (ch === '{') { tokens.push({ type: TokenType.LBRACE, value: '{', line, col }); i++; col++; continue; }
    if (ch === '}') { tokens.push({ type: TokenType.RBRACE, value: '}', line, col }); i++; col++; continue; }
    if (ch === '(') { tokens.push({ type: TokenType.LPAREN, value: '(', line, col }); i++; col++; continue; }
    if (ch === ')') { tokens.push({ type: TokenType.RPAREN, value: ')', line, col }); i++; col++; continue; }
    if (ch === '[') { tokens.push({ type: TokenType.LBRACKET, value: '[', line, col }); i++; col++; continue; }
    if (ch === ']') { tokens.push({ type: TokenType.RBRACKET, value: ']', line, col }); i++; col++; continue; }
    if (ch === ',') { tokens.push({ type: TokenType.COMMA, value: ',', line, col }); i++; col++; continue; }
    if (ch === '.') { tokens.push({ type: TokenType.DOT, value: '.', line, col }); i++; col++; continue; }
    if (ch === '=') { tokens.push({ type: TokenType.ASSIGN, value: '=', line, col }); i++; col++; continue; }

    // Arithmetic operators: +, -, *, /
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: TokenType.OPERATOR, value: ch, line, col });
      i++;
      col++;
      continue;
    }

    // String literals: "..."
    if (ch === '"') {
      const startLine = line;
      const startCol = col;
      i++;
      col++;
      let strVal = '';
      let closed = false;

      while (i < source.length) {
        const sc = source[i];
        if (sc === '\\') {
          if (i + 1 < source.length) {
            const next = source[i + 1];
            if (next === '"') strVal += '"';
            else if (next === '\\') strVal += '\\';
            else if (next === 'n') strVal += '\n';
            else if (next === 't') strVal += '\t';
            else strVal += next;
            i += 2;
            col += 2;
            continue;
          }
        }
        if (sc === '"') {
          closed = true;
          i++;
          col++;
          break;
        }
        if (sc === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
        strVal += sc;
        i++;
      }

      if (!closed) {
        throw new Error(`Syntax error (Line ${startLine}, Col ${startCol}): Unclosed string literal`);
      }

      tokens.push({ type: TokenType.STRING, value: strVal, line: startLine, col: startCol });
      continue;
    }

    // Number literals: 0-9
    if (/[0-9]/.test(ch)) {
      const startLine = line;
      const startCol = col;
      let numStr = '';
      while (i < source.length && /[0-9]/.test(source[i])) {
        numStr += source[i];
        i++;
        col++;
      }
      tokens.push({ type: TokenType.NUMBER, value: parseInt(numStr, 10), line: startLine, col: startCol });
      continue;
    }

    // Identifiers and mod keyword
    if (/[a-zA-Z_\u0E00-\u0E7F]/.test(ch)) {
      const startLine = line;
      const startCol = col;
      let ident = '';
      while (i < source.length && /[a-zA-Z0-9_\u0E00-\u0E7F]/.test(source[i])) {
        ident += source[i];
        i++;
        col++;
      }

      if (ident === 'mod') {
        tokens.push({ type: TokenType.OPERATOR, value: 'mod', line: startLine, col: startCol });
      } else {
        tokens.push({ type: TokenType.IDENTIFIER, value: ident, line: startLine, col: startCol });
      }
      continue;
    }

    // Semicolons treated as newlines
    if (ch === ';') {
      tokens.push({ type: TokenType.NEWLINE, value: '\n', line, col });
      i++;
      col++;
      continue;
    }

    throw new Error(`Syntax error (Line ${line}, Col ${col}): Unexpected character '${ch}'`);
  }

  tokens.push({ type: TokenType.EOF, value: '', line, col });
  return tokens;
}

/**
 * AST Node Types
 */
const NodeType = {
  PROGRAM: 'PROGRAM',
  ASSIGNMENT: 'ASSIGNMENT',
  BINARY_EXPR: 'BINARY_EXPR',
  NUMBER_LITERAL: 'NUMBER_LITERAL',
  STRING_LITERAL: 'STRING_LITERAL',
  VARIABLE_REF: 'VARIABLE_REF',
  ARRAY_ELEMENT_REF: 'ARRAY_ELEMENT_REF',
  FUNCTION_CALL: 'FUNCTION_CALL',
  SPLIT_CALL: 'SPLIT_CALL',
};

/**
 * Parses token stream into AST and verifies formula rules.
 * @param {string} source
 * @param {string} [targetVarKey]
 * @returns {{ type: string, statements: Array<any> }}
 */
function parseFormula(source, targetVarKey = null) {
  const rawTokens = tokenizeFormula(source);
  let pos = 0;

  function peek() {
    return rawTokens[pos] || { type: TokenType.EOF, value: '', line: 0, col: 0 };
  }

  function consume(expectedType = null, expectedVal = null) {
    const t = peek();
    if (expectedType && t.type !== expectedType) {
      throw new Error(`Syntax error (Line ${t.line}, Col ${t.col}): Expected ${expectedType} but got '${t.value || t.type}'`);
    }
    if (expectedVal && t.value !== expectedVal) {
      throw new Error(`Syntax error (Line ${t.line}, Col ${t.col}): Expected '${expectedVal}' but got '${t.value}'`);
    }
    pos++;
    return t;
  }

  function skipNewlines() {
    while (peek().type === TokenType.NEWLINE) {
      pos++;
    }
  }

  skipNewlines();

  // Enforce outer { ... } block
  if (peek().type !== TokenType.LBRACE) {
    const t = peek();
    throw new Error(`Syntax error (Line ${t.line}, Col ${t.col}): Formula must begin with '{'`);
  }
  consume(TokenType.LBRACE);

  const statements = [];

  while (pos < rawTokens.length) {
    skipNewlines();
    if (peek().type === TokenType.RBRACE) {
      break;
    }
    if (peek().type === TokenType.EOF) {
      throw new Error(`Syntax error: Missing closing '}' for formula block`);
    }

    const stmt = parseStatement();
    statements.push(stmt);
    skipNewlines();
  }

  consume(TokenType.RBRACE);
  skipNewlines();

  if (peek().type !== TokenType.EOF) {
    const t = peek();
    throw new Error(`Syntax error (Line ${t.line}, Col ${t.col}): Unexpected tokens after formula closing '}'`);
  }

  if (statements.length === 0) {
    throw new Error(`Formula error: Formula must contain at least 1 assignment statement`);
  }

  // Enforce rule: The last statement must assign to targetVarKey (if provided)
  if (targetVarKey) {
    const lastStmt = statements[statements.length - 1];
    if (!lastStmt || lastStmt.type !== NodeType.ASSIGNMENT || lastStmt.targetType !== 'IDENTIFIER' || lastStmt.targetName !== targetVarKey) {
      throw new Error(`Formula error: บรรทัดสุดท้ายของสูตรต้องกำหนดค่าให้กับตัวแปร '${targetVarKey}'`);
    }
  }

  return { type: NodeType.PROGRAM, statements };

  function parseStatement() {
    // Every statement MUST be an assignment: target = expression
    const startTok = peek();
    if (startTok.type !== TokenType.IDENTIFIER) {
      throw new Error(`Syntax error (Line ${startTok.line}, Col ${startTok.col}): Every line must be an assignment (e.g. target = expression)`);
    }

    const identTok = consume(TokenType.IDENTIFIER);
    let targetType = 'IDENTIFIER';
    let targetName = identTok.value;
    let indexExpr = null;

    // Check array target: array[] = ... or array[idx] = ...
    if (peek().type === TokenType.LBRACKET) {
      consume(TokenType.LBRACKET);
      if (peek().type === TokenType.RBRACKET) {
        consume(TokenType.RBRACKET);
        targetType = 'ARRAY_APPEND'; // array[] = ...
      } else {
        indexExpr = parseExpression();
        consume(TokenType.RBRACKET);
        targetType = 'ARRAY_ELEMENT'; // array[index] = ...
      }
    }

    if (peek().type !== TokenType.ASSIGN) {
      const t = peek();
      throw new Error(`Syntax error (Line ${t.line}, Col ${t.col}): Every line must be an assignment (e.g. target = expression). Missing '=' after '${targetName}'`);
    }
    consume(TokenType.ASSIGN);

    const expr = parseExpression();

    return {
      type: NodeType.ASSIGNMENT,
      targetType,
      targetName,
      indexExpr,
      valueExpr: expr,
      line: startTok.line,
      col: startTok.col,
    };
  }

  function parseExpression() {
    return parseAdditionSubtraction();
  }

  function parseAdditionSubtraction() {
    let left = parseMultiplicationDivision();

    while (peek().type === TokenType.OPERATOR && (peek().value === '+' || peek().value === '-')) {
      const opTok = consume(TokenType.OPERATOR);
      const right = parseMultiplicationDivision();
      left = {
        type: NodeType.BINARY_EXPR,
        operator: opTok.value,
        left,
        right,
        line: opTok.line,
        col: opTok.col,
      };
    }
    return left;
  }

  function parseMultiplicationDivision() {
    let left = parsePrimary();

    while (peek().type === TokenType.OPERATOR && (peek().value === '*' || peek().value === '/' || peek().value === 'mod')) {
      const opTok = consume(TokenType.OPERATOR);
      const right = parsePrimary();
      left = {
        type: NodeType.BINARY_EXPR,
        operator: opTok.value,
        left,
        right,
        line: opTok.line,
        col: opTok.col,
      };
    }
    return left;
  }

  function parsePrimary() {
    const t = peek();

    // Number literal
    if (t.type === TokenType.NUMBER) {
      consume(TokenType.NUMBER);
      return { type: NodeType.NUMBER_LITERAL, value: t.value, line: t.line, col: t.col };
    }

    // String literal
    if (t.type === TokenType.STRING) {
      consume(TokenType.STRING);
      return { type: NodeType.STRING_LITERAL, value: t.value, line: t.line, col: t.col };
    }

    // Parenthesized expression: ( expr )
    if (t.type === TokenType.LPAREN) {
      consume(TokenType.LPAREN);
      const inner = parseExpression();
      consume(TokenType.RPAREN);
      return inner;
    }

    // Function calls: toint(expr), tostring(expr)
    if (t.type === TokenType.IDENTIFIER && (t.value === 'toint' || t.value === 'tostring')) {
      const fnName = consume(TokenType.IDENTIFIER).value;
      consume(TokenType.LPAREN);
      const arg = parseExpression();
      consume(TokenType.RPAREN);
      return { type: NodeType.FUNCTION_CALL, name: fnName, argument: arg, line: t.line, col: t.col };
    }

    // Identifiers: var, var.split(":", idx?), array[idx]
    if (t.type === TokenType.IDENTIFIER) {
      const identName = consume(TokenType.IDENTIFIER).value;

      // Method call: var.split("sep", index?)
      if (peek().type === TokenType.DOT) {
        consume(TokenType.DOT);
        const methodTok = consume(TokenType.IDENTIFIER);
        if (methodTok.value !== 'split') {
          throw new Error(`Syntax error (Line ${methodTok.line}, Col ${methodTok.col}): Unknown method '.${methodTok.value}'. Only '.split()' is supported.`);
        }
        consume(TokenType.LPAREN);
        const sepExpr = parseExpression();
        let idxExpr = null;
        if (peek().type === TokenType.COMMA) {
          consume(TokenType.COMMA);
          idxExpr = parseExpression();
        }
        consume(TokenType.RPAREN);
        return {
          type: NodeType.SPLIT_CALL,
          targetVar: identName,
          separatorExpr: sepExpr,
          indexExpr: idxExpr,
          line: t.line,
          col: t.col,
        };
      }

      // Array element access: arr[index]
      if (peek().type === TokenType.LBRACKET) {
        consume(TokenType.LBRACKET);
        const arrIdx = parseExpression();
        consume(TokenType.RBRACKET);
        return {
          type: NodeType.ARRAY_ELEMENT_REF,
          arrayName: identName,
          indexExpr: arrIdx,
          line: t.line,
          col: t.col,
        };
      }

      // Plain variable reference
      return { type: NodeType.VARIABLE_REF, name: identName, line: t.line, col: t.col };
    }

    throw new Error(`Syntax error (Line ${t.line}, Col ${t.col}): Unexpected token '${t.value || t.type}' in expression`);
  }
}

/**
 * Whitelisted Evaluator for Formula AST.
 * @param {{ type: string, statements: Array<any> }} ast
 * @param {Record<string, any>} env
 * @param {string} targetVarKey
 * @returns {string | number}
 */
function evaluateFormulaAst(ast, env = {}, targetVarKey = null) {
  if (!ast || !Array.isArray(ast.statements)) {
    throw new Error('Formula error: Invalid AST structure');
  }

  const scope = {};

  function evalNode(node) {
    if (!node) return '';

    switch (node.type) {
      case NodeType.NUMBER_LITERAL:
        return node.value;

      case NodeType.STRING_LITERAL:
        return node.value;

      case NodeType.VARIABLE_REF: {
        const name = node.name;
        if (scope[name] !== undefined) return scope[name];
        if (env[name] !== undefined) return env[name];
        return '';
      }

      case NodeType.ARRAY_ELEMENT_REF: {
        const arrName = node.arrayName;
        const arr = scope[arrName];
        if (!Array.isArray(arr)) {
          throw new Error(`Formula error (Line ${node.line}): '${arrName}' is not an array`);
        }
        const idx = evalNode(node.indexExpr);
        const numIdx = typeof idx === 'number' ? idx : parseInt(String(idx), 10);
        if (Number.isNaN(numIdx) || numIdx < 0 || numIdx >= arr.length) {
          throw new Error(`Formula error (Line ${node.line}): Array index ${idx} out of bounds (array length: ${arr.length})`);
        }
        return arr[numIdx];
      }

      case NodeType.FUNCTION_CALL: {
        const argVal = evalNode(node.argument);
        if (node.name === 'toint') {
          if (typeof argVal === 'number') return Math.trunc(argVal);
          const s = String(argVal !== undefined && argVal !== null ? argVal : '').trim();
          if (!/^-?\d+$/.test(s)) {
            throw new Error(`Formula error (Line ${node.line}): toint() ล้มเหลว — '${s}' ไม่ใช่ตัวเลขที่ถูกต้อง`);
          }
          return parseInt(s, 10);
        }
        if (node.name === 'tostring') {
          return String(argVal !== undefined && argVal !== null ? argVal : '');
        }
        throw new Error(`Formula error (Line ${node.line}): Unknown function '${node.name}'`);
      }

      case NodeType.SPLIT_CALL: {
        const varName = node.targetVar;
        const rawSource = scope[varName] !== undefined ? scope[varName] : (env[varName] !== undefined ? env[varName] : '');
        const strVal = String(rawSource !== undefined && rawSource !== null ? rawSource : '');
        const sep = String(evalNode(node.separatorExpr));

        if (!sep) {
          throw new Error(`Formula error (Line ${node.line}): Separator cannot be empty`);
        }

        if (!strVal.includes(sep)) {
          throw new Error(`Formula error: ไม่พบตัวคั่น '${sep}' ในค่าของ ${varName}`);
        }

        const parts = strVal.split(sep);

        if (node.indexExpr) {
          const rawIdx = evalNode(node.indexExpr);
          const idx = typeof rawIdx === 'number' ? rawIdx : parseInt(String(rawIdx), 10);
          if (Number.isNaN(idx) || idx < 0 || idx >= parts.length) {
            throw new Error(`Formula error: split('${sep}', ${rawIdx}) — index เกินขอบเขต (ผลลัพธ์มีแค่ ${parts.length} ส่วน: index 0-${parts.length - 1})`);
          }
          return parts[idx];
        }

        return parts;
      }

      case NodeType.BINARY_EXPR: {
        const leftVal = evalNode(node.left);
        const rightVal = evalNode(node.right);
        const op = node.operator;

        // Operator +: string concatenation if any operand is string, otherwise addition
        if (op === '+') {
          if (typeof leftVal === 'string' || typeof rightVal === 'string') {
            return String(leftVal !== undefined && leftVal !== null ? leftVal : '') +
                   String(rightVal !== undefined && rightVal !== null ? rightVal : '');
          }
          return leftVal + rightVal;
        }

        // Operators -, *, /, mod: strict numbers only
        if (typeof leftVal !== 'number' || typeof rightVal !== 'number') {
          throw new Error(`Formula error: ตัวดำเนินการ '${op}' ใช้ได้กับตัวเลขเท่านั้น กรุณาใช้ toint(...)`);
        }

        if (op === '-') return leftVal - rightVal;
        if (op === '*') return leftVal * rightVal;
        if (op === '/') {
          if (rightVal === 0) throw new Error(`Formula error: ไม่สามารถหารด้วย 0 ได้`);
          return Math.trunc(leftVal / rightVal);
        }
        if (op === 'mod') {
          if (rightVal === 0) throw new Error(`Formula error: ไม่สามารถหาร (mod) ด้วย 0 ได้`);
          return leftVal % rightVal;
        }

        throw new Error(`Formula error (Line ${node.line}): Unknown operator '${op}'`);
      }

      default:
        throw new Error(`Formula error: Unknown node type '${node.type}'`);
    }
  }

  for (const stmt of ast.statements) {
    if (stmt.type === NodeType.ASSIGNMENT) {
      const val = evalNode(stmt.valueExpr);
      if (stmt.targetType === 'ARRAY_APPEND') {
        if (!Array.isArray(scope[stmt.targetName])) {
          scope[stmt.targetName] = [];
        }
        if (Array.isArray(val)) {
          scope[stmt.targetName] = [...val];
        } else {
          scope[stmt.targetName].push(val);
        }
      } else if (stmt.targetType === 'ARRAY_ELEMENT') {
        if (!Array.isArray(scope[stmt.targetName])) {
          scope[stmt.targetName] = [];
        }
        const idx = evalNode(stmt.indexExpr);
        const numIdx = typeof idx === 'number' ? idx : parseInt(String(idx), 10);
        if (Number.isNaN(numIdx) || numIdx < 0) {
          throw new Error(`Formula error (Line ${stmt.line}): Invalid array index ${idx}`);
        }
        scope[stmt.targetName][numIdx] = val;
      } else {
        scope[stmt.targetName] = val;
      }
    }
  }

  if (targetVarKey && scope[targetVarKey] !== undefined) {
    return scope[targetVarKey];
  }

  const lastStmt = ast.statements[ast.statements.length - 1];
  if (lastStmt && lastStmt.targetName && scope[lastStmt.targetName] !== undefined) {
    return scope[lastStmt.targetName];
  }

  return '';
}

/**
 * Validates a value against its declared dataType.
 * @param {string} dataType - 'IP' | 'Port' | 'Number' | 'String'
 * @param {any} value
 * @returns {{ valid: boolean, error?: string }}
 */
function validateVariableValue(dataType, value) {
  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }

  const typeUpper = String(dataType || '').toUpperCase();
  const str = String(value).trim();

  if (typeUpper === 'IP') {
    const parts = str.split('.');
    if (parts.length !== 4) {
      return { valid: false, error: 'Validation error: รูปแบบ IP ต้องมี 4 octet คั่นด้วยจุด (เช่น 192.168.1.1)' };
    }
    for (let i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) {
        return { valid: false, error: `Validation error: octet ที่ ${i + 1} ไม่ใช่ตัวเลขที่ถูกต้อง` };
      }
      const num = parseInt(parts[i], 10);
      if (num < 0 || num > 255) {
        return { valid: false, error: `Validation error: octet ที่ ${i + 1} มีค่า ${num} เกินช่วงที่อนุญาต (0-255)` };
      }
    }
    return { valid: true };
  }

  if (typeUpper === 'PORT') {
    if (!/^\d+\/\d+\/\d+(?::\d+)?$/.test(str)) {
      return { valid: false, error: 'Validation error: รูปแบบ Port ต้องเป็น slot/card/port หรือ slot/card/port:onu_idx (เช่น 1/1/1:5)' };
    }
    return { valid: true };
  }

  if (typeUpper === 'NUMBER') {
    if (!/^-?\d+(?:\.\d+)?$/.test(str)) {
      return { valid: false, error: 'Validation error: ต้องเป็นตัวเลขที่ถูกต้อง' };
    }
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Extracts variable dependencies from a formula string.
 * @param {string} formula
 * @param {string} [targetVarKey]
 * @returns {string[]}
 */
function extractReferencedVariables(formula, targetVarKey = null) {
  if (!formula || typeof formula !== 'string') return [];
  try {
    const tokens = tokenizeFormula(formula);
    const localTargets = new Set();
    const referenced = new Set();

    tokens.forEach((t, i) => {
      if (t.type === TokenType.IDENTIFIER && !KEYWORDS.has(t.value)) {
        // If it's on left side of assignment, it's a local/target var
        const nextTok = tokens[i + 1];
        const nextNextTok = tokens[i + 2];
        if (nextTok && nextTok.type === TokenType.ASSIGN) {
          localTargets.add(t.value);
        } else if (nextTok && nextTok.type === TokenType.LBRACKET && nextNextTok && nextNextTok.type === TokenType.RBRACKET) {
          localTargets.add(t.value);
        } else {
          // If not declared as a local target yet, it's an external dependency
          if (!localTargets.has(t.value) && t.value !== targetVarKey) {
            referenced.add(t.value);
          }
        }
      }
    });

    return Array.from(referenced);
  } catch {
    return [];
  }
}

/**
 * Detects circular dependencies in variables graph.
 * @param {Array<{ key: string, formula?: string }>} variablesList
 * @param {{ key: string, formula?: string }} [newOrUpdatedVar]
 * @returns {{ hasCycle: boolean, cyclePath?: string, message?: string }}
 */
function detectCircularDependency(variablesList = [], newOrUpdatedVar = null) {
  const graph = new Map();

  (variablesList || []).forEach((v) => {
    if (v && v.key) {
      const deps = v.formula ? extractReferencedVariables(v.formula, v.key) : [];
      graph.set(v.key, deps);
    }
  });

  if (newOrUpdatedVar && newOrUpdatedVar.key) {
    const deps = newOrUpdatedVar.formula ? extractReferencedVariables(newOrUpdatedVar.formula, newOrUpdatedVar.key) : [];
    graph.set(newOrUpdatedVar.key, deps);
  }

  const visited = new Set();
  const recStack = new Set();
  const path = [];

  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      } else if (recStack.has(neighbor)) {
        path.push(neighbor);
        const cycleStartIndex = path.indexOf(neighbor);
        return path.slice(cycleStartIndex);
      }
    }

    path.pop();
    recStack.delete(node);
    return null;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) {
        const chain = cycle.join(' → ');
        return {
          hasCycle: true,
          cyclePath: chain,
          message: `Circular dependency detected: ${chain}`,
        };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Reactive cascade recalculation engine.
 * Computes derived variables in topological order and halts error cascade.
 * @param {Array<{ key: string, formula?: string, dataType?: string }>} variableDefs
 * @param {Record<string, any>} currentValues
 * @returns {{
 *   values: Record<string, any>,
 *   errors: Record<string, string>,
 *   success: boolean
 * }}
 */
function recalculateVariables(variableDefs = [], currentValues = {}) {
  const computed = { ...currentValues };
  const errors = {};
  const formulaVars = (variableDefs || []).filter((v) => v && v.formula && v.key);

  if (formulaVars.length === 0) {
    return { values: computed, errors, success: true };
  }

  // Build dependency graph of formula variables
  const graph = new Map();
  formulaVars.forEach((v) => {
    const deps = extractReferencedVariables(v.formula, v.key);
    graph.set(v.key, deps);
  });

  // Topological sorting (Kahn's algorithm)
  const inDegree = new Map();
  formulaVars.forEach((v) => inDegree.set(v.key, 0));

  formulaVars.forEach((v) => {
    const deps = graph.get(v.key) || [];
    deps.forEach((d) => {
      if (inDegree.has(v.key) && graph.has(d)) {
        inDegree.set(v.key, (inDegree.get(v.key) || 0) + 1);
      }
    });
  });

  const queue = [];
  inDegree.forEach((deg, key) => {
    if (deg === 0) queue.push(key);
  });

  const topoOrder = [];
  while (queue.length > 0) {
    const u = queue.shift();
    topoOrder.push(u);

    formulaVars.forEach((v) => {
      const deps = graph.get(v.key) || [];
      if (deps.includes(u)) {
        inDegree.set(v.key, inDegree.get(v.key) - 1);
        if (inDegree.get(v.key) === 0) {
          queue.push(v.key);
        }
      }
    });
  }

  // Include any remaining formula variables
  formulaVars.forEach((v) => {
    if (!topoOrder.includes(v.key)) topoOrder.push(v.key);
  });

  const failedVars = new Set();

  for (const varKey of topoOrder) {
    const varDef = formulaVars.find((v) => v.key === varKey);
    if (!varDef) continue;

    const deps = graph.get(varKey) || [];
    const hasFailedDep = deps.some((d) => failedVars.has(d));

    if (hasFailedDep) {
      errors[varKey] = `Cannot compute '${varKey}' because dependent variables had errors`;
      failedVars.add(varKey);
      continue;
    }

    try {
      const ast = parseFormula(varDef.formula, varKey);
      const res = evaluateFormulaAst(ast, computed, varKey);

      // Validate data type
      if (varDef.dataType) {
        const valRes = validateVariableValue(varDef.dataType, res);
        if (!valRes.valid) {
          errors[varKey] = valRes.error;
          failedVars.add(varKey);
          continue;
        }
      }

      computed[varKey] = String(res !== undefined && res !== null ? res : '');
    } catch (err) {
      errors[varKey] = err.message || 'Formula evaluation error';
      failedVars.add(varKey);
    }
  }

  return {
    values: computed,
    errors,
    success: Object.keys(errors).length === 0,
  };
}

export {
  TokenType,
  NodeType,
  tokenizeFormula,
  parseFormula,
  evaluateFormulaAst,
  validateVariableValue,
  extractReferencedVariables,
  detectCircularDependency,
  recalculateVariables,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TokenType,
    NodeType,
    tokenizeFormula,
    parseFormula,
    evaluateFormulaAst,
    validateVariableValue,
    extractReferencedVariables,
    detectCircularDependency,
    recalculateVariables,
  };
}

