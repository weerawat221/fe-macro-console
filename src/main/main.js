// main.js
// Electron main process.
// Window management, focus tracking, Win32 input injection, running app enumeration,
// and store IPC handlers.

const { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const Tesseract = require('tesseract.js');

const win32 = require('../../native/sendinput_win32');
const store = require('./store');
const { DEFAULT_COMMAND_SETS, normalizeCommandSets } = require('../shared/defaultCommands');
const { processOcrText, repairIpv4 } = require('../shared/networkConfigOcr');

const isDev = process.argv.includes('--dev');
const appIconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');

let mainWindow = null;
let settingsWindow = null;
let ocrOverlayWindow = null;

// --- Focus tracker state ---
let currentTargetHwnd = null;
let lastDetectedMode = null;
let trackerInterval = null;
const TRACKER_POLL_MS = 500;

// Dynamic cache of command sets for keyword & process matching
let cachedCommandSets = DEFAULT_COMMAND_SETS;

function updateCachedCommandSets() {
  const stored = store.get('commandSets', null);
  cachedCommandSets = normalizeCommandSets(stored || DEFAULT_COMMAND_SETS);
}

function detectModeFromWindow(title, processName) {
  const titleUpper = (title || '').toUpperCase();
  const procUpper = (processName || '').toUpperCase().replace(/\.EXE$/i, '');

  for (const [modeKey, appConfig] of Object.entries(cachedCommandSets)) {
    const keyUpper = modeKey.toUpperCase();
    const appName = (appConfig.name || '').toUpperCase();
    const keywords = (appConfig.keywords || []).map((k) => String(k).toUpperCase());

    const procs = [];
    if (appConfig.process) procs.push(String(appConfig.process).toUpperCase().replace(/\.EXE$/i, ''));
    if (Array.isArray(appConfig.processes)) {
      appConfig.processes.forEach((p) => procs.push(String(p).toUpperCase().replace(/\.EXE$/i, '')));
    }

    // 1. Process name match (e.g. "LINE", "REMOTEDESKTOPMANAGER", "CMD", "CHROME", "PUTTY", "TABBY")
    if (
      procs.some((p) => {
        if (!p) return false;
        return procUpper === p || procUpper.startsWith(p) || p.startsWith(procUpper);
      })
    ) {
      return modeKey;
    }

    // 2. Keyword match in title or process
    if (keywords.some((k) => k && (titleUpper.includes(k) || procUpper.includes(k)))) {
      return modeKey;
    }

    // 3. Name match in title
    if (appName && titleUpper.includes(appName)) {
      return modeKey;
    }

    // 4. Mode key match in title
    if (keyUpper && titleUpper.includes(keyUpper)) {
      return modeKey;
    }
  }

  return null;
}

function isOurOwnWindow(info) {
  if (!info) return true;
  const procLower = (info.processName || '').toLowerCase().replace(/\.exe$/i, '');
  const titleLower = (info.title || '').toLowerCase();

  // 1. Check known process names for our app
  if (
    procLower === 'electron' ||
    procLower === 'marcruro' ||
    procLower === 'fe-macro-console' ||
    procLower === 'fe_macro_win32bridge' ||
    procLower === 'win32bridge' ||
    procLower === 'node'
  ) {
    return true;
  }

  // 2. Check known titles
  if (
    titleLower.includes('marcruro') ||
    titleLower.includes('fe macro console') ||
    titleLower.includes('screen ocr') ||
    titleLower.startsWith('setting')
  ) {
    return true;
  }

  // 3. Check native window handles of all open Electron windows
  const allWins = BrowserWindow.getAllWindows();
  for (const w of allWins) {
    if (!w.isDestroyed()) {
      try {
        const handleBuf = w.getNativeWindowHandle();
        const hInt = handleBuf.readInt32LE ? handleBuf.readInt32LE(0) : handleBuf.readInt64LE(0);
        if (hInt && Number(info.hwnd) === Number(hInt)) {
          return true;
        }
      } catch { }
    }
  }

  return false;
}

function startFocusTracker() {
  if (trackerInterval) return;

  trackerInterval = setInterval(async () => {
    if (!win32.isSupported) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    try {
      const info = await win32.getForegroundWindowInfo();
      if (!info || !info.hwnd || info.hwnd === 0) return;

      // Ignore our own FE Macro Console window so clicking a button doesn't lose target
      if (isOurOwnWindow(info)) {
        return;
      }

      const detectedMode = detectModeFromWindow(info.title, info.processName);

      if (detectedMode) {
        const changed = detectedMode !== lastDetectedMode || info.hwnd !== currentTargetHwnd;
        lastDetectedMode = detectedMode;
        currentTargetHwnd = info.hwnd;

        if (changed && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('focus:changed', {
            mode: detectedMode,
            title: info.title,
            processName: info.processName,
            hwnd: info.hwnd,
          });
        }
      } else {
        const changed = info.hwnd !== currentTargetHwnd;
        currentTargetHwnd = info.hwnd;
        if (changed && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('focus:changed', {
            mode: null,
            title: info.title,
            processName: info.processName,
            hwnd: info.hwnd,
          });
        }
      }
    } catch (err) {
      // Ignore transient query error
    }
  }, 250);
}

function stopFocusTracker() {
  if (trackerInterval) {
    clearInterval(trackerInterval);
    trackerInterval = null;
  }
}

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    width: 400,
    height: Math.min(880, workAreaSize.height - 40),
    minWidth: 340,
    minHeight: 420,
    alwaysOnTop: true,
    backgroundColor: '#12141a',
    title: 'Marcruro',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.webContents.on('console-message', (_evt, level, message, line, sourceId) => {
      const levelNames = ['LOG', 'WARN', 'ERROR', 'INFO'];
      console.log(`[renderer:${levelNames[level] || level}] ${message} (${sourceId}:${line})`);
    });
  }

  mainWindow.on('close', () => {
    // Close settings window immediately if open
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
    // Close OCR overlay window immediately if open
    if (ocrOverlayWindow && !ocrOverlayWindow.isDestroyed()) {
      ocrOverlayWindow.close();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });

  updateCachedCommandSets();
  startFocusTracker();
}

