// table rendering: category filter options, sorting, filtering and the stats
// shown in the three panel headers.

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { categoryLabel } from './categories.js';
import { logDebug } from './debug.js';

export function renderCategoryOptions() {
  const select = document.getElementById('filterCategoryMulti');
  if (!select) return;

  const prevSelected = Array.from(select.selectedOptions).map((o) => o.value);

  select.innerHTML = '<option value="all">all categories</option>';
  state.categories.forEach((cat) => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.label;
    select.appendChild(option);
  });

  const unsorted = document.createElement('option');
  unsorted.value = 'unsorted';
  unsorted.textContent = 'unsorted';
  select.appendChild(unsorted);

  // restores the previous selection when it still exists, otherwise marks "all"
  const validValues = Array.from(select.options).map((o) => o.value);
  let restored = false;
  if (prevSelected.length) {
    Array.from(select.options).forEach((opt) => {
      if (prevSelected.includes(opt.value)) {
        opt.selected = true;
        restored = true;
      }
    });
  }
  if (!restored) select.value = 'all';

  logDebug(`filter: categories → ${Array.from(select.selectedOptions).map((o) => o.value).join(', ') || 'all'}`);
}

export function compareTracks(a, b) {
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const key = state.sortKey;

  if (key === 'index') return (a.order - b.order) * dir;

  // checkbox column: groups the unchecked rows first on asc and the checked
  // ones first on desc, keeping the folder order inside each group.
  if (key === 'selected') {
    const diff = Number(Boolean(a.selected)) - Number(Boolean(b.selected));
    if (diff !== 0) return diff * dir;
    return (a.order - b.order) * dir;
  }

  if (key === 'bpm') {
    const aBpm = parseFloat(a.meta.bpm);
    const bBpm = parseFloat(b.meta.bpm);
    const aNum = Number.isFinite(aBpm) ? aBpm : -1;
    const bNum = Number.isFinite(bBpm) ? bBpm : -1;
    if (aNum !== bNum) return (aNum - bNum) * dir;
    return a.meta.artist.localeCompare(b.meta.artist) * dir;
  }

  if (key === 'category') {
    const cmp = categoryLabel(a.category).localeCompare(categoryLabel(b.category));
    if (cmp !== 0) return cmp * dir;
    return (a.order - b.order) * dir;
  }

  const aValue = String(a.meta[key] || '').toLowerCase();
  const bValue = String(b.meta[key] || '').toLowerCase();
  if (aValue !== bValue) return aValue.localeCompare(bValue) * dir;
  return (a.order - b.order) * dir;
}

export function getVisibleTracks() {
  const needle = state.filter.trim().toLowerCase();
  const selectedOnly = document.getElementById('filterSelectedOnly')?.checked;
  const catFilterEl = document.getElementById('filterCategoryMulti');

  // every selected option counts as a filter, except the default "all"
  const selectedCats = catFilterEl ? Array.from(catFilterEl.selectedOptions).map((opt) => opt.value) : [];
  const hasCatFilter = selectedCats.length > 0 && !selectedCats.includes('all');

  return state.tracks
    .filter((track) => {
      if (selectedOnly && !track.selected) return false;
      if (hasCatFilter && !selectedCats.includes(track.category)) return false;
      if (!needle) return true;
      const haystack = `${track.meta.artist} ${track.meta.title} ${track.meta.genre} ${track.meta.key} ${track.name}`.toLowerCase();
      return haystack.includes(needle);
    })
    .sort(compareTracks);
}

// the tracks every action works on (exports and the rename preview): the
// checkbox selection when there is one, otherwise the rows the current search +
// category filter shows. the table sort is kept so {index} stays stable and the
// numbering restarts at 01 inside the chosen subset.
export function getActionableTracks() {
  const sorted = [...state.tracks].sort(compareTracks);
  const selected = sorted.filter((track) => track.selected);
  return selected.length ? selected : getVisibleTracks();
}

