// dom events + workspace reset. bindEvents() runs once on init.

import { state } from './state.js';
import { MASK_PRESETS } from './constants.js';
import { setStatus, toast, setProgress, hideProgress } from './utils.js';
import { categoryLabel } from './categories.js';
import { renderTable, updateStats } from './table.js';
import { applyMaskInput, renderRenamePreview } from './rename.js';
import { renderAll } from './render.js';
import { exportM3U, exportVDJ, exportCSV, exportJSON, copyToList, copyReport } from './export.js';
import { readTagsOnly, onFolderSelected } from './scan.js';
import { importVdjDatabase } from './vdj.js';
import { analyzeSelected } from './analysis.js';
import { bindSelectionEvents } from './selection.js';
import { bindMultiSelect } from './multiSelect.js';
import { commitConfig, resetMask } from './admin.js';
import { addCategory, resetCategories } from './adminCategories.js';
import { log, logDebug } from './debug.js';

export function onCategoryChange(event) {
  const select = event.target.closest('select[data-track]');
  if (!select) return;

  const track = state.tracks.find((item) => item.id === select.dataset.track);
  if (!track) {
    logDebug(`override: select for unknown track id "${select.dataset.track}"`);
    return;
  }

  if (select.value === track.autoCategory) {
    delete state.overrides[track.id];
    logDebug(`override: "${track.meta.artist} - ${track.meta.title}" back to auto (${track.autoCategory})`);
  } else {
    state.overrides[track.id] = select.value;
    logDebug(`override: "${track.meta.artist} - ${track.meta.title}" → ${select.value} (auto was ${track.autoCategory})`);
  }

  track.category = select.value;
  track.categories = select.value === 'unsorted' ? [] : [select.value];
  track.categorySource = state.overrides[track.id]
    ? 'manual'
    : (track.autoCategory === 'unsorted' ? 'none' : 'rule');
  renderTable();
  updateStats();
  renderRenamePreview();
  toast(`marked as ${categoryLabel(select.value)}`);
}

export function resetWorkspace() {
  log(`reset: clearing workspace (${state.tracks.length} tracks, ${Object.keys(state.overrides).length} overrides)`);

  state.tracks = [];
  state.folderName = '';
  state.overrides = {};
  state.filter = '';
  state.categoryFilter = 'all';
  state.scanning = false;
  state.scanId += 1; // stops a loop that is still reading tags

  const folderInput = document.getElementById('folderInput');
  const search = document.getElementById('trackSearch');
  const catFilter = document.getElementById('catFilter');
  const fileLabel = document.getElementById('sorterFileName');
  const dropzone = document.getElementById('sorterDropzone');
  const vdjInput = document.getElementById('vdjInput');

  if (folderInput) folderInput.value = '';
  if (search) search.value = '';
  if (catFilter) catFilter.value = 'all';
  if (fileLabel) fileLabel.textContent = 'click to select a music folder';
  if (dropzone) dropzone.classList.remove('has-file');
  if (vdjInput) vdjInput.value = '';

  setStatus('no folder loaded.');
  setProgress(0);
  hideProgress();
  renderAll();
  toast('workspace reset');
}

export function bindEvents() {
  const folderInput = document.getElementById('folderInput');
  if (folderInput) folderInput.addEventListener('change', onFolderSelected);

  const scanBtn = document.getElementById('btnScan');
  if (scanBtn) scanBtn.addEventListener('click', readTagsOnly);

  // virtualdj database import: the analyzed bpm/key live in database.xml.
  const vdjInput = document.getElementById('vdjInput');
  const vdjBtn = document.getElementById('btnImportVdj');
  if (vdjBtn && vdjInput) {
    vdjBtn.addEventListener('click', () => vdjInput.click());
    vdjInput.addEventListener('change', () => {
      const file = vdjInput.files && vdjInput.files[0];
      importVdjDatabase(file).then(() => { vdjInput.value = ''; });
    });
  }

  const analyzeBtn = document.getElementById('btnAnalyzeSelected');
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeSelected);

  bindSelectionEvents();
  bindMultiSelect();

  const resetBtn = document.getElementById('btnReset');
  if (resetBtn) resetBtn.addEventListener('click', resetWorkspace);

  const search = document.getElementById('trackSearch');
  if (search) {
    search.addEventListener('input', () => {
      state.filter = search.value;
      renderTable();
      updateStats();
      renderRenamePreview();
    });
  }

  const catFilter = document.getElementById('catFilter');
  if (catFilter) {
    catFilter.addEventListener('change', () => {
      state.categoryFilter = catFilter.value;
      logDebug(`filter: category → ${state.categoryFilter}`);
      renderTable();
      updateStats();
      renderRenamePreview();
    });
  }

  const sortableHeaders = document.querySelectorAll('.sorter-table th.sortable');
  // one place applies the sort, so click and keyboard stay in sync
  const aplicarOrdenacao = (th) => {
    const key = th.dataset.sort;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDir = 'asc';
    }
    logDebug(`table: sorted by ${state.sortKey} ${state.sortDir}`);
    renderTable();
    updateStats();
    renderRenamePreview();
  };
  sortableHeaders.forEach((th) => {
    th.addEventListener('click', () => aplicarOrdenacao(th));
    // keyboard parity for the header: enter and space sort
    th.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      aplicarOrdenacao(th);
    });
  });

  const tbody = document.getElementById('trackBody');
  if (tbody) tbody.addEventListener('change', onCategoryChange);

  const btnExportM3U = document.getElementById('btnExportM3U');
  if (btnExportM3U) btnExportM3U.addEventListener('click', exportM3U);
  const btnExportVdj = document.getElementById('btnExportVDJ');
  if (btnExportVdj) btnExportVdj.addEventListener('click', exportVDJ);
  const btnExportCsv = document.getElementById('btnExportCSV');
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportCSV);
  const btnExportJson = document.getElementById('btnExportJSON');
  if (btnExportJson) btnExportJson.addEventListener('click', exportJSON);
  const btnCopyList = document.getElementById('btnCopyList');
  if (btnCopyList) btnCopyList.addEventListener('click', copyToList);
  const btnCopyReport = document.getElementById('btnCopyReport');
  if (btnCopyReport) btnCopyReport.addEventListener('click', copyReport);

  const btnBuildRename = document.getElementById('btnBuildRename');
  if (btnBuildRename) {
    btnBuildRename.addEventListener('click', () => {
      logDebug('rename: preview rebuilt manually');
      renderRenamePreview();
      toast('preview rebuilt');
    });
  }

  const maskInput = document.getElementById('maskInput');
  if (maskInput) maskInput.addEventListener('input', applyMaskInput);

  const btnMaskPreset = document.getElementById('btnMaskPreset');
  if (btnMaskPreset) {
    btnMaskPreset.addEventListener('click', () => {
      const input = document.getElementById('maskInput');
      if (input) input.value = MASK_PRESETS.bpmKey;
      applyMaskInput();
      toast('bpm/key mask loaded');
    });
  }

  const btnResetMask = document.getElementById('btnResetMask');
  if (btnResetMask) btnResetMask.addEventListener('click', resetMask);

  const btnAddCategory = document.getElementById('btnAddCategory');
  if (btnAddCategory) btnAddCategory.addEventListener('click', addCategory);

  const btnResetCategories = document.getElementById('btnResetCategories');
  if (btnResetCategories) btnResetCategories.addEventListener('click', resetCategories);

  const btnSaveConfig = document.getElementById('btnSaveConfig');
  if (btnSaveConfig) btnSaveConfig.addEventListener('click', commitConfig);
}
