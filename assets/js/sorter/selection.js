// track selection: the per-row checkbox plus the batch helpers above the table
// (check visible / uncheck all / invert selection). the analysis only ever
// looks at tracks flagged with selected === true.

import { state } from './state.js';
import { getVisibleTracks, renderTable, updateStats } from './table.js';
import { toast } from './utils.js';

export function getSelectedTracks() {
  return state.tracks.filter((track) => track.selected);
}

function refreshTable() {
  renderTable();
  updateStats();
}

export function checkVisibleTracks() {
  if (!state.tracks.length) {
    toast('pick a folder first');
    return;
  }

  const visible = getVisibleTracks();
  visible.forEach((track) => { track.selected = true; });
  refreshTable();
  toast(`checked ${visible.length} visible tracks`);
}

export function uncheckAllTracks() {
  if (!state.tracks.length) {
    toast('pick a folder first');
    return;
  }

  state.tracks.forEach((track) => { track.selected = false; });
  refreshTable();
  toast('all tracks unchecked');
}

// inverts only the rows that are currently visible (search + category filter).
export function invertTrackSelection() {
  if (!state.tracks.length) {
    toast('pick a folder first');
    return;
  }

  const visible = getVisibleTracks();
  visible.forEach((track) => { track.selected = !track.selected; });
  refreshTable();
  toast(`inverted ${visible.length} tracks`);
}

export function onTrackSelectionChange(event) {
  const box = event.target.closest('input[type="checkbox"][data-select]');
  if (!box) return;

  const track = state.tracks.find((item) => item.id === box.dataset.select);
  if (!track) return;

  track.selected = box.checked;
  const row = box.closest('tr');
  if (row) row.classList.toggle('is-selected', box.checked);
  updateStats();
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
