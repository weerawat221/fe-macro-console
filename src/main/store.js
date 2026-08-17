// store.js
// Thin wrapper around electron-store. Replaces the Python tool's in-memory
// tabs_store dict — but persisted to disk (%APPDATA%/fe-macro-console/config.json)
// so custom commands, tabs, and credentials survive a restart.
//
// electron-store writes plain JSON on disk. Credentials are stored under a
// dedicated top-level key (see CREDENTIAL_FIELDS in defaultCommands.js) and
// are never bundled into source or logs. If stronger at-rest protection is
// needed (shared workstation, compliance requirement), swap the `encryptionKey`
// option below for a real secret sourced from an OS keychain — left off by
// default so the app runs without extra setup.

const Store = require('electron-store');
const { DEFAULT_COMMAND_SETS, DEFAULT_VARIABLES } = require('../shared/defaultCommands');

const store = new Store({
  name: 'config',
  defaults: {
    commandSets: DEFAULT_COMMAND_SETS,
    variables: DEFAULT_VARIABLES,
    tabs: [],
    credentials: {},
    settings: {
      theme: 'dark',
      pollIntervalMs: 700,
      confirmDestructive: true,
    },
  },
});

module.exports = {
  get(key, fallback) {
    return store.get(key, fallback);
  },
  set(key, value) {
    store.set(key, value);
  },
  delete(key) {
    store.delete(key);
  },
  get path() {
    return store.path;
  },
};
