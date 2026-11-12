// folder ingest + tag reading: turns the picked directory into track objects and
// reads the local tags so the table can be inspected. categorization is NOT run
// here — it only happens when the user clicks "analyze selected tracks".

import { state } from './state.js';
import { getExtension, isAudioFile, setStatus, toast, setProgress, hideProgress } from './utils.js';
import { emptyMeta, parseFilename, mergeMeta, hasAnyTag } from './metadata.js';
import { readTags } from './tags.js';
import { renderAll } from './render.js';
import { log, logDebug, logWarn, logError } from './debug.js';

// one tag-reading pass at a time; newer calls queue behind the active one.
let activeRead = null;

// tag reading is io-bound, so a handful of files run together per wave.
const CHUNK = 6;

export function buildTrack(file, index) {
  return {
    id: 't_' + index + '_' + Math.random().toString(36).slice(2, 8),
    file,
    order: index,
    name: file.name,
    ext: getExtension(file.name),
    relativePath: file.webkitRelativePath || file.name,
    size: file.size || 0,
    meta: { ...emptyMeta(), ...parseFilename(file.name) },
    selected: true,
    tagSource: 'none',
    tagsRead: false,
    autoCategory: 'unsorted',
    category: 'unsorted',
    categories: [],
    categorySource: 'none'
  };
}

export function onFolderSelected(event) {
  const allFiles = Array.from(event.target.files || []);
  const files = allFiles
    .filter(isAudioFile)
    .sort((a, b) => a.name.localeCompare(b.name));

  log(`folder: picked ${allFiles.length} files → ${files.length} audio`);

  if (!files.length) {
    logWarn(`folder: no audio files in the selection (${allFiles.length} candidates)`);
    setStatus('no audio files in that folder.');
    toast('no audio files found');
    return;
  }

  const firstPath = files[0].webkitRelativePath || files[0].name;
  const root = firstPath.includes('/') ? firstPath.split('/')[0] : 'music folder';
  logDebug(`folder: root "${root}", first file "${firstPath}"`);

  state.folderName = root;
  state.tracks = files.map((file, index) => buildTrack(file, index));
  state.overrides = {};
  state.filter = '';
  state.scanning = false;
  state.scanId += 1; // cancels a tag read still running for the previous folder
  logDebug(`folder: ${state.tracks.length} tracks queued, scan id ${state.scanId}`);

  const search = document.getElementById('trackSearch');
  if (search) search.value = '';
  const filterCat = document.getElementById('filterCategoryMulti');
  if (filterCat) filterCat.value = 'all';
  const filterSel = document.getElementById('filterSelectedOnly');
  if (filterSel) filterSel.checked = false;

  const fileLabel = document.getElementById('sorterFileName');
  if (fileLabel) fileLabel.textContent = root;

  const dropzone = document.getElementById('sorterDropzone');
  if (dropzone) dropzone.classList.add('has-file');

  const skipped = allFiles.length - files.length;
  if (skipped > 0) logDebug(`folder: skipped ${skipped} non-audio files`);
  setStatus(`${files.length} audio files found` + (skipped > 0 ? ` (${skipped} skipped)` : '') + ' — reading tags...');

  renderAll();

  // local tag reading only: no genre lookup, no ai, no categorization.
  readTrackTags(state.tracks).then((done) => {
    if (!done) return;
    const tagged = state.tracks.filter((track) => track.tagSource !== 'filename').length;
    log(`tags: ${state.tracks.length} tracks loaded — ${tagged} with tags, ${state.tracks.length - tagged} from filename`);
    setStatus(`${state.tracks.length} tracks loaded — ${tagged} with tags, ${state.tracks.length - tagged} from filename. select tracks and analyze.`);
    renderAll();
  });
}

async function runTagRead(list) {
  if (!list.length) return true;

  state.scanning = true;
  state.scanId += 1;
  const runId = state.scanId;
  const total = list.length;

  log(`tags: reading ${total} files...`);
  setProgress(1);

  for (let start = 0; start < total; start += CHUNK) {
    if (runId !== state.scanId) {
      logDebug('tags: pass superseded by a newer folder — stopped');
      hideProgress();
      return false; // a newer folder took over
    }

    const chunk = list.slice(start, start + CHUNK);
    let doneInChunk = 0;

    await Promise.all(chunk.map(async (track) => {
      if (runId !== state.scanId) {
        logDebug('tags: pass superseded by a newer folder — stopped');
        hideProgress();
        return;
      }

      let tagMeta = emptyMeta();
      let source = 'none';

      try {
        const result = await readTags(track.file, track.ext);
        tagMeta = result.meta;
        source = result.source;
      } catch (err) {
        logError(`tags: could not read "${track.name}" —`, err);
        tagMeta = emptyMeta();
        source = 'none';
      }

      if (runId !== state.scanId) {
        logDebug('tags: pass superseded by a newer folder — stopped');
        hideProgress();
        return;
      }

      track.meta = mergeMeta(parseFilename(track.name), tagMeta);
      track.tagSource = hasAnyTag(tagMeta) ? source : 'filename';
      track.tagsRead = true;

      doneInChunk += 1;
      const done = start + doneInChunk;
      if (done % 2 === 0 || done === total) setProgress(Math.round((done / total) * 100));
      logDebug(`tags ${done}/${total} [${track.tagSource}]: ${track.name}`);
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (runId !== state.scanId) {
    logDebug('tags: pass superseded by a newer folder — stopped');
    return false;
  }

  state.scanning = false;
  hideProgress();
  renderAll();
  log(`tags: done — ${total} files read`);
  return true;
}

// reads tags for the tracks that still need them. returns true when the pass
// finished (or nothing was pending) and false when it was superseded.
export function readTrackTags(list) {
  const pending = Array.isArray(list) ? list.filter((track) => track && !track.tagsRead) : [];
  if (!pending.length) return Promise.resolve(true);
  if (activeRead) {
    logDebug(`tags: read already running — ${pending.length} tracks queued behind it`);
    return activeRead.then(() => readTrackTags(list));
  }

  activeRead = runTagRead(pending).finally(() => {
    activeRead = null;
  });
  return activeRead;
}

// "analyze tags" button: re-reads every local tag file, still without categorizing.
export async function readTagsOnly() {
  if (!state.tracks.length) {
    logWarn('tags: re-read requested with no folder loaded');
    toast('pick a folder first');
    return;
  }

  log(`tags: re-reading every tag of ${state.tracks.length} tracks`);
  state.tracks.forEach((track) => { track.tagsRead = false; });

  setStatus('reading tags...');
  const done = await readTrackTags(state.tracks);
  if (!done) return;

  const tagged = state.tracks.filter((track) => track.tagSource !== 'filename').length;
  log(`tags: ${state.tracks.length} tracks read — ${tagged} with tags, ${state.tracks.length - tagged} from filename`);
  setStatus(`${state.tracks.length} tracks read — ${tagged} with tags, ${state.tracks.length - tagged} from filename.`);
  toast('tags read');
}