app.whenReady().then(() => {
  createWindow();

  try {
    globalShortcut.register('Alt+Shift+S', () => {
      startOcrCapture();
    });
  } catch (e) {
    console.error('Failed to register Alt+Shift+S shortcut:', e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  stopFocusTracker();
  if (process.platform !== 'darwin') app.quit();
});

// =========================================================
// Helper: Focus target app window by key
// =========================================================

function getQueriesForApp(appKey) {
  const targetKey = appKey || lastDetectedMode;
  const appConfig = cachedCommandSets[targetKey];

  const queries = [];
  if (appConfig) {
    if (appConfig.process) queries.push(appConfig.process);
    if (Array.isArray(appConfig.processes)) queries.push(...appConfig.processes);
    if (appConfig.name) queries.push(appConfig.name);
    (appConfig.keywords || []).forEach((k) => queries.push(k));
  }
  queries.push(targetKey);
  return queries;
}

async function focusAppWindow(appKey) {
  const targetKey = appKey || lastDetectedMode;
  const queries = getQueriesForApp(targetKey);

  // 1. If we have a valid tracked HWND for the target app, focus it directly
  if (currentTargetHwnd && (await win32.isWindow(currentTargetHwnd))) {
    const ok = await win32.focusWindow(currentTargetHwnd);
    if (ok) return { ok: true, hwnd: currentTargetHwnd };
  }

  // 2. Query fallback (process names / window title keywords)
  const res = await win32.focusWindowByQueries(queries);
  if (res && res.ok && res.hwnd) {
    currentTargetHwnd = res.hwnd;
    lastDetectedMode = targetKey;
    return { ok: true, hwnd: res.hwnd };
  }

  return { ok: false, reason: `Could not find active window for ${targetKey}` };
}

// =========================================================
// IPC: Focus / Target Window & Running Apps
// =========================================================

ipcMain.handle('focus:getState', () => ({
  currentTargetHwnd,
  lastDetectedMode,
  nativeSupported: win32.isSupported,
}));

ipcMain.handle('macro:focusTarget', async (_evt, appKey) => {
  if (!win32.isSupported) return { ok: false, reason: 'Native support unavailable' };
  return focusAppWindow(appKey);
});

ipcMain.handle('app:getRunningApps', async () => {
  if (process.platform !== 'win32') {
    return [
      { processName: 'RemoteDesktopManager.exe', displayName: 'Remote Desktop Manager', processKey: 'RDM' },
      { processName: 'LINE.exe', displayName: 'LINE', processKey: 'LINE' },
      { processName: 'cmd.exe', displayName: 'Command Prompt', processKey: 'WINDOWS_CMD' },
      { processName: 'chrome.exe', displayName: 'Google Chrome', processKey: 'BROWSER' },
    ];
  }

  return new Promise((resolve) => {
    exec('tasklist /FO CSV /FI "SESSIONNAME eq Console"', { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }

      const IGNORED = new Set([
        'tasklist.exe', 'conhost.exe', 'svchost.exe', 'dwm.exe', 'smss.exe',
        'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'fontdrvhost.exe',
        'RuntimeBroker.exe', 'SearchHost.exe', 'StartMenuExperienceHost.exe',
        'TextInputHost.exe', 'SecurityHealthSystray.exe', 'ctfmon.exe', 'dllhost.exe',
        'backgroundTaskHost.exe', 'SystemSettings.exe', 'ApplicationFrameHost.exe',
        'electron.exe', 'node.exe'
      ]);

      const KNOWN_MAP = {
        'RemoteDesktopManager.exe': 'Remote Desktop Manager (RDM)',
        'mstsc.exe': 'Remote Desktop (mstsc)',
        'LINE.exe': 'LINE Messenger',
        'chrome.exe': 'Google Chrome',
        'msedge.exe': 'Microsoft Edge',
        'firefox.exe': 'Mozilla Firefox',
        'cmd.exe': 'Command Prompt (CMD)',
        'powershell.exe': 'Windows PowerShell',
        'WindowsTerminal.exe': 'Windows Terminal',
        'putty.exe': 'PuTTY SSH Client',
        'kitty.exe': 'KiTTY SSH Client',
        'SecureCRT.exe': 'SecureCRT',
        'Tabby.exe': 'Tabby Terminal',
        'FortiClient.exe': 'FortiClient',
        'AnyDesk.exe': 'AnyDesk',
        'Notepad.exe': 'Notepad',
        'EXCEL.EXE': 'Microsoft Excel',
        'WINWORD.EXE': 'Microsoft Word',
        'SnippingTool.exe': 'Snipping Tool',
      };

      const lines = stdout.trim().split('\n');
      const seen = new Set();
      const apps = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
        const proc = cols[0];
        const pid = parseInt(cols[1], 10);

        if (!proc || IGNORED.has(proc) || seen.has(proc.toLowerCase())) continue;
        seen.add(proc.toLowerCase());

        const baseName = proc.replace(/\.exe$/i, '');
        const displayName = KNOWN_MAP[proc] || baseName;

        apps.push({
          processName: proc,
          displayName,
          processKey: baseName.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
          pid,
        });
      }

      // Sort: Known apps first, then alphabetically
      apps.sort((a, b) => {
        const aKnown = KNOWN_MAP[a.processName] ? 0 : 1;
        const bKnown = KNOWN_MAP[b.processName] ? 0 : 1;
        if (aKnown !== bKnown) return aKnown - bKnown;
        return a.displayName.localeCompare(b.displayName);
      });

      resolve(apps);
    });
  });
});

