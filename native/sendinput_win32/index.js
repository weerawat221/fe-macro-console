// index.js
// Native Win32 automation bridge communicating with Win32Bridge.exe.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const exePath = path.join(__dirname, '..', 'Win32Bridge.exe');
const isSupported = process.platform === 'win32' && fs.existsSync(exePath);

let bridgeProcess = null;
let queue = [];
let buffer = '';

function startBridge() {
  if (!isSupported) return;

  try {
    bridgeProcess = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
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
};
