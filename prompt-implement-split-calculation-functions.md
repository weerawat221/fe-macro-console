# Prompt: Implement Split Function และ Calculation Function ในระบบ Variables

ใช้ prompt นี้กับ AI coding agent เพื่อ implement ฟีเจอร์ Split function และ Calculation function เข้าไปในระบบ Variables ที่มีอยู่ (ปัจจุบันยังไม่มีฟีเจอร์นี้)

---

## Context

ระบบมีหน้าจอสร้าง/แก้ไข "Variables" อยู่แล้ว แต่ **ยังไม่รองรับสูตรคำนวณ (formula) ใดๆ** งานนี้คือการเพิ่มความสามารถให้ user กำหนดค่าตัวแปรจากตัวแปรอื่นด้วยสูตรได้ 2 กลุ่มฟังก์ชัน:

1. **Split function** — แยก string ด้วยตัวคั่นแล้วเลือก index ของผลลัพธ์
2. **Calculation function** — คำนวณ `+ - * / mod` ระหว่างตัวเลข/string พร้อม array manipulation

**สำคัญ:** ถ้าในระบบปัจจุบันมีฟีเจอร์ "ตัวแปรคำนวณแบบ Dynamic" แบบเก่าอยู่แล้ว (ไม่ว่าจะเป็น prototype หรือ partial implementation) **ให้ถอดออกทั้งหมด** แล้วแทนที่ด้วยระบบใหม่ตาม spec นี้ ห้ามให้ทั้งสองระบบอยู่ร่วมกัน เพราะจะสร้างความสับสนเรื่อง syntax และพฤติกรรมที่ไม่สอดคล้องกัน

## Syntax ของสูตร (บังคับ)

**กฎตายตัว: ทุกบรรทัดในสูตรต้อง assign ค่าเข้าตัวแปรเสมอ ไม่มีบรรทัด implicit return**

บรรทัดสุดท้ายของสูตรต้อง assign เข้าตัวแปรปลายทางที่กำลังสร้าง/แก้ไขอยู่เสมอ (ชื่อต้องตรงกับตัวแปรที่ user กำลังสร้าง)

**ตัวอย่างที่ 1 — multi-line calculation:**
```
สร้างหรือแก้ไข lan_ip_cal_1
{
  array[] = lan_ip.split(".")
  array[3] = toint(array[3]) + 1
  lan_ip_cal_1 = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])
}
```

**ตัวอย่างที่ 2 — single-line split:**
```
สร้างหรือแก้ไข onu_idx
{
  onu_idx = port.split(":", 0)
}
```

ทั้งสองแบบใช้ syntax เดียวกัน: `{ ... }` block ที่มีอย่างน้อย 1 บรรทัด และบรรทัดสุดท้ายต้องเป็น `<ชื่อตัวแปรปลายทาง> = <expression>` เท่านั้น — **parser ต้อง reject** สูตรที่บรรทัดสุดท้ายไม่ได้ assign เข้าตัวแปรปลายทางที่ถูกต้อง

## Type Coercion — ต้องชัดเจน ไม่มีการเดา

`+` ระหว่าง string กับ string/number คือ **string concatenation เสมอ** ไม่มีข้อยกเว้น:
```
"250" + 1  →  "2501"   // concat ตรงไปตรงมา ไม่แปลง type ให้อัตโนมัติ
```

ถ้า user ต้องการคำนวณเลขจริง ต้อง cast เองด้วยฟังก์ชันที่ระบบมีให้:
```
toint("250") + 1   →  251        (number)
tostring(251)       →  "251"     (string)
```

**ฟังก์ชันที่ต้อง implement:**
- `toint(value)` — แปลง string → number (integer); ถ้า parse ไม่ได้ (ไม่ใช่ตัวเลข) ต้อง throw formula error ทันที ไม่ใช่คืนค่า `NaN` หรือ `0` เงียบๆ
- `tostring(value)` — แปลง number → string เสมอสำเร็จ

