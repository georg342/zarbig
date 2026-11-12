// dom events + workspace reset. bindEvents() runs once on init.

import { state } from './state.js';
import { MASK_PRESETS } from './constants.js';
import { setStatus, toast, setProgress, hideProgress } from './utils.js';
import { categoryLabel } from './categories.js';
import { renderTable, updateStats } from './table.js';
import { applyMaskInput, renderRenamePreview } from './rename.js';
import { renderAll } from './render.js';
import { exportM3U, exportCSV, exportJSON, copyToList, copyReport } from './export.js';
import { analyzeTracks, onFolderSelected } from './scan.js';
import { commitConfig, resetMask } from './admin.js';
import { addCategory, resetCategories } from './adminCategories.js';

export function onCategoryChange(event) {
  const select = event.target.closest('select[data-track]');
  if (!select) return;

  const track = state.tracks.find((item) => item.id === select.dataset.track);
  if (!track) return;

  if (select.value === track.autoCategory) {
    delete state.overrides[track.id];
  } else {
    state.overrides[track.id] = select.value;
  }

  track.category = select.value;
  renderTable();
  updateStats();
  renderRenamePreview();
  toast(`marked as ${categoryLabel(select.value)}`);
}

export function resetWorkspace() {
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

  if (folderInput) folderInput.value = '';
  if (search) search.value = '';
  if (catFilter) catFilter.value = 'all';
  if (fileLabel) fileLabel.textContent = 'click to select a music folder';
  if (dropzone) dropzone.classList.remove('has-file');

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
  if (scanBtn) scanBtn.addEventListener('click', analyzeTracks);

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
      renderTable();
      updateStats();
      renderRenamePreview();
    });
  }

  document.querySelectorAll('.sorter-table th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      renderTable();
      updateStats();
      renderRenamePreview();
    });
  });

  const tbody = document.getElementById('trackBody');
  if (tbody) tbody.addEventListener('change', onCategoryChange);

  const btnExportM3U = document.getElementById('btnExportM3U');
  if (btnExportM3U) btnExportM3U.addEventListener('click', exportM3U);
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
