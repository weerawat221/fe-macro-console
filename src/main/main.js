// main.js
// Electron main process.
// Window management, focus tracking, Win32 input injection, running app enumeration,
// and store IPC handlers.

const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const win32 = require('../../native/sendinput_win32');
const store = require('./store');
const { DEFAULT_COMMAND_SETS, normalizeCommandSets } = require('../shared/defaultCommands');

const isDev = process.argv.includes('--dev');

let mainWindow = null;

// --- Focus tracker state ---
let currentTargetHwnd = null;
let lastDetectedMode = 'RDM';
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
  const procUpper = (processName || '').toUpperCase();

  for (const [modeKey, appConfig] of Object.entries(cachedCommandSets)) {
    const keyUpper = modeKey.toUpperCase();
    const appName = (appConfig.name || '').toUpperCase();
    const keywords = (appConfig.keywords || []).map((k) => String(k).toUpperCase());

    const procs = [];
    if (appConfig.process) procs.push(appConfig.process);
    if (Array.isArray(appConfig.processes)) procs.push(...appConfig.processes);

    // 1. Process name match (e.g. "LINE.EXE", "REMOTEDESKTOPMANAGER.EXE", "CMD.EXE")
    if (
      procs.some((p) => {
        const u = String(p).toUpperCase();
        return procUpper === u || procUpper.startsWith(u.replace(/\.EXE$/i, ''));
      })
    ) {
      return modeKey;
    }

    // 2. Keyword match in title or process
    if (keywords.some((k) => titleUpper.includes(k) || procUpper.includes(k))) {
      return modeKey;
    }

    // 3. Name match in title
    if (appName && titleUpper.includes(appName)) {
      return modeKey;
    }

    // 4. Mode key match in title
    if (titleUpper.includes(keyUpper)) {
      return modeKey;
    }
  }

  return null;
}

function startFocusTracker() {
  if (trackerInterval) return;

  const myPid = process.pid;

  trackerInterval = setInterval(async () => {
    if (!win32.isSupported) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    try {
      const info = await win32.getForegroundWindowInfo();
      if (!info || !info.hwnd || info.hwnd === 0) return;

      // Ignore our own FE Macro Console window so clicking a button doesn't lose target
      const titleLower = (info.title || '').toLowerCase();
      if (
        info.pid === myPid ||
        titleLower.includes('fe macro console') ||
        info.processName === 'electron.exe' ||
        info.processName === 'fe-macro-console.exe'
      ) {
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
      } else if (info.hwnd !== currentTargetHwnd) {
        currentTargetHwnd = info.hwnd;
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
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
  }, TRACKER_POLL_MS);
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
    title: 'FE Macro Console',
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  updateCachedCommandSets();
  startFocusTracker();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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

  const res = await win32.focusWindowByQueries(queries);
  if (res && res.ok && res.hwnd) {
    currentTargetHwnd = res.hwnd;
    lastDetectedMode = targetKey;
    return { ok: true, hwnd: res.hwnd };
  }

  if (currentTargetHwnd && (await win32.isWindow(currentTargetHwnd))) {
    const ok = await win32.focusWindow(currentTargetHwnd);
    if (ok) return { ok: true, hwnd: currentTargetHwnd };
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

  const targetKey = appKey || lastDetectedMode;
  const queries = getQueriesForApp(targetKey);

  const res = await win32.focusAndSend(currentTargetHwnd, text, queries);
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

let settingsWindow = null;

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(840, workAreaSize.width - 40);
  const height = Math.min(680, workAreaSize.height - 40);

  settingsWindow = new BrowserWindow({
    width,
    height,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#0d0f14',
    title: 'FE Macro Console — Setting',
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
    title: 'Export Settings (Command sets & Valuable)',
    defaultPath: `fe-macro-settings-${dateStr}.json`,
    filters: [{ name: 'JSON Config Files (*.json)', extensions: ['json'] }],
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
    title: 'Import Settings (Command sets & Valuable)',
    properties: ['openFile'],
    filters: [{ name: 'JSON Config Files (*.json)', extensions: ['json'] }],
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

