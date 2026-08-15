# FE Macro Console — Formula Language Specification

Specification for the Split and Calculation Formula System used in the Variables engine.

---

## 1. Syntax & Grammar (BNF)

A formula must be enclosed within `{ ... }` and contain at least one line.
**Rule:** Every line in the formula must be an explicit assignment (`target = expression`). There is no implicit return.
**Rule:** The **last line** of the formula must assign to the destination variable being created or modified (`<destination_variable> = <expression>`).

```ebnf
Formula          ::= "{" StatementList "}"
StatementList    ::= ( Statement Newline* )+
Statement        ::= Assignment
Assignment       ::= Target "=" Expression
Target           ::= ArrayDeclaration | ArrayElement | Identifier
ArrayDeclaration ::= Identifier "[]"
ArrayElement     ::= Identifier "[" Expression "]"

Expression       ::= Term ( ( "+" | "-" ) Term )*
Term             ::= Factor ( ( "*" | "/" | "mod" ) Factor )*
Factor           ::= Primary
Primary          ::= NumberLiteral
                   | StringLiteral
                   | FunctionCall
                   | MethodCall
                   | ArrayElement
                   | Identifier
                   | "(" Expression ")"

FunctionCall     ::= "toint" "(" Expression ")"
                   | "tostring" "(" Expression ")"
MethodCall       ::= Identifier "." "split" "(" StringLiteral ( "," Expression )? ")"

Identifier       ::= [a-zA-Z_][a-zA-Z0-9_]*
StringLiteral    ::= '"' ( [^"\\] | '\\"' | '\\\\' )* '"'
NumberLiteral    ::= [0-9]+
```

---

## 2. Type Coercion & Operator Truth Table

Type coercion is strictly defined without ambiguous guessing.

| Operator | Number `op` Number | String `op` String | String `op` Number / Number `op` String |
|---|---|---|---|
| `+` | **Addition** (`1 + 2` → `3`) | **Concatenation** (`"a" + "b"` → `"ab"`) | **Concatenation** (`"250" + 1` → `"2501"`, `1 + "250"` → `"1250"`) |
| `-` | **Subtraction** (`10 - 3` → `7`) | **Formula Error** (operand is string) | **Formula Error** (operand is string) |
| `*` | **Multiplication** (`4 * 5` → `20`) | **Formula Error** (operand is string) | **Formula Error** (operand is string) |
| `/` | **Division** (`10 / 2` → `5`) | **Formula Error** (operand is string) | **Formula Error** (operand is string) |
| `mod` | **Modulo** (`10 mod 3` → `1`) | **Formula Error** (operand is string) | **Formula Error** (operand is string) |

---

## 3. Whitelisted Functions

Only the following functions and methods are allowed:

1. **`toint(value)`**
   - Converts string or number to integer.
   - Throws `Formula error` if the string cannot be cleanly parsed as an integer (never returns `NaN` or `0` silently).
2. **`tostring(value)`**
   - Converts any number or string to a string.
3. **`stringVar.split(separator, index?)`**
   - `stringVar.split(separator)`: Returns an array of strings.
   - `stringVar.split(separator, index)`: Directly returns the element at `index`.
   - Throws error if `separator` is not found in the source string.
   - Throws error if `index` is out of bounds (`index < 0` or `index >= parts.length`).

---

## 4. Data Type Tagging & Validation

Variables can be assigned a `dataType`:
- **`IP`**: Validates that value consists of 4 octets separated by dots (`0-255` each). Throws specific octet overflow error if out of range.
- **`Port`**: Validates pattern `slot/card/port` or `slot/card/port:onu_idx` (e.g. `1/1/1:5`, `0/2/1`).
- **`Number`**: Validates integer or decimal number format.
- **`String`**: General text without special constraints.

---

## 5. Error Catalog

| Condition | Error Message Example |
|---|---|
| Separator not found in split | `Formula error: ไม่พบตัวคั่น ':' ในค่าของ port` |
| Split index out of bounds | `Formula error: split(':', 5) — index เกินขอบเขต (ผลลัพธ์มีแค่ 2 ส่วน: index 0-1)` |
| Math operator on string | `Formula error: ตัวดำเนินการ '-' ใช้ได้กับตัวเลขเท่านั้น กรุณาใช้ toint(...)` |
| Invalid toint() conversion | `Formula error: toint() ล้มเหลว — 'abc' ไม่ใช่ตัวเลขที่ถูกต้อง` |
| Last line missing target assignment | `Formula error: บรรทัดสุดท้ายของสูตรต้องกำหนดค่าให้กับตัวแปร 'lan_ip_cal_1'` |
| Circular dependency | `Circular dependency detected: A → B → C → A` |
| IP octet out of range | `Validation error: octet ที่ 4 มีค่า 256 เกินช่วงที่อนุญาต (0-255)` |
| Port format invalid | `Validation error: รูปแบบ Port ต้องเป็น slot/card/port หรือ slot/card/port:onu_idx` |
| Division by zero | `Formula error: ไม่สามารถหารด้วย 0 ได้` |
