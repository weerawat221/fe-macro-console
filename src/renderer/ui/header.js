// header.js
// Header indicator for active target window, edit button, and collapsible fields.

import { state, setState } from '../state.js';
import { renderModeSelector } from './modeSelector.js';
import { renderCommandPanel } from './commandPanel.js';
import { renderFieldPanel } from './fieldPanel.js';
import { openEditorModal } from './editor.js';

let fieldsVisible = true;
let autoMoverActive = false;

export function initHeader() {
  document.getElementById('btnOcrCapture')?.addEventListener('click', () => {
    if (window.feMacro?.startOcrCapture) {
      window.feMacro.startOcrCapture();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      if (window.feMacro?.startOcrCapture) {
        window.feMacro.startOcrCapture();
      }
    }
  });

  document.getElementById('btnEditMode').addEventListener('click', () => {
    if (window.feMacro && window.feMacro.openSettings) {
      window.feMacro.openSettings();
    } else {
      openEditorModal();
    }
  });

  const filterBtn = document.getElementById('btnToggleFieldFilter');
  if (filterBtn) {
    updateFieldFilterButton();
    filterBtn.addEventListener('click', () => {
      setState({ showAllFields: !state.showAllFields });
      updateFieldFilterButton();
      if (window.feMacro?.storeSet) {
        window.feMacro.storeSet('showAllFields', state.showAllFields);
      }
      renderFieldPanel();
    });
  }

  const autoBtn = document.getElementById('btnAutoMover');
  if (autoBtn) {
    autoBtn.addEventListener('click', toggleAutoMover);
  }

  // Listen to main process system-wide AutoMover ticks
  if (window.feMacro?.onAutoMoverTick) {
    window.feMacro.onAutoMoverTick(({ enabled, remainingSec, isJiggling }) => {
      autoMoverActive = Boolean(enabled);
      const dot = document.getElementById('autoMoverDot');
      const label = document.getElementById('autoMoverLabel');
      const timer = document.getElementById('autoMoverTimer');

      if (autoMoverActive) {
        if (dot) dot.className = 'focus-dot focus-dot--live';
        if (label) label.textContent = isJiggling ? 'AFK' : 'ACTIVE';
        if (timer) {
          timer.textContent = isJiggling ? 'Jiggle (5s)' : `${remainingSec}s`;
        }
      } else {
        if (dot) dot.className = 'focus-dot focus-dot--idle';
        if (label) label.textContent = 'IDLE';
        if (timer) timer.textContent = '';
      }
    });
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

async function toggleAutoMover() {
  autoMoverActive = !autoMoverActive;
  if (window.feMacro?.autoMoverToggle) {
    await window.feMacro.autoMoverToggle(autoMoverActive);
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

export function updateFieldFilterButton() {
  const filterBtn = document.getElementById('btnToggleFieldFilter');
  if (!filterBtn) return;
  if (state.showAllFields) {
    filterBtn.innerHTML = '<i class="fa-solid fa-filter"></i> ALL';
    filterBtn.className = 'btn btn--primary btn--sm';
    filterBtn.title = 'Showing All Fields (Click to show only used fields)';
  } else {
    filterBtn.innerHTML = '<i class="fa-solid fa-filter"></i> USED';
    filterBtn.className = 'btn btn--ghost btn--sm';
    filterBtn.title = 'Showing Used Fields Only (Click to show all fields)';
  }
}

