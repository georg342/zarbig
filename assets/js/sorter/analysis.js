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

function isAiToggleChecked() {
  const toggle = document.getElementById('chkAiMode');
  return Boolean(toggle && toggle.checked);
}

async function ensureTags(tracks) {
  if (!tracks.some((track) => !track.tagsRead)) return true;
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
  });

  return categorized;
}

async function runAiAnalysis(tracks) {
  const categories = getTargetCategories();

  setStatus(`analyzing with ai (0/${tracks.length})...`);
  setProgress(1);

  try {
    const categorized = await categorizeWithAi(tracks, categories, {
      onProgress: (done, total) => {
        setStatus(`analyzing with ai (${done}/${total})...`);
        setProgress(Math.round((done / total) * 100));
      }
    });

    hideProgress();
    renderAll();
    setStatus(`ai categorized ${categorized} / ${tracks.length} selected tracks.`);
    toast(`ai categorized ${categorized} tracks`);
  } catch (err) {
    console.warn('ai analysis failed:', err && err.message ? err.message : err);
    hideProgress();
    renderAll();
    setStatus('ai analysis failed — check the deepseek key and try again.');
    toast('ai analysis failed');
  }
}

export async function analyzeSelected() {
  const selected = getSelectedTracks();

  if (!selected.length) {
    toast('select at least 1 track to analyze!');
    return;
  }

  if (isAiToggleChecked() && !getEphemeralDeepseekKey().trim()) {
    toast('enter your deepseek api key first!');
    return;
  }

  const categoryIds = activeCategoryIds();
  if (!categoryIds.length) {
    toast('select at least 1 category!');
    return;
  }

  const tagsReady = await ensureTags(selected);
  if (!tagsReady) return;

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
  setStatus(`analyzed ${selected.length} selected tracks — ${categorized} categorized by rules.`);
  toast(`${categorized} tracks categorized`);
}