// =========================================================
// IPC: Macro Keystroke Sending
// =========================================================

ipcMain.handle('macro:send', async (_evt, text, appKey) => {
  if (!win32.isSupported) {
    return { ok: false, reason: 'Win32 native automation unavailable' };
  }

  const normalizedText = typeof text === 'string'
    ? text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
    : text;

  const targetKey = appKey || lastDetectedMode;
  const queries = getQueriesForApp(targetKey);

  const res = await win32.focusAndSend(currentTargetHwnd, normalizedText, queries);
  if (res && res.ok) {
    if (res.hwnd) currentTargetHwnd = res.hwnd;
    lastDetectedMode = targetKey;
    return { ok: true };
  }

  return { ok: false, reason: 'Target window closed or lost!' };
});

ipcMain.handle('macro:sendBlueConfigIp', async (_evt, ipString, appKey) => {
  const targetKey = appKey || lastDetectedMode;
  const queries = getQueriesForApp(targetKey);

  const focusRes = await win32.focusWindowByQueries(queries);
  if (!focusRes.ok && (!currentTargetHwnd || !(await win32.isWindow(currentTargetHwnd)))) {
    return { ok: false, reason: 'Target window closed or lost!' };
  }

  const hwnd = focusRes.hwnd || currentTargetHwnd;

  const parts = ipString.split('.');
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    await win32.focusAndSend(hwnd, segment, queries);
    if (i < 3) {
      if (segment.length < 3) await win32.sendText('\t');
    } else {
      await win32.sendText('\t');
    }
  }
  return { ok: true };
});

