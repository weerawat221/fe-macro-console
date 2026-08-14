// header.js
// Header indicator for active target window, edit button, and collapsible fields.

import { state, setState } from '../state.js';
import { renderModeSelector } from './modeSelector.js';
import { renderCommandPanel } from './commandPanel.js';
import { renderFieldPanel } from './fieldPanel.js';
import { openEditorModal } from './editor.js';

let fieldsVisible = true;
let autoMoverActive = false;
let autoMoverInterval = null;
let lastUserActivity = Date.now();
const IDLE_THRESHOLD_MS = 180000; // 3 minutes

export function initHeader() {
  document.getElementById('btnEditMode').addEventListener('click', () => {
    if (window.feMacro && window.feMacro.openSettings) {
      window.feMacro.openSettings();
    } else {
      openEditorModal();
    }
  });

  const toggleBtn = document.getElementById('btnToggleFields');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      fieldsVisible = !fieldsVisible;
      const panel = document.getElementById('fieldPanel');
      if (panel) {
        panel.style.display = fieldsVisible ? 'grid' : 'none';
      }
      toggleBtn.textContent = fieldsVisible ? '▲' : '▼';
    });
  }

  const autoBtn = document.getElementById('btnAutoMover');
  if (autoBtn) {
    autoBtn.addEventListener('click', toggleAutoMover);
    window.addEventListener('mousemove', resetActivity);
    window.addEventListener('keydown', resetActivity);
  }

  window.feMacro.onFocusChanged((payload) => {
    setState({
      lastDetectedMode: payload.mode || state.lastDetectedMode,
      focusTitle: payload.title,
      currentTargetHwnd: payload.hwnd,
    });
    updateFocusIndicator();
    renderModeSelector();
    renderFieldPanel();
    renderCommandPanel();
  });

  updateFocusIndicator();
}

function resetActivity() {
  lastUserActivity = Date.now();
}

function toggleAutoMover() {
  autoMoverActive = !autoMoverActive;
  const dot = document.getElementById('autoMoverDot');
  const label = document.getElementById('autoMoverLabel');
  const timer = document.getElementById('autoMoverTimer');

  if (autoMoverActive) {
    if (dot) dot.className = 'focus-dot focus-dot--live';
    if (label) label.textContent = 'ACTIVE';
    lastUserActivity = Date.now();

    if (!autoMoverInterval) {
      autoMoverInterval = setInterval(() => {
        if (!autoMoverActive) return;
        const elapsed = Date.now() - lastUserActivity;
        const remainingSec = Math.max(0, Math.ceil((IDLE_THRESHOLD_MS - elapsed) / 1000));
        if (timer) {
          timer.textContent = `${remainingSec}s`;
        }
      }, 1000);
    }
  } else {
    if (dot) dot.className = 'focus-dot focus-dot--idle';
    if (label) label.textContent = 'IDLE';
    if (timer) timer.textContent = '';
    if (autoMoverInterval) {
      clearInterval(autoMoverInterval);
      autoMoverInterval = null;
    }
  }
}

function updateFocusIndicator() {
  const dot = document.getElementById('focusDot');
  const label = document.getElementById('focusLabel');

  if (state.focusTitle) {
    if (dot) dot.className = 'focus-dot focus-dot--live';
    const app = state.commandSets[state.lastDetectedMode];
    const appName = app ? app.name : state.lastDetectedMode;
    if (label) label.textContent = `${appName} · ${state.focusTitle.slice(0, 28)}`;
  } else {
    if (dot) dot.className = 'focus-dot focus-dot--idle';
    if (label) label.textContent = 'Waiting for target window…';
  }
}
