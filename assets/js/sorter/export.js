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

  const header = ['artist', 'title', 'bpm', 'key', 'genre', 'category', 'file'];
  const rows = list.map((track) => [
    track.meta.artist,
    track.meta.title,
    track.meta.bpm,
    track.meta.key,
    track.meta.genre,
    track.category,
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
    overridden: Boolean(state.overrides[track.id]),
    tagSource: track.tagSource,
    file: track.relativePath || track.name,
    renamed: `${applyMask(track, index)}.${track.ext}`
  }));

  downloadFile(`${exportBaseName()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  log(`export: json with ${list.length} tracks`);
  toast('json exported');
}

export function exportVDJ() {
  const list = exportableTracks();
  if (!list.length) return;

  const baseInput = document.getElementById('vdjBasePath');
  const basePath = baseInput ? baseInput.value.trim() : '';

  const nameInput = document.getElementById('vdjPlaylistName');
  const customName = sanitizeFileName(nameInput ? nameInput.value.trim() : '');

  // group tracks by category
  const groups = new Map();
  list.forEach((track) => {
    const cat = track.category || 'unsorted';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(track);
  });

  let fileCount = 0;

  groups.forEach((tracks, category) => {
    const lines = ['#EXTM3U'];

    tracks.forEach((track) => {
      let path = track.file && track.file.path ? track.file.path : track.relativePath;
      // normalize to backslash
      path = path.replace(/\//g, '\\');

      if (basePath) {
        const baseClean = basePath.replace(/[\\\/]+$/, '');
        const pathClean = path.replace(/^[\\\/]+/, '');
        const lastBaseFolder = baseClean.split('\\').pop();
        let dedupePath = pathClean;

        if (lastBaseFolder) {
          const escapedFolder = lastBaseFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const reg = new RegExp(`^${escapedFolder}\\\\`, 'i');
          if (reg.test(dedupePath)) {
            dedupePath = dedupePath.replace(reg, '');
          }
        }
        path = baseClean + '\\' + dedupePath;
      }

      // no escapeHtml here — the m3u needs the raw text
      lines.push(`#EXTINF:-1,${track.meta.artist} - ${track.meta.title}`);
      lines.push(path);
    });

    let fileName = '';
    if (customName) {
      // the custom name wins; the category suffix only shows up with more than one group
      const suffix = groups.size > 1 ? `-${category.replace(/[^a-z0-9]/gi, '_').toLowerCase()}` : '';
      fileName = `${customName}${suffix}.m3u8`;
    } else {
      const safeCategory = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      fileName = `${exportBaseName()}-${safeCategory}.m3u8`;
    }

    downloadFile(fileName, lines.join('\n') + '\n', 'audio/x-mpegurl;charset=utf-8');
    fileCount++;
  });

  log(`export: ${fileCount} vdj m3u8 files (one per category) with base path: ${basePath || 'none'}${customName ? `, custom name: ${customName}` : ''}`);
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
    if (!groups.has(track.category)) groups.set(track.category, []);
    groups.get(track.category).push(track);
  });

  const blocks = [];
  groups.forEach((tracks, category) => {
    blocks.push(`## ${categoryLabel(category)} (${tracks.length})`);
    tracks.forEach((track) => {
      const extras = [track.meta.bpm ? `${track.meta.bpm} bpm` : '', track.meta.key].filter(Boolean).join(' / ');
      blocks.push(`- ${track.meta.artist} - ${track.meta.title}${extras ? ` (${extras})` : ''}`);
    });
    blocks.push('');
  });

  log(`export: report with ${list.length} tracks in ${groups.size} categories`);
  copyText(blocks.join('\n').trim(), 'report copied');
}