// =========================================================
// IPC: Persisted Storage
// =========================================================

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(1080, workAreaSize.width - 40);
  const height = Math.min(780, workAreaSize.height - 40);

  settingsWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0d0f14',
    title: 'Marcruro — Setting',
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  if (isDev) {
    settingsWindow.webContents.openDevTools({ mode: 'detach' });
    settingsWindow.webContents.on('console-message', (_evt, level, message, line, sourceId) => {
      const levelNames = ['LOG', 'WARN', 'ERROR', 'INFO'];
      console.log(`[settings:${levelNames[level] || level}] ${message} (${sourceId}:${line})`);
    });
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function broadcastStoreUpdate(key, value) {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('store:updated', { key, value });
    }
  });
}

ipcMain.handle('store:get', (_evt, key, fallback) => store.get(key, fallback));
ipcMain.handle('store:set', (_evt, key, value) => {
  store.set(key, value);
  if (key === 'commandSets') {
    updateCachedCommandSets();
  }
  broadcastStoreUpdate(key, value);
  return true;
});
ipcMain.handle('store:delete', (_evt, key) => {
  store.delete(key);
  if (key === 'commandSets') {
    updateCachedCommandSets();
  }
  broadcastStoreUpdate(key, undefined);
  return true;
});

ipcMain.handle('settings:open', () => {
  openSettingsWindow();
  return true;
});

// =========================================================
// IPC: Export / Import Settings
// =========================================================

ipcMain.handle('file:exportConfig', async (_evt, data) => {
  const win = BrowserWindow.getFocusedWindow();
  const dateStr = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog(win, {
    title: 'Export Settings (Command Sets & Variables)',
    defaultPath: `fe-macro-settings-${dateStr}.json`,
    filters: [
      { name: 'Encrypted Config (*.femac)', extensions: ['femac'] },
      { name: 'JSON Config Files (*.json)', extensions: ['json'] },
    ],
  });

  if (res.canceled || !res.filePath) {
    return { ok: false, canceled: true };
  }

  try {
    fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, filePath: res.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:importConfig', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const res = await dialog.showOpenDialog(win, {
    title: 'Import Settings (Command Sets & Variables)',
    properties: ['openFile'],
    filters: [
      { name: 'Config Files (*.femac, *.json)', extensions: ['femac', 'json'] },
      { name: 'Encrypted Config (*.femac)', extensions: ['femac'] },
      { name: 'JSON Config Files (*.json)', extensions: ['json'] },
    ],
  });

  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  try {
    const content = fs.readFileSync(res.filePaths[0], 'utf8');
    const parsed = JSON.parse(content);
    return { ok: true, data: parsed, filePath: res.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:getWindowSupport', () => ({ nativeSupported: win32.isSupported, platform: process.platform }));

// =========================================================
// OCR Screen Capture & Text Recognition
// =========================================================

let ocrWorker = null;

async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker(['eng', 'tha']);
    await ocrWorker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    });
  }
  return ocrWorker;
}

