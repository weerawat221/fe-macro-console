// commandPanel.js
// Dynamic rendering of command groups and buttons based on detected application
// and active sub-mode.

import { state, getActiveAppSubmode } from '../state.js';
import { runCommand } from '../commandRunner.js';
import { t } from '../../shared/i18n.js';

export function renderCommandPanel() {
  const panel = document.getElementById('commandPanel');
  panel.innerHTML = '';

  const appKeys = Object.keys(state.commandSets);
  if (appKeys.length === 0) {
    drawEmptyState(panel, t('set_empty_title') + '. ' + t('set_empty_desc'));
    return;
  }

  const activeAppKey = state.lastDetectedMode || appKeys[0];
  const app = state.commandSets[activeAppKey];

  if (!app || !app.submodes) {
    drawEmptyState(panel, `${t('cmd_no_commands')} (${activeAppKey})`);
    return;
  }

  const currentSubmode = getActiveAppSubmode(activeAppKey);
  const subObj = app.submodes[currentSubmode];

  if (subObj && subObj.groups && Object.keys(subObj.groups).length > 0) {
    Object.entries(subObj.groups).forEach(([groupTitle, commands]) => {
      drawGroup(panel, groupTitle, commands, activeAppKey);
    });
  } else {
    drawEmptyState(panel, `${t('cmd_no_commands')} in ${app.name || activeAppKey} (${currentSubmode || 'Default'}).`);
  }
}

function drawGroup(panel, title, items, appKey) {
  const groupEl = document.createElement('div');
  groupEl.className = 'cmd-group';

  const titleEl = document.createElement('div');
  titleEl.className = 'cmd-group-title';
  titleEl.textContent = title;
  groupEl.appendChild(titleEl);

  const listEl = document.createElement('div');
  listEl.className = 'cmd-list';

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'cmd-btn' + (item.popup === 'full' ? ' cmd-btn--popup' : '');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    btn.appendChild(labelSpan);

    btn.addEventListener('click', () => {
      runCommand(item.template, item.popup, item.label, item.autoFocus !== false, appKey);
    });

    listEl.appendChild(btn);
  });

  groupEl.appendChild(listEl);
  panel.appendChild(groupEl);
}

function drawEmptyState(panel, text) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = text;
  panel.appendChild(el);
}
