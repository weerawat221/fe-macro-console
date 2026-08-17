const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function resolveExePath() {
  const isPackaged = __dirname.includes('app.asar');

  if (isPackaged) {
    // 1. Try app.asar.unpacked
    const unpacked = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'Win32Bridge.exe');
    if (fs.existsSync(unpacked)) return unpacked;

    // 2. Try process.resourcesPath
    if (process.resourcesPath) {
      const resPath1 = path.join(process.resourcesPath, 'native', 'Win32Bridge.exe');
      if (fs.existsSync(resPath1)) return resPath1;
      const resPath2 = path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'Win32Bridge.exe');
      if (fs.existsSync(resPath2)) return resPath2;
      const resPath3 = path.join(process.resourcesPath, 'Win32Bridge.exe');
      if (fs.existsSync(resPath3)) return resPath3;
    }

    // 3. Fallback: Always extract from asar to os.tmpdir()
    try {
      const tempExe = path.join(os.tmpdir(), 'FE_Macro_Win32Bridge.exe');
      const sourceInAsar = path.join(__dirname, '..', 'Win32Bridge.exe');
      const buf = fs.readFileSync(sourceInAsar);
      fs.writeFileSync(tempExe, buf);
      return tempExe;
    } catch (e) {
      // ignore
    }
  }

  // In dev mode (not in app.asar):
  const devCandidates = [
    path.join(__dirname, '..', 'Win32Bridge.exe'),
    path.join(__dirname, '..', '..', 'native', 'Win32Bridge.exe'),
    path.join(__dirname, 'native', 'Win32Bridge.exe'),
  ];
  for (const c of devCandidates) {
    if (fs.existsSync(c)) return c;
  }

  return path.join(__dirname, '..', 'Win32Bridge.exe');
}

const isSupported = process.platform === 'win32';

let bridgeProcess = null;
let queue = [];
let buffer = '';

function startBridge() {
  if (!isSupported) return;

  const activeExe = resolveExePath();
  if (!activeExe) return;

  try {
    bridgeProcess = spawn(activeExe, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    bridgeProcess.on('error', (err) => {
      console.error('Win32Bridge spawn error:', err);
      bridgeProcess = null;
    });

    bridgeProcess.stdout.on('data', (data) => {
      buffer += data.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const cb = queue.shift();
        if (cb) {
          try {
            cb(null, JSON.parse(trimmed));
          } catch (e) {
            cb(null, { ok: false, error: trimmed });
          }
        }
      }
    });

    bridgeProcess.stderr.on('data', () => {});

    bridgeProcess.on('exit', () => {
      bridgeProcess = null;
      while (queue.length > 0) {
        const cb = queue.shift();
        cb(new Error('Bridge exited'), { ok: false });
      }
    });
  } catch (err) {
    bridgeProcess = null;
  }
}

function sendCommand(cmdString) {
  return new Promise((resolve) => {
    if (!bridgeProcess) {
      startBridge();
    }
    if (!bridgeProcess || !bridgeProcess.stdin || !bridgeProcess.stdin.writable) {
      resolve({ ok: false, reason: 'Bridge unavailable' });
      return;
    }

    queue.push((err, res) => {
      if (err) resolve({ ok: false, error: err.message });
      else resolve(res);
    });

    bridgeProcess.stdin.write(cmdString + '\n');
  });
}

function getForegroundWindowInfo() {
  if (!isSupported) return null;
  return new Promise((resolve) => {
    sendCommand('GET_FOREGROUND').then((res) => {
      if (res && res.ok && res.hwnd && res.hwnd !== 0) {
        resolve({
          hwnd: res.hwnd,
          title: res.title || '',
          processName: res.processName || '',
          pid: res.pid || 0,
        });
      } else {
        resolve(null);
      }
    });
  });
}

async function focusWindow(hwnd) {
  if (!isSupported || !hwnd) return false;
  const res = await sendCommand(`FOCUS_HWND|${hwnd}`);
  return res && res.ok === true;
}

async function focusWindowByQueries(queries) {
  if (!isSupported || !queries || queries.length === 0) return { ok: false };
  const queryStr = queries.filter(Boolean).join('|');
  const res = await sendCommand(`FOCUS_QUERY|${queryStr}`);
  return res || { ok: false };
}

async function focusAndSend(hwnd, text, queries = []) {
  if (!isSupported) return { ok: false, reason: 'Not supported' };
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  const queryStr = queries.filter(Boolean).join('|');
  const res = await sendCommand(`FOCUS_AND_SEND_B64|${hwnd || 0}|${b64}${queryStr ? '|' + queryStr : ''}`);
  return res || { ok: false };
}

async function isWindow(hwnd) {
  if (!isSupported || !hwnd) return false;
  const res = await sendCommand(`IS_WINDOW|${hwnd}`);
  return res && res.valid === true;
}

async function sendText(text) {
  if (!isSupported) return false;
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  const res = await sendCommand(`SEND_B64|${b64}`);
  return res && res.ok === true;
}

async function listWindows() {
  if (!isSupported) return [];
  const res = await sendCommand('LIST_WINDOWS');
  return Array.isArray(res) ? res : [];
}

async function captureScreen() {
  if (!isSupported) return { ok: false, reason: 'Not supported' };
  const res = await sendCommand('SCREENSHOT');
  return res || { ok: false };
}

async function captureScreenRect(left, top, width, height) {
  if (!isSupported) return { ok: false, reason: 'Not supported' };
  const res = await sendCommand(`SCREENSHOT_RECT|${Math.round(left)}|${Math.round(top)}|${Math.round(width)}|${Math.round(height)}`);
  return res || { ok: false };
}

async function captureScreenPoint(cursorX, cursorY) {
  if (!isSupported) return { ok: false, reason: 'Not supported' };
  const res = await sendCommand(`SCREENSHOT_POINT|${Math.round(cursorX)}|${Math.round(cursorY)}`);
  return res || { ok: false };
}

async function getIdleTime() {
  if (!isSupported) return 0;
  const res = await sendCommand('GET_IDLE_TIME');
  return res && res.ok ? (res.idleMs || 0) : 0;
}

async function jiggleMouse(distance = 20) {
  if (!isSupported) return false;
  const res = await sendCommand(`JIGGLE_MOUSE|${distance}`);
  return res && res.ok === true;
}

async function moveMouseRelative(dx, dy) {
  if (!isSupported) return false;
  const res = await sendCommand(`MOVE_MOUSE_RELATIVE|${dx}|${dy}`);
  return res && res.ok === true;
}

if (isSupported) {
  startBridge();
}

module.exports = {
  isSupported,
  getForegroundWindowInfo,
  focusWindow,
  focusWindowByQueries,
  focusAndSend,
  isWindow,
  sendText,
  listWindows,
  captureScreen,
  captureScreenRect,
  captureScreenPoint,
  getIdleTime,
  jiggleMouse,
  moveMouseRelative,
};
