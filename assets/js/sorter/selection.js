// track selection: the per-row checkbox plus the batch helpers above the table
// (check visible / uncheck all / invert selection). the analysis only ever
// looks at tracks flagged with selected === true.

import { state } from './state.js';
import { getVisibleTracks, renderTable, updateStats } from './table.js';
import { renderRenamePreview } from './rename.js';
import { toast } from './utils.js';
import { logDebug } from './debug.js';

export function getSelectedTracks() {
  return state.tracks.filter((track) => track.selected);
}

// the table + stats + rename preview all follow the selection, so every batch
// action has to refresh the three of them.
function refreshTable() {
  renderTable();
  updateStats();
  renderRenamePreview();
}

export function checkVisibleTracks() {
  if (!state.tracks.length) {
    logDebug('select: check visible with no folder loaded');
    toast('pick a folder first');
    return;
  }

  const visible = getVisibleTracks();
  visible.forEach((track) => { track.selected = true; });
  refreshTable();
  logDebug(`select: checked ${visible.length} visible track(s)`);
  toast(`checked ${visible.length} visible tracks`);
}

export function uncheckAllTracks() {
  if (!state.tracks.length) {
    logDebug('select: uncheck all with no folder loaded');
    toast('pick a folder first');
    return;
  }

  state.tracks.forEach((track) => { track.selected = false; });
  refreshTable();
  logDebug(`select: unchecked ${state.tracks.length} track(s)`);
  toast('all tracks unchecked');
}

// inverts only the rows that are currently visible (search + category filter).
export function invertTrackSelection() {
  if (!state.tracks.length) {
    logDebug('select: invert with no folder loaded');
    toast('pick a folder first');
    return;
  }

  const visible = getVisibleTracks();
  visible.forEach((track) => { track.selected = !track.selected; });
  refreshTable();
  logDebug(`select: inverted ${visible.length} visible track(s)`);
  toast(`inverted ${visible.length} tracks`);
}

export function onTrackSelectionChange(event) {
  const box = event.target.closest('input[type="checkbox"][data-select]');
  if (!box) return;

  const track = state.tracks.find((item) => item.id === box.dataset.select);
  if (!track) {
    logDebug(`select: checkbox for unknown track id "${box.dataset.select}"`);
    return;
  }

  track.selected = box.checked;
  const row = box.closest('tr');
  if (row) row.classList.toggle('is-selected', box.checked);
  updateStats();
  renderRenamePreview();
}

export function bindSelectionEvents() {
  const tbody = document.getElementById('trackBody');
  if (tbody) tbody.addEventListener('change', onTrackSelectionChange);

  const btnCheckVisible = document.getElementById('btnCheckVisible');
  if (btnCheckVisible) btnCheckVisible.addEventListener('click', checkVisibleTracks);

  const btnUncheckAll = document.getElementById('btnUncheckAll');
  if (btnUncheckAll) btnUncheckAll.addEventListener('click', uncheckAllTracks);

  const btnInvertSelection = document.getElementById('btnInvertSelection');
  if (btnInvertSelection) btnInvertSelection.addEventListener('click', invertTrackSelection);
}
