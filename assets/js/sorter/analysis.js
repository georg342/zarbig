// manual analysis trigger: loading a folder never categorizes anything. this
// module dispatches the selected tracks to one of the modes: local presets,
// jina metadata + genre, hybrid genre/ai fallback or ai-defined taxonomy.

import { state } from './state.js';
import { getSelectedTracks } from './selection.js';
import { readTrackTags } from './scan.js';
import { applyGenreAnalysis, autoCategoryFor, tracksWithoutGenre } from './categories.js';
import { lookupTracks } from './lookup.js';
import { activeCategoryIds } from './multiSelect.js';
import {
  assignUnresolvedWithAi,
  categorizeWithAiTaxonomy,
  getCategorizeMode,
  getEphemeralDeepseekKey
} from './ai.js';
import { toast, setStatus, setProgress, hideProgress } from './utils.js';
import { renderAll } from './render.js';
import { log, logDebug, logWarn, logError } from './debug.js';

async function ensureTags(tracks) {
  if (!tracks.some((track) => !track.tagsRead)) return true;
  logDebug('analyze: selected tracks still missing tags — reading first');
  setStatus('reading tags...');
  return readTrackTags(tracks);
}

function applyRuleAnalysis(tracks, categoryIds) {
  const allowed = new Set(categoryIds);
  let categorized = 0;

  tracks.forEach((track) => {
    const best = autoCategoryFor(track, allowed);
    track.autoCategory = best;

    const override = state.overrides[track.id];
    const final = override || best;

    track.category = final;
    track.categories = final === 'unsorted' ? [] : [final];
    track.categorySource = override ? 'manual' : (best === 'unsorted' ? 'none' : 'rule');

    if (best !== 'unsorted') categorized += 1;

    logDebug(
      `rule: ${track.meta.artist} - ${track.meta.title} [${track.meta.bpm || '?'} bpm / ${track.meta.key || '?'} / ${track.meta.genre || '?'}] → ${final} (${track.categorySource})`
    );
  });

  return categorized;
}

async function runLookup(tracks) {
  setStatus(`fetching metadata (0/${tracks.length})...`);
  setProgress(1);

  const stats = await lookupTracks(tracks, {
    onProgress: (done, total) => {
      setStatus(`fetching metadata (${done}/${total})...`);
      setProgress(Math.round((done / total) * 100));
    }
  });

  hideProgress();
  renderAll();
  log(`lookup: ${stats.resolved} resolved, ${stats.unresolved} unresolved, ${stats.requests} request(s)`);
  return stats;
}

// admin button: fill genre/bpm/key through beatport/bandcamp without sending
// anything to deepseek.
export async function lookupSelectedMetadata() {
  const selected = getSelectedTracks();
  if (!selected.length) {
    logWarn('lookup: no selected tracks');
    toast('select at least 1 track first!');
    return;
  }

  const tagsReady = await ensureTags(selected);
  if (!tagsReady) return;

  const stats = await runLookup(selected);
  if (stats.cancelled) {
    setStatus('metadata lookup cancelled.');
    return;
  }

  setStatus(`metadata lookup — ${stats.resolved} resolved, ${stats.unresolved} unresolved (${stats.requests} request(s), ${stats.cacheHits} cache hit(s)).`);
  toast(`${stats.resolved} genres found`);
}

async function runGenreMode(tracks) {
  const stats = await runLookup(tracks);
  if (stats.cancelled) {
    setStatus('metadata lookup cancelled.');
    return;
  }

  const categorized = applyGenreAnalysis(tracks);
  renderAll();
  setStatus(`genre mode — ${stats.resolved} resolved by metadata, ${categorized} categorized.`);
  toast(`${categorized} tracks categorized by genre`);
  log(`genre: done — ${categorized} / ${tracks.length} tracks categorized`);
}