**Operator rules:**
| Operator | number op number | string เกี่ยวข้อง |
|---|---|---|
| `+` | บวกเลข | string concatenation เสมอ |
| `- * / mod` | คำนวณเลข | **error** ถ้า operand เป็น string (ต้อง `toint()` ก่อนเสมอ) |

เขียนกฎนี้เป็น truth table ในเอกสาร และครอบคลุมด้วย unit test ทุกเคส

## Type Tagging และ Validation

ตัวแปรปลายทางต้อง tag "ประเภทข้อมูล" ได้ตอนสร้าง/แก้ไข อย่างน้อย: `IP`, `Port`, `Number`, `String`

Validation ต้องรันหลังคำนวณสูตรเสร็จ ก่อนบันทึกจริง:
- **Type = IP**: ต้องเป็น 4 octet คั่นด้วย `.` และแต่ละ octet เป็นตัวเลข 0–255 เท่านั้น ถ้าเกินช่วง (เช่น `255+1=256`) ต้อง **block การ save** พร้อม error message ระบุตำแหน่ง เช่น `"Validation error: octet ที่ 4 มีค่า 256 เกินช่วงที่อนุญาต (0-255)"`
- **Type = Port**: validate ตาม pattern ที่ระบบกำหนด (เช่น `slot/card/port` หรือ `slot/card/port:onu_idx`)
- **Type = Number**: ต้องเป็นตัวเลขล้วน (ผ่านการ `toint()`/`tostring()` มาแล้วถูกต้อง)
- **Type = String**: ไม่ validate format พิเศษ

## พฤติกรรมเมื่อ Split ผิดพลาด

**Hard block ทั้งสองกรณีนี้ ตอนกด "Test formula" (preview) และตอน "Save":**

1. **หา separator ไม่เจอ** — เช่น `port.split(":", 1)` แต่ `port` (ค่าตัวอย่าง) ไม่มี `:` เลย → error: `"Formula error: ไม่พบตัวคั่น ':' ในค่าตัวอย่างของ port"`
2. **Index เกินจำนวน element** — เช่น split ได้ผลลัพธ์ 2 ตัว (`index 0-1`) แต่สูตรขอ `index 5` → error: `"Formula error: split(':', 5) — index เกินขอบเขต (ผลลัพธ์มีแค่ 2 ส่วน: index 0-1)"`

ทั้งสอง error ต้อง **บล็อกการ save จริง** (ไม่ใช่แค่ warning ที่ save ผ่านได้)

## Circular Dependency Detection

ก่อน save formula ทุกครั้ง ต้องสร้าง/อัปเดต dependency graph ของตัวแปรทั้งหมดในระบบ แล้วเช็คว่าตัวแปรที่กำลัง save ไม่ทำให้เกิด cycle (เช่น A อ้างอิง B, B อ้างอิง C, C อ้างอิงกลับมา A)

ถ้าพบ circular dependency:
- **Block การ save**
- แสดง chain เต็มให้ user เห็น เช่น `"Circular dependency detected: lan_ip_cal_1 → onu_idx → port_derived → lan_ip_cal_1"`

## Parser / Interpreter — ห้ามใช้ eval()

**ห้ามใช้ `eval()` หรือ `new Function()` กับสูตรที่ user พิมพ์เข้ามาโดยเด็ดขาด** — เสี่ยง code injection ร้ายแรงเพราะ user ควบคุม input ได้เอง

ต้อง implement เป็น custom parser แยก 3 ชั้น:
1. **Tokenizer** — แปลงสูตรเป็น token stream (identifier, operator, string literal, number literal, punctuation)
2. **AST Builder** — สร้าง syntax tree จาก token stream พร้อม syntax validation (reject token ที่ไม่รู้จักทันที พร้อมบอกตำแหน่ง line/column)
3. **Evaluator** — เดิน AST แล้วคำนวณผลลัพธ์ โดยจำกัด operation ให้อยู่ใน whitelist เท่านั้น:
   - Functions: `split(separator, index)`, `toint(value)`, `tostring(value)`
   - Operators: `+ - * / mod`
   - Data types: string literal (`"..."`), number literal, array (ประกาศด้วย `identifier[]` หรือเข้าถึง element ด้วย `identifier[n]`), variable reference (ชื่อตัวแปรที่มีอยู่ในระบบ)
   - **ไม่มี** function call อื่นนอกเหนือ whitelist, ไม่มี property access แบบ arbitrary, ไม่มี control flow (if/for/while) — ถ้า parser เจอ syntax นอก whitelist ต้อง reject ทันที

