# FE Macro Console (Electron rebuild)

Windows keystroke-injection macro tool for field engineers working across RDM/PuTTY,
Windows terminal, LINE, FortiClient, and browser logins. Rebuilt from the original
Tkinter tool onto Electron, with commands now editable entirely from the GUI.

---

## เริ่มต้นใช้งาน (Thai quick-start)

### ติดตั้งครั้งแรก (บนเครื่อง Windows)

ต้องมี **Node.js 18+** และ **Python 3 + Visual Studio Build Tools** (สำหรับคอมไพล์ native
module ที่ใช้ส่งคีย์บอร์ดไปยังโปรแกรมอื่น) ติดตั้งไว้ก่อน

```
npm install
npm run rebuild:native
npm start
```

`rebuild:native` ต้องรันครั้งเดียว (หรือรันใหม่ทุกครั้งที่อัปเดต Electron version) —
เป็นขั้นตอนคอมไพล์ตัวเชื่อมต่อ Win32 API ให้ตรงกับเวอร์ชัน Electron ที่ใช้งานจริง
ถ้าไม่รันขั้นตอนนี้ ปุ่มต่าง ๆ จะยังกดได้แต่จะไม่มีการพิมพ์คำสั่งไปยังหน้าต่างเป้าหมายจริง

### การใช้งานประจำวัน

1. เปิดโปรแกรม จะมี panel ลอยอยู่บนสุด (always-on-top) มุมหนึ่งของจอ
2. สลับไปโฟกัสหน้าต่าง RDM / Terminal / LINE / Browser ตามปกติ — โปรแกรมจะตรวจจับ
   หน้าต่างที่ใช้งานอยู่อัตโนมัติ (ดูจากชื่อ title bar) แล้วสลับชุดปุ่มคำสั่งให้เอง
3. กรอกข้อมูลในช่อง SR Name, Port, VLAN, IP ฯลฯ ในแท็บปัจจุบัน
4. กดปุ่มคำสั่งที่ต้องการ — โปรแกรมจะโฟกัสหน้าต่างเป้าหมายแล้วพิมพ์คำสั่งให้อัตโนมัติ
5. ปุ่มที่มีจุดสามจุด (⋯) จะเปิดหน้าต่างรีวิวคำสั่งก่อนส่งจริง (สำหรับคำสั่ง config ที่ซับซ้อน)
6. กด **Lock focus** ถ้าไม่อยากให้โปรแกรมสลับโฟกัสอัตโนมัติชั่วคราว (เช่น กำลังพิมพ์อยู่ในตัวโปรแกรมเอง)

### ตั้งรหัสผ่าน/บัญชีที่ใช้บ่อย (Credential Vault)

รหัสผ่านที่เคยฝังอยู่ในโค้ดต้นฉบับ (เช่น AP admin password) **ไม่ได้ติดมากับโปรแกรมนี้แล้ว**
ต้องตั้งเองครั้งแรกที่ Edit → Edit stored credentials แล้วกรอกค่าที่ต้องการ ระบบจะเก็บไว้ในเครื่อง
ของผู้ใช้เท่านั้น (ไม่ได้ส่งขึ้นเน็ต ไม่ได้อยู่ใน source code) ปุ่มที่อ้างอิงรหัสผ่านเหล่านี้จะขึ้น
"MISSING" จนกว่าจะตั้งค่าให้ครบ

### กำหนดคำสั่งเอง (Custom Command Editor) — ฟีเจอร์ใหม่

กดปุ่ม **Edit** ที่มุมขวาบนของโปรแกรม จะเปิดหน้าต่างแก้ไขคำสั่ง:

- ด้านซ้าย: รายการชุดคำสั่ง (RDM·AP, RDM·ONU, LINE, ฯลฯ) — กด **+ New set** เพื่อสร้างชุดใหม่
- ด้านขวา: กลุ่มคำสั่งในชุดที่เลือก — กด **+ Group** เพื่อสร้างกลุ่มใหม่, คลิกแถวคำสั่งเพื่อแก้ไข,
  หรือกด **+ Add command** เพื่อเพิ่มปุ่มใหม่