async function runHybridMode(tracks) {
  const stats = await runLookup(tracks);
  if (stats.cancelled) {
    setStatus('metadata lookup cancelled.');
    return;
  }

  const categorized = applyGenreAnalysis(tracks);
  renderAll();
  const unresolved = tracksWithoutGenre(tracks);

  if (!unresolved.length) {
    setStatus(`hybrid mode — all ${tracks.length} selected tracks resolved by metadata.`);
    toast(`${categorized} tracks categorized by genre`);
    log(`hybrid: no unresolved tracks — deepseek not needed`);
    return;
  }

  if (!getEphemeralDeepseekKey().trim()) {
    setStatus(`hybrid mode — ${unresolved.length} tracks unresolved. enter the deepseek key to send them to ai.`);
    toast('enter your deepseek api key for unresolved tracks');
    logWarn(`hybrid: ${unresolved.length} unresolved track(s) — deepseek key missing`);
    return;
  }

  const existingCategories = state.categories.filter((cat) => cat.source === 'genre');
  setStatus(`ai fallback (0/${unresolved.length})...`);
  setProgress(1);

  try {
    const aiCategorized = await assignUnresolvedWithAi(unresolved, existingCategories, {
      onProgress: (done, total) => {
        setStatus(`ai fallback (${done}/${total})...`);
        setProgress(Math.round((done / total) * 100));
      }
    });

    hideProgress();
    renderAll();
    setStatus(`hybrid mode — ${categorized} by genre, ${aiCategorized}/${unresolved.length} unresolved categorized by ai.`);
    toast(`${aiCategorized} unresolved tracks categorized by ai`);
  } catch (err) {
    logError('ai: hybrid fallback failed —', err);
    hideProgress();
    renderAll();
    setStatus('ai fallback failed — genre categories were kept.');
    toast('ai fallback failed');
  }
}

async function runAiTaxonomy(tracks) {
  setStatus(`ai defining categories (0/${tracks.length})...`);
  setProgress(1);

  try {
    const categorized = await categorizeWithAiTaxonomy(tracks, {
      onProgress: (done, total) => {
        setStatus(`ai defining categories (${done}/${total})...`);
        setProgress(Math.round((done / total) * 100));
      }
    });

    hideProgress();
    renderAll();
    setStatus(`ai taxonomy — ${categorized}/${tracks.length} selected tracks categorized.`);
    toast(`ai categorized ${categorized} tracks`);
  } catch (err) {
    logError('ai: taxonomy failed —', err);
    hideProgress();
    renderAll();
    setStatus('ai taxonomy failed — check the deepseek key and try again.');
    toast('ai taxonomy failed');
  }
}

export async function analyzeSelected() {
  const selected = getSelectedTracks();
  const mode = getCategorizeMode();
  log(`analyze: clicked — ${selected.length} selected of ${state.tracks.length} tracks, mode ${mode}`);

  if (!selected.length) {
    logWarn('analyze: no selected tracks');
    toast('select at least 1 track to analyze!');
    return;
  }

  const categoryIds = activeCategoryIds();
  if (mode === 'presets' && !categoryIds.length) {
    logWarn('analyze: no target categories checked');
    toast('select at least 1 category!');
    return;
  }

  if (mode === 'ai' && !getEphemeralDeepseekKey().trim()) {
    logWarn('analyze: ai taxonomy mode is on but the deepseek key is empty');
    toast('enter your deepseek api key first!');
    return;
  }

  const tagsReady = await ensureTags(selected);
  if (!tagsReady) {
    logDebug('analyze: aborted — tag read was superseded');
    return;
  }

  if (mode === 'genre') {
    await runGenreMode(selected);
    return;
  }

  if (mode === 'hybrid') {
    await runHybridMode(selected);
    return;
  }

  if (mode === 'ai') {
    await runAiTaxonomy(selected);
    return;
  }

  logDebug(`analyze: target categories [${categoryIds.join(', ')}]`);
  setStatus(`analyzing ${selected.length} selected tracks...`);
  setProgress(5);

  const categorized = applyRuleAnalysis(selected, categoryIds);

  setProgress(100);
  hideProgress();
  renderAll();
  log(`analyze: rules done — ${categorized} / ${selected.length} tracks categorized`);
  setStatus(`analyzed ${selected.length} selected tracks — ${categorized} categorized by rules.`);
  toast(`${categorized} tracks categorized`);
}