## Timing การ Re-calculate: Reactive

เลือกใช้ **Reactive model**:
- เมื่อตัวแปรต้นทาง (เช่น `port`, `lan_ip`) ถูกอัปเดตค่า ระบบต้อง trigger คำนวณตัวแปรที่ derive มาจากมันใหม่ทันที (ตาม dependency graph) แล้วเขียนค่าที่คำนวณได้ลง DB ทันที (ไม่ใช่ compute on-read)
- ต้อง implement dependency tracking ที่รู้ว่าตัวแปรไหน "ฟัง" ตัวแปรไหนอยู่ (จาก formula ที่ระบุไว้ตอนสร้าง/แก้)
- ถ้า chain การ derive ยาวหลายชั้น (A → B → C) ต้อง cascade คำนวณตามลำดับ dependency ให้ถูกต้อง (topological order) ไม่ใช่สุ่มลำดับ
- ถ้าตัวแปรกลางในเชนคำนวณไม่ผ่าน validation (เช่น IP overflow) ต้อง log/flag ตัวแปรนั้นเป็น error state และ**ไม่ cascade ค่าที่ผิดต่อไปยังตัวแปรถัดไป** เพื่อป้องกันข้อมูลผิดกระจายไปทั้งระบบ

## สิ่งที่ต้องส่งมอบ

1. **เอกสาร Formula Language Spec**: grammar (BNF หรือเทียบเท่า), type coercion truth table, รายการ error case ทั้งหมดพร้อมข้อความ error ที่ user เห็นจริง
2. **Parser/Interpreter** (TypeScript): Tokenizer, AST Builder, Evaluator แยก module ชัดเจน พร้อม unit tests ครอบคลุมทุก edge case ข้างต้น (type coercion, toint/tostring error, split ไม่เจอ separator, index เกิน range, circular dependency)
3. **Validation layer**: type-specific validator แบบ pluggable (เริ่มจาก IP, Port, Number, String) และ dependency graph builder พร้อม cycle detection algorithm
4. **Reactive recalculation engine**: dependency tracking, topological cascade, error-state handling ไม่ให้ค่าผิดกระจายต่อ
5. **UI ในหน้าสร้าง/แก้ไข Variables**:
   - ช่องใส่สูตรพร้อมปุ่ม "Test formula" รันกับข้อมูลตัวอย่างจริงก่อน save
   - แสดง error message ชัดเจน ระบุตำแหน่ง/สาเหตุ (ไม่ใช่ "invalid formula" เฉยๆ)
   - ช่อง tag "ประเภทข้อมูล" สำหรับตัวแปรปลายทาง
   - แสดง dependency chain ให้เห็นเวลาจะลบ/แก้ตัวแปรที่มีตัวแปรอื่นพึ่งพาอยู่
6. **Migration**: สคริปต์/ขั้นตอนถอดฟีเจอร์ "ตัวแปรคำนวณแบบ Dynamic" แบบเก่าออกจากระบบ (ถ้ามี) รวมถึงข้อมูลหรือ schema ที่เกี่ยวข้อง

## ข้อจำกัดทางเทคนิค

- Stack: Next.js (App Router, TypeScript), Supabase (PostgreSQL)
- ห้ามใช้ `eval()` / `new Function()` กับ user input โดยเด็ดขาด
- Parser ต้อง fail-fast พร้อม error message บอกตำแหน่ง (line/column) ที่ parse ไม่ผ่าน
- ทุก error ในสเปคนี้ (type coercion ผิด, split ไม่เจอ separator, index เกิน range, circular dependency, type validation ล้มเหลว) ต้อง **block การ save จริง** ไม่ใช่แค่ warning