async function startOcrCapture() {
  if (ocrOverlayWindow && !ocrOverlayWindow.isDestroyed()) {
    ocrOverlayWindow.focus();
    return { ok: true };
  }

  // Identify the target display where user's cursor currently is
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
  const { x, y, width, height } = activeDisplay.bounds;
  const scaleFactor = activeDisplay.scaleFactor || 1;

  const wasVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  if (wasVisible) {
    mainWindow.hide();
  }

  // Small delay to allow screen refresh without our console
  await new Promise((r) => setTimeout(r, 120));

  // Capture the physical screen from cursor point
  const captureRes = await win32.captureScreenPoint(cursorPoint.x, cursorPoint.y);

  if (wasVisible && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }

  if (!captureRes || !captureRes.ok || !captureRes.dataUrl) {
    return { ok: false, reason: captureRes?.error || 'Screenshot capture failed' };
  }

  openOcrOverlayWindow(captureRes, activeDisplay, scaleFactor);
  return { ok: true };
}

function openOcrOverlayWindow(captureData, activeDisplay, scaleFactor) {
  const { x, y, width, height } = activeDisplay.bounds;

  ocrOverlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    backgroundColor: '#000000',
    title: 'Marcruro — Screen OCR',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ocrOverlayWindow.setMenuBarVisibility(false);
  ocrOverlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'ocr-overlay.html'));

  ocrOverlayWindow.webContents.once('did-finish-load', () => {
    const variables = store.get('variables', []);
    const ocrMemory = store.get('ocrMemory', null);
    ocrOverlayWindow.webContents.send('ocr:captureData', {
      screenshot: captureData.dataUrl,
      width,
      height,
      scaleFactor,
      imageWidth: captureData.width,
      imageHeight: captureData.height,
      variables,
      ocrMemory,
    });
  });

  ocrOverlayWindow.on('closed', () => {
    ocrOverlayWindow = null;
  });
}

ipcMain.handle('ocr:startCapture', async () => {
  return startOcrCapture();
});

