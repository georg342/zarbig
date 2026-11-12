// track sorter: scans a local music folder, reads tags, assigns dj categories,
// previews a rename mask and exports the result. no network calls.
// this file is only the entry point — the split parts live in ./sorter/.

import { state } from './sorter/state.js';
import { loadConfig } from './sorter/config.js';
import { bindEvents } from './sorter/events.js';
import { renderAll } from './sorter/render.js';
import { setAdminUI } from './sorter/admin.js';
import { setStatus, hideProgress } from './sorter/utils.js';

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  bindEvents();
  state.sortKey = 'index';
  state.sortDir = 'asc';
  renderAll();
  setAdminUI(false);
  hideProgress();
  setStatus('no folder loaded.');
});
