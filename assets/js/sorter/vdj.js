// virtualdj import: vdj analyzes every track and keeps the bpm/key in its own
// database.xml — the audio files themselves stay untagged. the xml stores the
// bpm as the beat period in seconds, so the real bpm is 60 / period. imported
// values only fill empty fields: whatever came from the tags wins.

import { state } from './state.js';
import { normalizeBpm, normalizeKey } from './metadata.js';
import { renderAll } from './render.js';
import { setStatus, toast } from './utils.js';
import { log, logWarn } from './debug.js';

// 0.461542 s per beat -> 130 bpm. one decimal is what vdj displays.
export function bpmFromPeriod(value) {
  const period = parseFloat(String(value == null ? '' : value).replace(',', '.'));
  if (!Number.isFinite(period) || period <= 0) return '';
  return normalizeBpm(String(Math.round((60 / period) * 10) / 10));
}

export function baseName(filePath) {
  const parts = String(filePath || '').split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

function attr(node, name) {
  return node ? String(node.getAttribute(name) || '').trim() : '';
}

// <Song FilePath="..." FileSize="..."><Scan Bpm="0.461542" Key="F#m"/></Song>
// -> [{ name, size, bpm, key }]. songs without bpm and key are skipped.
export function parseVdjDatabase(text) {
  const xml = String(text || '');
  if (!xml.trim()) return [];

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (!doc || doc.getElementsByTagName('parsererror').length) {
    logWarn('vdj: the file is not valid xml');
    return [];
  }

  const entries = [];
  Array.from(doc.getElementsByTagName('Song')).forEach((song) => {
    const scan = song.getElementsByTagName('Scan')[0];
    const bpm = bpmFromPeriod(attr(scan, 'Bpm'));
    const key = normalizeKey(attr(scan, 'Key'));
    if (!bpm && !key) return;

    const name = baseName(attr(song, 'FilePath'));
    if (!name) return;

    const size = parseInt(attr(song, 'FileSize'), 10);
    entries.push({ name, size: Number.isFinite(size) ? size : 0, bpm, key });
  });
  return entries;
}

// two indexes: exact filename and byte size (encoding-safe when names differ).
export function buildVdjIndex(entries) {
  const byName = new Map();
  const bySize = new Map();
  (entries || []).forEach((entry) => {
    if (!entry || !entry.name) return;
    if (entry.size) bySize.set(entry.size, entry);
    const nameKey = entry.name.toLowerCase();
    if (!byName.has(nameKey)) byName.set(nameKey, entry);
  });
  return { byName, bySize };
}

function pickEntry(index, track) {
  const named = index.byName.get(String(track.name || '').toLowerCase());
  const sized = index.bySize.get(track.size);
  // the name wins unless it belongs to a file with another size.
  if (named && (!named.size || named.size === track.size)) return named;
  return sized || null;
}

// fills bpm/key from the vdj entries; returns the counters used by the log.
export function applyVdjMetadata(entries) {
  const index = buildVdjIndex(entries);
  const stats = { entries: (entries || []).length, matched: 0, bpm: 0, key: 0 };

  state.tracks.forEach((track) => {
    const entry = pickEntry(index, track);
    if (!entry) return;

    let filled = false;
    if (entry.bpm && !track.meta.bpm) { track.meta.bpm = entry.bpm; stats.bpm += 1; filled = true; }
    if (entry.key && !track.meta.key) { track.meta.key = entry.key; stats.key += 1; filled = true; }
    stats.matched += 1;
    // only upgrade tracks whose values came from the filename.
    if (filled && (track.tagSource === 'filename' || track.tagSource === 'none')) track.tagSource = 'vdj';
  });

  return stats;
}

// reads the picked database.xml, fills the tracks and repaints the table.
export function importVdjDatabase(file) {
  if (!file) return Promise.resolve(false);
  if (!state.tracks.length) {
    logWarn('vdj: import requested with no folder loaded');
    toast('pick a folder first');
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => {
      logWarn('vdj: could not read the file', reader.error);
      toast('could not read that file');
      resolve(false);
    };

    reader.onload = () => {
      let entries = [];
      try {
        entries = parseVdjDatabase(reader.result);
      } catch (err) {
        logWarn('vdj: parse failed', err);
      }

      if (!entries.length) {
        logWarn('vdj: no bpm/key found — is it virtualdj database.xml?');
        setStatus('virtualdj: that file has no bpm/key data.');
        toast('no bpm/key in that file');
        resolve(false);
        return;
      }

      const stats = applyVdjMetadata(entries);
      renderAll();
      log(`vdj: ${stats.matched}/${state.tracks.length} tracks matched — ${stats.bpm} bpm, ${stats.key} keys (${stats.entries} songs with analysis in the db)`);
      setStatus(`virtualdj: ${stats.matched}/${state.tracks.length} tracks matched — ${stats.bpm} bpm and ${stats.key} keys filled.`);
      toast(`virtualdj: ${stats.matched} tracks matched`);
      resolve(true);
    };

    try {
      reader.readAsText(file, 'utf-8');
    } catch (err) {
      logWarn('vdj: readAsText threw', err);
      resolve(false);
    }
  });
}