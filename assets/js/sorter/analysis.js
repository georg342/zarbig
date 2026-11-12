// manual analysis trigger: loading a folder never categorizes anything. this
// module validates the selection + target categories and then dispatches to the
// ai engine (admin ai mode) or to the local keyword/bpm rules.

import { state } from './state.js';
import { getSelectedTracks } from './selection.js';
import { readTrackTags } from './scan.js';
import { autoCategoryFor } from './categories.js';
import { activeCategoryIds, getTargetCategories } from './multiSelect.js';
import { categorizeWithAi, getEphemeralDeepseekKey, isAiModeActive } from './ai.js';
import { toast, setStatus, setProgress, hideProgress } from './utils.js';
import { renderAll } from './render.js';
import { log, logDebug, logWarn, logError } from './debug.js';

function isAiToggleChecked() {
  const toggle = document.getElementById('chkAiMode');
  return Boolean(toggle && toggle.checked);
}

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

async function runAiAnalysis(tracks) {
  const categories = getTargetCategories();
  log(`ai: requesting categories for ${tracks.length} tracks against [${categories.map((cat) => cat.id).join(', ')}]`);

  setStatus(`analyzing with ai (0/${tracks.length})...`);
  setProgress(1);

  try {
    const categorized = await categorizeWithAi(tracks, categories, {
      onProgress: (done, total) => {
        logDebug(`ai: progress ${done}/${total}`);
        setStatus(`analyzing with ai (${done}/${total})...`);
        setProgress(Math.round((done / total) * 100));
      }
    });

    hideProgress();
    renderAll();
    log(`ai: done — ${categorized} / ${tracks.length} tracks categorized`);
    setStatus(`ai categorized ${categorized} / ${tracks.length} selected tracks.`);
    toast(`ai categorized ${categorized} tracks`);
  } catch (err) {
    logError('ai: analysis failed —', err);
    hideProgress();
    renderAll();
    setStatus('ai analysis failed — check the deepseek key and try again.');
    toast('ai analysis failed');
  }
}

export async function analyzeSelected() {
  const selected = getSelectedTracks();
  log(`analyze: clicked — ${selected.length} selected of ${state.tracks.length} tracks`);

  if (!selected.length) {
    logWarn('analyze: no selected tracks');
    toast('select at least 1 track to analyze!');
    return;
  }

  if (isAiToggleChecked() && !getEphemeralDeepseekKey().trim()) {
    logWarn('analyze: ai mode is on but the deepseek key is empty');
    toast('enter your deepseek api key first!');
    return;
  }

  const categoryIds = activeCategoryIds();
  if (!categoryIds.length) {
    logWarn('analyze: no target categories checked');
    toast('select at least 1 category!');
    return;
  }

  logDebug(`analyze: target categories [${categoryIds.join(', ')}] — ai mode ${isAiModeActive() ? 'on' : 'off'}`);

  const tagsReady = await ensureTags(selected);
  if (!tagsReady) {
    logDebug('analyze: aborted — tag read was superseded');
    return;
  }

  if (isAiModeActive()) {
    await runAiAnalysis(selected);
    return;
  }

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
