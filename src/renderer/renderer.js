// renderer.js
// Application entry point. Loads persisted state, initializes UI zones and event listeners.

import { state, setState } from './state.js';
import {
  DEFAULT_COMMAND_SETS,
  DEFAULT_VARIABLES,
  normalizeCommandSets,
  normalizeVariables,
} from '../shared/defaultCommandsClient.js';

import { initHeader } from './ui/header.js';
import { initTabBar, loadTabsFromStore } from './ui/tabs.js';
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

  const firstAppKey = Object.keys(normalizedSets)[0] || 'RDM';
  const firstSubmode = Object.keys(normalizedSets[firstAppKey]?.submodes || {})[0] || 'DEFAULT';

  setState({
    commandSets: normalizedSets,
    variables: normalizedVars,
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

  const support = await window.feMacro.getWindowSupport();
  if (!support.nativeSupported) {
    showError(`Keystroke injection unavailable on ${support.platform} — Windows only. UI still usable for editing commands.`);
  }
}

bootstrap();
