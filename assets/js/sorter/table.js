// table rendering: category filter options, sorting, filtering and the stats
// shown in the three panel headers.

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { categoryLabel } from './categories.js';

export function renderCategoryOptions() {
  const select = document.getElementById('catFilter');
  if (!select) return;

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

  const known = state.categoryFilter === 'all'
    || state.categoryFilter === 'unsorted'
    || state.categories.some((cat) => cat.id === state.categoryFilter);

  if (!known) state.categoryFilter = 'all';
  select.value = state.categoryFilter;
}

export function compareTracks(a, b) {
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const key = state.sortKey;

  if (key === 'index') return (a.order - b.order) * dir;

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

  return state.tracks
    .filter((track) => {
      if (state.categoryFilter !== 'all' && track.category !== state.categoryFilter) return false;
      if (!needle) return true;
      const haystack = `${track.meta.artist} ${track.meta.title} ${track.meta.genre} ${track.meta.key} ${track.name}`.toLowerCase();
      return haystack.includes(needle);
    })
    .sort(compareTracks);
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
    body.innerHTML = `<tr><td colspan="7" class="cell-muted">${message}</td></tr>`;
    updateSortHeaders();
    return;
  }

  const rows = list.map((track, position) => {
    const override = state.overrides[track.id];
    const rawBadge = track.tagSource === 'filename' ? '<span class="tag-badge">raw</span>' : '';
    const selectClass = override ? 'cat-select overridden' : 'cat-select';

    return `<tr data-id="${escapeHtml(track.id)}">
      <td class="cell-index">${position + 1}</td>
      <td>${escapeHtml(track.meta.artist)}</td>
      <td class="cell-title">${escapeHtml(track.meta.title)}${rawBadge}</td>
      <td class="${track.meta.bpm ? '' : 'cell-muted'}">${escapeHtml(track.meta.bpm || '—')}</td>
      <td class="${track.meta.key ? '' : 'cell-muted'}">${escapeHtml(track.meta.key || '—')}</td>
      <td class="${track.meta.genre ? '' : 'cell-muted'}">${escapeHtml(track.meta.genre || '—')}</td>
      <td><select class="${selectClass}" data-track="${escapeHtml(track.id)}">${categoryOptionsHtml(track)}</select></td>
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
    th.textContent = active ? `${label} ${state.sortDir === 'asc' ? '^' : 'v'}` : label;
  });
}

export function updateStats() {
  const total = state.tracks.length;
  const sorted = state.tracks.filter((track) => track.category !== 'unsorted').length;
  const visible = getVisibleTracks().length;

  const folderStats = document.getElementById('folderStats');
  const catStats = document.getElementById('catStats');
  const exportStats = document.getElementById('exportStats');

  if (folderStats) folderStats.textContent = `${total} tracks`;
  if (catStats) catStats.textContent = `${sorted} / ${total} sorted`;
  if (exportStats) exportStats.textContent = `${visible} rows`;
}
