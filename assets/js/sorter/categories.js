// dj categories: keyword + bpm scoring and the recategorize pass that respects
// the manual overrides.

import { state } from './state.js';

export function categoryLabel(id) {
  if (!id || id === 'unsorted') return 'unsorted';
  const cat = state.categories.find((item) => item.id === id);
  return cat ? cat.label : id;
}

export function scoreCategory(track, cat) {
  const haystack = `${track.meta.genre} ${track.meta.title} ${track.meta.artist}`.toLowerCase();
  let score = 0;

  (cat.keywords || []).forEach((keyword) => {
    if (keyword && haystack.includes(keyword.toLowerCase())) score += 2;
  });

  const bpm = parseFloat(track.meta.bpm);
  const hasRange = Number.isFinite(bpm) && cat.minBpm !== null && cat.maxBpm !== null;
  if (hasRange && bpm >= cat.minBpm && bpm <= cat.maxBpm) score += 1;

  return score;
}

export function autoCategoryFor(track) {
  let bestId = 'unsorted';
  let bestScore = 0;

  state.categories.forEach((cat) => {
    const score = scoreCategory(track, cat);
    if (score > bestScore) {
      bestScore = score;
      bestId = cat.id;
    }
  });

  return bestId;
}

export function recategorizeAll() {
  state.tracks.forEach((track) => {
    track.autoCategory = autoCategoryFor(track);
    track.category = state.overrides[track.id] || track.autoCategory;
  });
}
