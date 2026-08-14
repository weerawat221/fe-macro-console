// renderer.js
// Application entry point. Loads persisted state, initializes UI zones and event listeners.

import { state, setState, getActiveTab } from './state.js';
import {
  DEFAULT_COMMAND_SETS,
  DEFAULT_VARIABLES,
  normalizeCommandSets,
  normalizeVariables,
} from '../shared/defaultCommandsClient.js';

import { initHeader } from './ui/header.js';
import { initTabBar, loadTabsFromStore, persistTabsToStore } from './ui/tabs.js';
import { renderFieldPanel } from './ui/fieldPanel.js';
import { renderModeSelector } from './ui/modeSelector.js';
import { renderCommandPanel } from './ui/commandPanel.js';
import { initConfirmModal } from './ui/confirmModal.js';
import { initEditor } from './ui/editor.js';
import { showError } from './ui/errorBanner.js';

import { loadAndApplyViewConfig, applyViewConfig, setCustomThemes } from './theme.js';

async function bootstrap() {
  await loadAndApplyViewConfig();

  // Load persisted commandSets
  const storedSets = await window.feMacro.storeGet('commandSets', null);
  const legacySets = await window.feMacro.storeGet('commandGroups', null);
  const normalizedSets = normalizeCommandSets(storedSets || legacySets || DEFAULT_COMMAND_SETS);

  // Load persisted variables
  const storedVars = await window.feMacro.storeGet('variables', null);
  const normalizedVars = normalizeVariables(storedVars || DEFAULT_VARIABLES);

  const showAllFields = await window.feMacro.storeGet('showAllFields', false);

  const firstAppKey = Object.keys(normalizedSets)[0] || 'RDM';
  const firstSubmode = Object.keys(normalizedSets[firstAppKey]?.submodes || {})[0] || 'DEFAULT';

  setState({
    commandSets: normalizedSets,
    variables: normalizedVars,
    showAllFields: !!showAllFields,
    editorActiveApp: firstAppKey,
    editorActiveSubmode: firstSubmode,
    activeSubmodes: {
      RDM: 'AP',
    },
  });

  // Init UI zones
  initHeader();
  initTabBar();
  initConfirmModal();
  initEditor();

  // Load tabs and render first frame
  await loadTabsFromStore();
  renderFieldPanel();
  renderModeSelector();
  renderCommandPanel();

  // Listen for real-time updates from standalone settings window
  if (window.feMacro.onStoreUpdated) {
    window.feMacro.onStoreUpdated(async ({ key, value }) => {
      if (key === 'commandSets') {
        setState({ commandSets: value || {} });
        renderModeSelector();
        renderFieldPanel();
        renderCommandPanel();
      } else if (key === 'variables') {
        setState({ variables: value || [] });
        renderFieldPanel();
        renderCommandPanel();
      } else if (key === 'customThemes') {
        setCustomThemes(value || {});
        const currentConfig = await window.feMacro.storeGet('viewConfig', null);
        if (currentConfig) applyViewConfig(currentConfig);
      } else if (key === 'viewConfig') {
        const latestCustomThemes = await window.feMacro.storeGet('customThemes', {});
        setCustomThemes(latestCustomThemes);
        applyViewConfig(value);
        renderFieldPanel();
        renderCommandPanel();
      }
    });
  }

  // Listen for OCR values applied from OCR overlay
  if (window.feMacro.onOcrValuesApplied) {
    window.feMacro.onOcrValuesApplied((values) => {
      if (!values || typeof values !== 'object') return;
      const tab = getActiveTab();
      if (!tab) return;

      Object.entries(values).forEach(([k, val]) => {
        if (val !== undefined && val !== null) {
          let cleaned = String(val).trim();
          const keyLower = k.toLowerCase();
          if (keyLower.includes('vlan')) {
            const m = cleaned.match(/\d+/);
            if (m) cleaned = m[0];
          } else if (keyLower.includes('ip') || keyLower.includes('stelnet') || keyLower.includes('lan') || keyLower.includes('ce') || keyLower.includes('pe')) {
            cleaned = cleaned.replace(/\/\d{1,2}$/, '');
            cleaned = cleaned.replace(/^(PE|CE|Lan|LAN|PORT|SW|OLT|AP|ONU)\s*:\s*/i, '');
            // Auto repair IP
            const chunks = cleaned.split('.').filter(Boolean);
            let octets = [];
            for (let i = 0; i < chunks.length; i++) {
              const c = chunks[i];
              if (c.length === 6) {
                octets.push(c.slice(0, 3), c.slice(3));
              } else if (c.length === 5) {
                octets.push(c.slice(0, 3), c.slice(3));
              } else if (c.length === 4) {
                if (octets.length === 2) octets.push(c.slice(0, 1), c.slice(1));
                else octets.push(c.slice(0, 2), c.slice(2));
              } else {
                octets.push(c);
              }
            }
            if (octets.length === 4 && octets.every((o) => parseInt(o, 10) <= 255)) {
              cleaned = octets.join('.');
            }
          }
          tab.values[k] = cleaned;
        }
      });

      renderFieldPanel();
      persistTabsToStore();
    });
  }

  const support = await window.feMacro.getWindowSupport();
  if (!support.nativeSupported) {
    showError(`Keystroke injection unavailable on ${support.platform} — Windows only. UI still usable for editing commands.`);
  }
}

bootstrap();