- ในฟอร์มแก้ไขคำสั่ง: ตั้งชื่อปุ่ม, พิมพ์คำสั่ง (ใช้ `\n` แทน Enter, `\t` แทน Tab, ใช้ `{ชื่อฟิลด์}`
  เพื่อดึงค่าจากช่องกรอกข้อมูล เช่น `{sr_ap}`, `{port}`, `{vlan}`) และเลือกได้ว่าจะให้ขึ้นหน้าต่าง
  รีวิวก่อนส่งหรือไม่
- การแก้ไขทุกอย่างบันทึกอัตโนมัติ ไม่ต้องรีสตาร์ทโปรแกรม

### สร้างไฟล์ติดตั้ง (.exe) เพื่อแจกจ่าย

```
npm run build:win
```

ไฟล์ installer จะอยู่ใน `dist/`

---

## English technical reference

### Prerequisites

- Windows 10/11 (the native bridge only builds/runs on Windows — see "Non-Windows development" below)
- Node.js 18+
- Python 3 and Visual Studio Build Tools ("Desktop development with C++" workload) — required by `node-gyp` to compile the native addon

### First-time setup

```bash
npm install              # installs Electron, electron-store, electron-builder, and links the native addon package
npm run rebuild:native   # compiles native/sendinput_win32 against Electron's own ABI (not system Node's)
npm start                 # launch the app
```

`npm run rebuild:native` uses `@electron/rebuild`, which is the correct tool for this —
plain `node-gyp rebuild` would compile against the system Node ABI, and a binary built
that way throws a `NODE_MODULE_VERSION` mismatch when loaded inside the actual Electron
process. Re-run this script any time the `electron` devDependency version changes.

### Non-Windows development

The renderer, main-process logic, command editor, and persisted storage all run fine on
macOS/Linux for UI development — `native/sendinput_win32/index.js` falls back to a no-op
stub automatically when the compiled binary isn't available or the platform isn't `win32`,
so the app boots and the editor is fully usable. Only actual keystroke delivery requires
Windows.

### Project layout

```
src/main/main.js        Electron main process: window, IPC, focus-tracker poll loop
src/main/store.js       electron-store wrapper (persisted commands/tabs/credentials)
src/main/preload.js     contextBridge — the only surface the renderer can reach into main
src/renderer/           UI: vanilla ES modules, no framework/bundler
src/shared/             Command-tree data — defaultCommands.js (CJS, for main) and
                         defaultCommandsClient.js (ESM, for renderer) must be kept in sync
                         if you edit the seed data directly instead of through the GUI
native/sendinput_win32/  N-API addon wrapping SendInput / GetForegroundWindow / etc.
```

### What changed from the original Python tool

- **Custom command editor** (new): every button, group, and command set is now editable
  from Edit → add/rename/delete sets, groups, and individual command rows, persisted
  immediately via `electron-store`. The original required editing `COMMAND_GROUPS` in
  source and restarting.
- **Credentials removed from source**: the original had literal device passwords (AP
  admin password, etc.) hardcoded in `COMMAND_GROUPS`. Those are now `{cred_*}` tokens
  resolved from Settings → Credential Vault, stored locally, never in this repo.
- **Persisted tabs**: the original lost all tabs on close; tabs now persist across restarts.
- **Fixed-height scrollable panel** instead of a window that resizes to fit content on
  every render — steadier for a pinned/always-on-top utility that switches between very
  short (Switch monitoring) and very long (LINE messaging) command lists.
- Two intentionally-preserved original quirks, kept for behavioral fidelity: `SetForegroundWindow`'s
  return value is not treated as fatal (Windows' focus-stealing prevention makes it an
  unreliable signal — the original didn't check it either), and the LAN Blue Config
  sequence doesn't re-validate the target window between each of its six sends (neither
  did the original).

### Known limitation / follow-up

`electron-builder`'s own dependency chain (`app-builder-lib`, `tar`) currently reports a
handful of high-severity advisories in `npm audit`. These are build-tooling dependencies,
not runtime code shipped inside the packaged app, and don't affect `electron` itself
(pinned to a current, non-EOL major). Worth revisiting on your next `electron-builder`
major-version bump.
