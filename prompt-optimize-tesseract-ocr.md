# Prompt: เพิ่มประสิทธิภาพ OCR (Tesseract.js) สำหรับอ่านค่า Network Config

ใช้ prompt นี้กับ AI coding agent (เช่น Claude Code, Cursor) เพื่อสร้าง/ปรับปรุงโมดูล OCR สำหรับอ่านข้อมูล network config (IP address, port แบบ `1/1/1:5`) จากภาพ

---

## Context

ระบบต้องการอ่านข้อความจากภาพ config/network (screenshot หรือภาพถ่ายจอ) โดยข้อมูลส่วนใหญ่เป็น:
- IP address (เช่น `192.168.1.1`)
- Port/OLT string รูปแบบ `slot/card/port:onu_idx` (เช่น `1/1/1:5`)
- อาจมี label ภาษาไทย/อังกฤษนำหน้าค่า (เช่น "IP Address:", "พอร์ต:")

ปัญหาที่เจอ: Tesseract.js อ่านจุด (`.`) ใน IP หายไปเป็นครั้งคราว เช่น `192.168.1.1` กลายเป็น `192168.11` ทำให้ค่าที่ได้ผิด


## งานที่ต้องการ

สร้างโมดูล OCR (`lib/ocr/network-config.ts` หรือชื่อที่เหมาะสม) ที่ทำงานเป็น pipeline ดังนี้:

1. **Image Preprocessing** — ก่อนส่งเข้า Tesseract:
   - Upscale ภาพถ้าความกว้าง < 2000px
   - แปลง grayscale
   - Normalize contrast
   - Threshold/binarize ให้เหมาะกับข้อความบนพื้นหลัง config screen

2. **OCR ด้วย Tesseract.js**:
   - ใช้ language pack `tha+eng` (รองรับ label ภาษาไทย)
   - ตั้ง `tessedit_pageseg_mode` ให้เหมาะกับ layout (บล็อกข้อความหลายบรรทัด ใช้ mode `6`)
   - **ห้าม whitelist เฉพาะตัวเลขและจุด** เพราะจะทำให้ label ปนเพี้ยน — ปล่อยให้อ่านข้อความเต็มก่อน แล้วกรองด้วย regex ทีหลัง

3. **Post-processing ด้วย Regex validation** (ไม่ใช่แค่ extract แต่ validate ด้วย):
   - IPv4: ต้อง validate แต่ละ octet อยู่ในช่วง 0–255 จริง (ป้องกัน false positive จาก OCR อ่านตัวเลขติดกันผิด)
   - Port/OLT string: pattern `^\d+\/\d+\/\d+:\d+$` แยกเป็น `{ olt: string, onu_idx: number }`
   - ถ้า regex ไม่ match ให้คืนค่า error/null พร้อม raw text ที่ OCR อ่านได้ เพื่อ debug หรือให้ผู้ใช้แก้ไขเอง (manual correction fallback)

4. **Output ที่ต้องการ**:
   ```ts
   interface OCRResult {
     rawText: string;
     ips: string[];
     ports: { olt: string; onu_idx: number }[];
     labeledPairs: { label: string; value: string }[]; // จับคู่ label กับค่าที่อยู่บรรทัดเดียวกัน
   }
   ```

5. **Error handling**:
   - ถ้า OCR confidence ต่ำ (Tesseract คืนค่า `confidence` ต่อคำ) ให้ flag ค่านั้นว่า "low confidence" แทนที่จะตัดทิ้งเงียบๆ
   - Wrap การเรียก Tesseract worker ด้วย try/catch และ cleanup worker (`await worker.terminate()`) เสมอ แม้ error

## ข้อจำกัดที่ต้องยึดตาม

- ต้องเป็นโซลูชันฟรีและไม่มี rate limit (self-hosted เท่านั้น ห้ามใช้ cloud OCR API ที่มีโควตา)
- ต้องรันได้ใน Node.js server-side (Next.js API Route) ไม่ใช่แค่ client-side
- Regex ต้อง validate ความถูกต้องของ format จริง ไม่ใช่แค่จับ pattern คร่าวๆ
- เขียน unit test ครอบคลุมกรณี: OCR อ่านจุดหาย, label ปนกับค่า, format port ผิดเพี้ยน

## สิ่งที่ต้องส่งมอบ

1. โมดูล OCR pipeline ตามโครงสร้างข้างต้น
2. Unit tests (เช่นด้วย Vitest/Jest) สำหรับฟังก์ชัน extract/validate IP และ port
3. ตัวอย่างการเรียกใช้ใน API Route พร้อมอัปโหลดไฟล์ภาพ
4. คำอธิบายสั้นๆ ว่าถ้าความแม่นยำยังไม่พอ ควรปรับ parameter ตัวไหนต่อ (เช่น threshold value, PSM mode)
