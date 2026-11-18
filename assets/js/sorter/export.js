// exports: m3u8 / csv / json downloads and the clipboard list + report.

import { state } from './state.js';
import { downloadFile, copyText, escapeHtml, sanitizeFileName, toast } from './utils.js';
import { categoryLabel } from './categories.js';
import { getActionableTracks } from './table.js';
import { applyMask } from './rename.js';
import { log, logDebug } from './debug.js';

export function exportBaseName() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `zarbig-sorted-${stamp}`;
}

export function exportableTracks() {
  const list = getActionableTracks();
  if (!list.length) {
    logDebug('export: nothing to export — no selected or visible tracks');
    toast('nothing to export');
  }
  return list;
}

export function exportM3U() {
  const list = exportableTracks();
  if (!list.length) return;

  const lines = ['#EXTM3U'];
  list.forEach((track) => {
    const label = `${track.meta.artist} - ${track.meta.title}`;
    lines.push(`#EXTINF:-1,${label}`);
    lines.push(track.relativePath || track.name);
  });

  downloadFile(`${exportBaseName()}.m3u8`, lines.join('\n') + '\n', 'audio/x-mpegurl;charset=utf-8');
  log(`export: m3u8 with ${list.length} tracks`);
  toast('m3u8 exported');
}

export function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCSV() {
  const list = exportableTracks();
  if (!list.length) return;

  const header = ['artist', 'title', 'bpm', 'key', 'genre', 'category', 'categories', 'file'];
  const rows = list.map((track) => [
    track.meta.artist,
    track.meta.title,
    track.meta.bpm,
    track.meta.key,
    track.meta.genre,
    track.category,
    (track.categories && track.categories.length ? track.categories : [track.category]).join(' | '),
    track.relativePath || track.name
  ].map(csvCell).join(','));

  downloadFile(`${exportBaseName()}.csv`, [header.join(','), ...rows].join('\n') + '\n', 'text/csv;charset=utf-8');
  log(`export: csv with ${list.length} rows`);
  toast('csv exported');
}

export function exportJSON() {
  const list = exportableTracks();
  if (!list.length) return;

  const payload = list.map((track, index) => ({
    index: index + 1,
    artist: track.meta.artist,
    title: track.meta.title,
    bpm: track.meta.bpm ? Number(track.meta.bpm) : null,
    key: track.meta.key,
    genre: track.meta.genre,
    album: track.meta.album,
    year: track.meta.year,
    category: track.category,
    categories: track.categories && track.categories.length ? track.categories : [track.category],
    autoCategory: track.autoCategory,
    categorySource: track.categorySource,
    lookup: track.lookup || null,
    lookupStatus: track.lookupStatus || 'none',
    overridden: Boolean(state.overrides[track.id]),
    tagSource: track.tagSource,
    file: track.relativePath || track.name,
    renamed: `${applyMask(track, index)}.${track.ext}`
  }));

  downloadFile(`${exportBaseName()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  log(`export: json with ${list.length} tracks`);
  toast('json exported');
}

// base path is the root folder where the tracks live. the uploaded folder name
// is stripped from relativePath so the exported playlist does not repeat it.
export function stripUploadRoot(path, rootFolder) {
  const cleanPath = String(path || '').replace(/\//g, '\\').replace(/^\\+/, '');
  const root = String(rootFolder || '').trim();
  if (!root) return cleanPath;

  const parts = cleanPath.split('\\');
  if (parts.length > 1 && parts[0].toLowerCase() === root.toLowerCase()) {
    return parts.slice(1).join('\\');
  }
  return cleanPath;
}

export function buildVdjPath(track, basePath) {
  const relative = stripUploadRoot(track.relativePath || track.name || '', state.folderName);
  const root = String(basePath || '').trim().replace(/\//g, '\\').replace(/\\+$/, '');
  if (!root) return relative;
  return `${root}\\${relative.replace(/^[\\/]+/, '')}`;
}

export function exportVDJ() {
  const list = exportableTracks();
  if (!list.length) return;

  const baseInput = document.getElementById('vdjBasePath');
  const basePath = baseInput ? baseInput.value.trim() : '';

  const nameInput = document.getElementById('vdjPlaylistName');
  const customName = sanitizeFileName(nameInput ? nameInput.value.trim() : '');
  const categoryOnlyInput = document.getElementById('chkCategoryOnlyName');
  const categoryOnly = Boolean(categoryOnlyInput && categoryOnlyInput.checked);

  // group tracks by every category, so a multi-category track lands in all of
  // its playlists instead of only the primary one.
  const groups = new Map();
  list.forEach((track) => {
    const categories = Array.isArray(track.categories) && track.categories.length
      ? track.categories
      : [track.category || 'unsorted'];
    new Set(categories).forEach((cat) => {
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(track);
    });
  });

  let fileCount = 0;

  groups.forEach((tracks, category) => {
    const lines = ['#EXTM3U'];

    tracks.forEach((track) => {
      const path = buildVdjPath(track, basePath);

      // no escapeHtml here — the m3u needs the raw text
      lines.push(`#EXTINF:-1,${track.meta.artist} - ${track.meta.title}`);
      lines.push(path);
    });

    const safeCategory = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    let fileName = '';
    if (categoryOnly) {
      // category-only filenames: no timestamp prefix, no custom name.
      fileName = `${safeCategory}.m3u8`;
    } else if (customName) {
      // the custom name wins; the category suffix only shows up with more than one group
      const suffix = groups.size > 1 ? `-${safeCategory}` : '';
      fileName = `${customName}${suffix}.m3u8`;
    } else {
      fileName = `${exportBaseName()}-${safeCategory}.m3u8`;
    }

    downloadFile(fileName, lines.join('\n') + '\n', 'audio/x-mpegurl;charset=utf-8');
    fileCount++;
  });

  log(`export: ${fileCount} vdj m3u8 files (one per category) with base path: ${basePath || 'none'}${customName ? `, custom name: ${customName}` : ''}${categoryOnly ? ', category-only names' : ''}`);
  toast(`${fileCount} playlists exported!`);
}

export function copyToList() {
  const list = exportableTracks();
  if (!list.length) return;

  const text = list.map((track, index) => `${index + 1}. ${track.meta.artist} - ${track.meta.title}`).join('\n');
  log(`export: copied list of ${list.length} tracks`);
  copyText(text, 'list copied');
}

export function copyReport() {
  const list = exportableTracks();
  if (!list.length) return;

  const groups = new Map();
  list.forEach((track) => {
    const categories = Array.isArray(track.categories) && track.categories.length
      ? track.categories
      : [track.category || 'unsorted'];
    const primary = categories[0] || 'unsorted';
    if (!groups.has(primary)) groups.set(primary, []);
    groups.get(primary).push({ track, extras: categories.slice(1) });
  });

  const blocks = [];
  groups.forEach((entries, category) => {
    blocks.push(`## ${categoryLabel(category)} (${entries.length})`);
    entries.forEach(({ track, extras }) => {
      const meta = [track.meta.bpm ? `${track.meta.bpm} bpm` : '', track.meta.key].filter(Boolean).join(' / ');
      const also = extras.length
        ? ` (also: ${extras.map((id) => categoryLabel(id)).join(', ')})`
        : '';
      blocks.push(`- ${track.meta.artist} - ${track.meta.title}${meta ? ` (${meta})` : ''}${also}`);
    });
    blocks.push('');
  });

  log(`export: report with ${list.length} tracks in ${groups.size} categories`);
  copyText(blocks.join('\n').trim(), 'report copied');
}
