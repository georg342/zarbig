// folder scan + tag analysis: turns the picked directory into track objects,
// reads the tags with a yield every couple of files and recategorizes.

import { state } from './state.js';
import { getExtension, isAudioFile, setStatus, toast, setProgress, hideProgress } from './utils.js';
import { emptyMeta, parseFilename, mergeMeta, hasAnyTag } from './metadata.js';
import { readTags } from './tags.js';
import { recategorizeAll } from './categories.js';
import { renderAll } from './render.js';

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
    tagSource: 'none',
    autoCategory: 'unsorted',
    category: 'unsorted'
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
  state.scanning = false; // cancels any in-flight analysis of the previous folder

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
  analyzeTracks();
}

export async function analyzeTracks() {
  if (!state.tracks.length) {
    toast('pick a folder first');
    return;
  }
  if (state.scanning) return;

  state.scanning = true;
  state.scanId += 1;
  const runId = state.scanId;

  const scanBtn = document.getElementById('btnScan');
  if (scanBtn) scanBtn.disabled = true;

  const total = state.tracks.length;
  setProgress(1);

  for (let i = 0; i < total; i += 1) {
    if (runId !== state.scanId) return; // a newer folder took over

    const track = state.tracks[i];
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

    if (runId !== state.scanId) return;

    track.meta = mergeMeta(parseFilename(track.name), tagMeta);
    track.tagSource = hasAnyTag(tagMeta) ? source : 'filename';

    if (i % 2 === 0 || i === total - 1) {
      setProgress(Math.round(((i + 1) / total) * 100));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  recategorizeAll();
  state.scanning = false;
  if (scanBtn) scanBtn.disabled = false;
  hideProgress();

  const tagged = state.tracks.filter((track) => track.tagSource !== 'filename').length;
  setStatus(`${total} tracks analyzed — ${tagged} with tags, ${total - tagged} from filename.`);
  renderAll();
  toast('folder analyzed');
}
