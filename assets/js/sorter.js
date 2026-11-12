// track sorter: scans a local music folder, reads tags, assigns dj categories,
// previews a rename mask and exports the result. the only network call is the
// opt-in deepseek pass (admin ai mode) with an in-memory api key.
// this file is only the entry point — the split parts live in ./sorter/.

import { state } from './sorter/state.js';
import { loadConfig } from './sorter/config.js';
import { bindEvents } from './sorter/events.js';
import { renderAll } from './sorter/render.js';
import { setAdminUI } from './sorter/admin.js';
import { initAiMode } from './sorter/ai.js';
import { initTargetCategories } from './sorter/multiSelect.js';
import { setStatus, hideProgress } from './sorter/utils.js';
import { initDebug, log, logWarn } from './sorter/debug.js';

// critical nodes the page cannot work without: missing ones are logged so a
// broken html edit shows up in the debug console instead of failing silently.
const REQUIRED_NODES = ['debugLog', 'folderInput', 'trackBody', 'analyzeStatus', 'catFilter'];

document.addEventListener('DOMContentLoaded', () => {
  initDebug();
  log('init: loading config...');

  loadConfig();
  log(`init: config loaded — ${state.categories.length} categories, mask "${state.mask}"`);

  initAiMode();
  initTargetCategories();
  log(`init: ${state.targetCategories.length} target categories checked`);

  bindEvents();
  log('init: events bound');

  state.sortKey = 'index';
  state.sortDir = 'asc';
  renderAll();
  setAdminUI(false);
  hideProgress();
  setStatus('no folder loaded.');

  REQUIRED_NODES.forEach((id) => {
    if (!document.getElementById(id)) logWarn(`init: dom node #${id} not found`);
  });

  log('ready — no folder loaded.');
});
