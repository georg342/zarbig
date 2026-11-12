// folder ingest + tag reading: turns the picked directory into track objects and
// reads the local tags so the table can be inspected. categorization is NOT run
// here — it only happens when the user clicks "analyze selected tracks".

import { state } from './state.js';
import { getExtension, isAudioFile, setStatus, toast, setProgress, hideProgress } from './utils.js';
import { emptyMeta, parseFilename, mergeMeta, hasAnyTag } from './metadata.js';
import { readTags } from './tags.js';
import { renderAll } from './render.js';

// one tag-reading pass at a time; newer calls queue behind the active one.
let activeRead = null;

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

  if (!files.length) {
    setStatus('no audio files in that folder.');
    toast('no audio files found');
    return;
  }

  const firstPath = files[0].webkitRelativePath || files[0].name;
  const root = firstPath.includes('/') ? firstPath.split('/')[0] : 'music folder';

  state.folderName = root;
  state.tracks = files.map((file, index) => buildTrack(file, index));
  state.overrides = {};
  state.filter = '';
  state.categoryFilter = 'all';
  state.scanning = false;
  state.scanId += 1; // cancels a tag read still running for the previous folder

  const search = document.getElementById('trackSearch');
  if (search) search.value = '';
  const catFilter = document.getElementById('catFilter');
  if (catFilter) catFilter.value = 'all';

  const fileLabel = document.getElementById('sorterFileName');
  if (fileLabel) fileLabel.textContent = root;

  const dropzone = document.getElementById('sorterDropzone');
  if (dropzone) dropzone.classList.add('has-file');

  const skipped = allFiles.length - files.length;
  setStatus(`${files.length} audio files found` + (skipped > 0 ? ` (${skipped} skipped)` : '') + ' — reading tags...');

  renderAll();

  // local tag reading only: no genre lookup, no ai, no categorization.
  readTrackTags(state.tracks).then((done) => {
    if (!done) return;
    const tagged = state.tracks.filter((track) => track.tagSource !== 'filename').length;
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

  setProgress(1);

  for (let i = 0; i < total; i += 1) {
    if (runId !== state.scanId) return false; // a newer folder took over

    const track = list[i];
    let tagMeta = emptyMeta();
    let source = 'none';

    try {
      const result = await readTags(track.file, track.ext);
      tagMeta = result.meta;
      source = result.source;
    } catch (err) {
      tagMeta = emptyMeta();
      source = 'none';
    }

    if (runId !== state.scanId) return false;

    track.meta = mergeMeta(parseFilename(track.name), tagMeta);
    track.tagSource = hasAnyTag(tagMeta) ? source : 'filename';
    track.tagsRead = true;

    if (i % 2 === 0 || i === total - 1) {
      setProgress(Math.round(((i + 1) / total) * 100));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (runId !== state.scanId) return false;

  state.scanning = false;
  hideProgress();
  renderAll();
  return true;
}

// reads tags for the tracks that still need them. returns true when the pass
// finished (or nothing was pending) and false when it was superseded.
export function readTrackTags(list) {
  const pending = Array.isArray(list) ? list.filter((track) => track && !track.tagsRead) : [];
  if (!pending.length) return Promise.resolve(true);
  if (activeRead) return activeRead.then(() => readTrackTags(list));

  activeRead = runTagRead(pending).finally(() => {
    activeRead = null;
  });
  return activeRead;
}

// "analyze tags" button: re-reads every local tag file, still without categorizing.
export async function readTagsOnly() {
  if (!state.tracks.length) {
    toast('pick a folder first');
    return;
  }

  state.tracks.forEach((track) => { track.tagsRead = false; });

  setStatus('reading tags...');
  const done = await readTrackTags(state.tracks);
  if (!done) return;

  const tagged = state.tracks.filter((track) => track.tagSource !== 'filename').length;
  setStatus(`${state.tracks.length} tracks read — ${tagged} with tags, ${state.tracks.length - tagged} from filename.`);
  toast('tags read');
}