export function categoryOptionsHtml(track) {
  const options = state.categories.map((cat) => {
    const selected = cat.id === track.category ? ' selected' : '';
    return `<option value="${escapeHtml(cat.id)}"${selected}>${escapeHtml(cat.label)}</option>`;
  });
  const unsortedSelected = track.category === 'unsorted' ? ' selected' : '';
  options.push(`<option value="unsorted"${unsortedSelected}>unsorted</option>`);
  return options.join('');
}

export function renderTable() {
  const body = document.getElementById('trackBody');
  if (!body) return;

  const list = getVisibleTracks();

  if (!list.length) {
    const message = state.tracks.length
      ? 'nothing matches this filter.'
      : 'no tracks yet — pick a folder to start.';
    body.innerHTML = `<tr><td colspan="8" class="cell-muted">${message}</td></tr>`;
    updateSortHeaders();
    return;
  }

  const rows = list.map((track, position) => {
    const override = state.overrides[track.id];
    const rawBadge = track.tagSource === 'filename' ? '<span class="tag-badge">raw</span>' : '';
    const aiBadge = track.categorySource === 'ai' ? '<span class="tag-badge ai-badge">ai</span>' : '';
    const selectClass = override ? 'cat-select overridden' : 'cat-select';
    const extra = (track.categories || []).filter((id) => id !== track.category);
    const extraHtml = extra.length
      ? `<div class="cat-extra">${extra.map((id) => escapeHtml(categoryLabel(id))).join(' · ')}</div>`
      : '';

    return `<tr data-id="${escapeHtml(track.id)}" class="${track.selected ? 'is-selected' : ''}">
      <td class="cell-check"><input type="checkbox" data-select="${escapeHtml(track.id)}"${track.selected ? ' checked' : ''} aria-label="select track"></td>
      <td class="cell-index">${position + 1}</td>
      <td>${escapeHtml(track.meta.artist)}</td>
      <td class="cell-title">${escapeHtml(track.meta.title)}${rawBadge}${aiBadge}</td>
      <td class="${track.meta.bpm ? '' : 'cell-muted'}">${escapeHtml(track.meta.bpm || '—')}</td>
      <td class="${track.meta.key ? '' : 'cell-muted'}">${escapeHtml(track.meta.key || '—')}</td>
      <td class="${track.meta.genre ? '' : 'cell-muted'}">${escapeHtml(track.meta.genre || '—')}</td>
      <td><select class="${selectClass}" data-track="${escapeHtml(track.id)}">${categoryOptionsHtml(track)}</select>${extraHtml}</td>
    </tr>`;
  });

  body.innerHTML = rows.join('');
  updateSortHeaders();
}

export function updateSortHeaders() {
  document.querySelectorAll('.sorter-table th.sortable').forEach((th) => {
    const label = th.textContent.replace(/\s[\^v]$/, '');
    const active = th.dataset.sort === state.sortKey;
    th.classList.toggle('sorted', active);
    // aria-sort mirrors the visual arrow for screen readers
    th.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    th.textContent = active ? `${label} ${state.sortDir === 'asc' ? '^' : 'v'}` : label;
  });
}

export function updateStats() {
  const total = state.tracks.length;
  const sorted = state.tracks.filter((track) => track.category !== 'unsorted').length;
  const selected = state.tracks.filter((track) => track.selected).length;
  const actionable = getActionableTracks().length;

  const folderStats = document.getElementById('folderStats');
  const catStats = document.getElementById('catStats');
  const exportStats = document.getElementById('exportStats');
  const selectionStats = document.getElementById('selectionStats');

  if (folderStats) folderStats.textContent = `${total} tracks`;
  if (catStats) catStats.textContent = `${sorted} / ${total} sorted`;
  if (exportStats) exportStats.textContent = `${actionable} rows`;
  if (selectionStats) selectionStats.textContent = `${selected} / ${total} selected`;
}
