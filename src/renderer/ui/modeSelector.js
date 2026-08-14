// modeSelector.js
// Dynamic sub-mode pill selector for the currently active application.
// Automatically renders sub-macro tabs (e.g. AP, ONU, Switch for RDM, or custom sub-modes).

import { state, setState, getActiveAppSubmode } from '../state.js';
import { renderCommandPanel } from './commandPanel.js';
import { renderFieldPanel } from './fieldPanel.js';

export function renderModeSelector() {
  const container = document.getElementById('modeSelector');
  container.innerHTML = '';

  const activeAppKey = state.lastDetectedMode || Object.keys(state.commandSets)[0] || 'RDM';
  const app = state.commandSets[activeAppKey];

  if (!app || !app.submodes) {
    container.style.display = 'none';
    return;
  }

  const submodeKeys = Object.keys(app.submodes);

  // If only 1 submode or empty, hide the sub-selector bar
  if (submodeKeys.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  const currentSubmode = getActiveAppSubmode(activeAppKey);

  submodeKeys.forEach((subKey) => {
    const subObj = app.submodes[subKey];
    const label = subObj.name || subKey;

    const pill = document.createElement('div');
    pill.className = 'mode-pill' + (currentSubmode === subKey ? ' mode-pill--active' : '');
    pill.textContent = label;
    pill.setAttribute('role', 'radio');
    pill.setAttribute('aria-checked', currentSubmode === subKey ? 'true' : 'false');
    pill.addEventListener('click', () => {
      state.activeSubmodes[activeAppKey] = subKey;
      setState({ activeSubmodes: { ...state.activeSubmodes } });
      renderModeSelector();
      renderFieldPanel();
      renderCommandPanel();
    });
    container.appendChild(pill);
  });
}