function normalizeOcrText(str) {
  if (!str) return '';
  let res = str
    // Fix "66:" or "C6:" misrecognized as CE:
    .replace(/\b(66|C6|CC)\s*:\s*/gi, 'CE : ')
    // Fix comma or colon or semicolon as dot in IPv4
    .replace(/(\b\d{1,3})[,:;](\d{1,3})[,:;](\d{1,3})[,:;](\d{1,3}\b)/g, '$1.$2.$3.$4')
    // Fix spaces around dots in IPv4
    .replace(/(\b\d{1,3})\s*\.\s*(\d{1,3})\s*\.\s*(\d{1,3})\s*\.\s*(\d{1,3}\b)/g, '$1.$2.$3.$4')
    // Fix slash spacing in CIDR
    .replace(/(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\/\s*(\d{1,2}\b)/g, '$1/$2')
    .trim();

  // Robust IPv4 repair
  res = repairIpv4(res);
  return res;
}

ipcMain.handle('ocr:recognize', async (_evt, { imageBase64, scale = 1 }) => {
  try {
    const worker = await getOcrWorker();
    const base64Data = (imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const result = await worker.recognize(buffer, {}, { text: true, tsv: true, blocks: true });
    const data = result?.data || {};

    const words = [];
    const lines = [];

    // 1. Extract words and lines from TSV
    if (typeof data.tsv === 'string' && data.tsv.length > 0) {
      const tsvLines = data.tsv.trim().split('\n');
      for (let i = 1; i < tsvLines.length; i++) {
        const cols = tsvLines[i].split('\t');
        if (cols.length < 12) continue;
        const level = cols[0];
        const left = Math.round((parseInt(cols[6], 10) || 0) / scale);
        const top = Math.round((parseInt(cols[7], 10) || 0) / scale);
        const width = Math.round((parseInt(cols[8], 10) || 0) / scale);
        const height = Math.round((parseInt(cols[9], 10) || 0) / scale);
        const conf = parseFloat(cols[10]) || 0;
        const rawText = (cols[11] || '').trim();
        const text = normalizeOcrText(rawText);

        if (level === '5' && text) {
          const wObj = {
            id: `w_${words.length}`,
            text,
            confidence: conf,
            bbox: {
              x0: left,
              y0: top,
              x1: left + width,
              y1: top + height,
            },
          };
          words.push(wObj);
          if (lines.length > 0) {
            lines[lines.length - 1].words.push(wObj);
          }
        } else if (level === '4' && text) {
          lines.push({
            id: `l_${lines.length}`,
            text,
            confidence: conf,
            bbox: {
              x0: left,
              y0: top,
              x1: left + width,
              y1: top + height,
            },
            words: [],
          });
        }
      }
    }

    // 2. Group lines into coherent cards (if adjacent vertically)
    const cards = [];
    const sortedLines = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);

    sortedLines.forEach((line) => {
      let matchedCard = null;
      for (const card of cards) {
        const xOverlap = Math.max(0, Math.min(card.bbox.x1, line.bbox.x1) - Math.max(card.bbox.x0, line.bbox.x0));
        const yDist = line.bbox.y0 - card.bbox.y1;
        if (xOverlap > 10 && yDist >= -5 && yDist <= 18) {
          matchedCard = card;
          break;
        }
      }

      if (matchedCard) {
        matchedCard.lines.push(line);
        matchedCard.text += '\n' + line.text;
        matchedCard.bbox.x0 = Math.min(matchedCard.bbox.x0, line.bbox.x0);
        matchedCard.bbox.y0 = Math.min(matchedCard.bbox.y0, line.bbox.y0);
        matchedCard.bbox.x1 = Math.max(matchedCard.bbox.x1, line.bbox.x1);
        matchedCard.bbox.y1 = Math.max(matchedCard.bbox.y1, line.bbox.y1);
      } else {
        cards.push({
          id: `card_${cards.length}`,
          text: line.text,
          lines: [line],
          bbox: { ...line.bbox },
        });
      }
    });

    const structured = processOcrText(data.text || '', words);

    return {
      ok: true,
      text: structured.rawText,
      words,
      lines,
      cards,
      ips: structured.ips,
      ports: structured.ports,
      labeledPairs: structured.labeledPairs,
      autoAssignments: structured.autoAssignments,
      lowConfidenceWords: structured.lowConfidenceWords,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ocr:applyValues', async (_evt, { values, ocrMemory }) => {
  if (ocrMemory) {
    store.set('ocrMemory', ocrMemory);
  }

  // Broadcast applied values to main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ocr:valuesApplied', values);
  }

  if (ocrOverlayWindow && !ocrOverlayWindow.isDestroyed()) {
    ocrOverlayWindow.close();
  }

  return { ok: true };
});

ipcMain.handle('ocr:closeOverlay', () => {
  if (ocrOverlayWindow && !ocrOverlayWindow.isDestroyed()) {
    ocrOverlayWindow.close();
  }
  return true;
});

// =========================================================
// Auto-Mover / AFK Prevention Loop (System-wide idle detection & mouse jiggle)
// =========================================================

const IDLE_THRESHOLD_MS = 180000; // 180 seconds (3 minutes)
const JIGGLE_INTERVAL_MS = 5000; // Jiggle mouse every 5 seconds when idle >= 180s

let autoMoverActive = false;
let autoMoverInterval = null;
let lastRealUserActivityTime = Date.now();
let lastRealUserCursorPoint = { x: 0, y: 0 };
let lastJiggleTimestamp = 0;
let isJigglingInProgress = false;

function startAutoMoverLoop() {
  if (autoMoverInterval) clearInterval(autoMoverInterval);

  lastRealUserActivityTime = Date.now();
  try {
    lastRealUserCursorPoint = screen.getCursorScreenPoint();
  } catch {
    lastRealUserCursorPoint = { x: 0, y: 0 };
  }
  lastJiggleTimestamp = 0;
  isJigglingInProgress = false;

  autoMoverInterval = setInterval(async () => {
    if (!autoMoverActive) return;

    try {
      let currentCursor = { x: 0, y: 0 };
      try {
        currentCursor = screen.getCursorScreenPoint();
      } catch { }

      const elapsedIdle = Date.now() - lastRealUserActivityTime;
      const isAfk = elapsedIdle >= IDLE_THRESHOLD_MS;

      const movedDist = Math.hypot(
        currentCursor.x - lastRealUserCursorPoint.x,
        currentCursor.y - lastRealUserCursorPoint.y
      );

      let userInterrupted = false;

      if (!isJigglingInProgress) {
        if (movedDist > 4) {
          // Real physical mouse movement detected
          userInterrupted = true;
        } else if (!isAfk) {
          // During active countdown (before AFK), keyboard activity also resets the countdown
          const rawIdleMs = await win32.getIdleTime();
          if (rawIdleMs < 1000) {
            userInterrupted = true;
          }
        }
      }

      if (userInterrupted) {
        lastRealUserActivityTime = Date.now();
        lastRealUserCursorPoint = currentCursor;
        lastJiggleTimestamp = 0;
      }

      const updatedElapsedIdle = Date.now() - lastRealUserActivityTime;
      const updatedIsAfk = updatedElapsedIdle >= IDLE_THRESHOLD_MS;
      const remainingSec = Math.max(0, Math.ceil((IDLE_THRESHOLD_MS - updatedElapsedIdle) / 1000));

      if (updatedIsAfk) {
        const now = Date.now();
        if (now - lastJiggleTimestamp >= JIGGLE_INTERVAL_MS) {
          lastJiggleTimestamp = now;
          isJigglingInProgress = true;
          const posBeforeJiggle = screen.getCursorScreenPoint();
          await win32.jiggleMouse(20);
          lastRealUserCursorPoint = posBeforeJiggle;
          setTimeout(() => {
            isJigglingInProgress = false;
          }, 200);
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('autoMover:tick', {
          enabled: true,
          remainingSec,
          isJiggling: updatedIsAfk,
          idleMs: updatedElapsedIdle,
        });
      }
    } catch (err) {
      console.error('AutoMover loop error:', err);
    }
  }, 1000);
}

function stopAutoMoverLoop() {
  if (autoMoverInterval) {
    clearInterval(autoMoverInterval);
    autoMoverInterval = null;
  }
  isJigglingInProgress = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('autoMover:tick', {
      enabled: false,
      remainingSec: 180,
      isJiggling: false,
      idleMs: 0,
    });
  }
}

ipcMain.handle('autoMover:toggle', async (_evt, enable) => {
  autoMoverActive = Boolean(enable);
  if (autoMoverActive) {
    startAutoMoverLoop();
  } else {
    stopAutoMoverLoop();
  }
  return { ok: true, active: autoMoverActive };
});

ipcMain.handle('autoMover:getState', async () => {
  return { active: autoMoverActive };
});


