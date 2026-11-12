// dj categories: keyword + bpm scoring, the shared description used by the
// multi-select and the ai prompt, and the recategorize pass.

import { state } from './state.js';

export function categoryLabel(id) {
  if (!id || id === 'unsorted') return 'unsorted';
  const cat = state.categories.find((item) => item.id === id);
  return cat ? cat.label : id;
}

// the admin editor keeps an optional description; when it is empty we build a
// short one from the rule so the multi-select preview and the ai prompt always
// have something meaningful to show.
export function categoryDescription(cat) {
  if (!cat) return '';
  const description = String(cat.description || '').trim();
  if (description) return description;

  const hasRange = cat.minBpm !== null && cat.maxBpm !== null;
  const bpm = hasRange ? `bpm ${cat.minBpm}-${cat.maxBpm}` : '';
  const keywords = (cat.keywords || []).join(', ');
  const parts = [bpm, keywords ? `keywords: ${keywords}` : ''].filter(Boolean);
  return parts.join(' · ') || cat.label;
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

// allowedIds: optional Set/array with the category ids checked in the
// multi-select dropdown. only those categories are scored.
export function autoCategoryFor(track, allowedIds) {
  const allowed = allowedIds instanceof Set
    ? allowedIds
    : (Array.isArray(allowedIds) && allowedIds.length ? new Set(allowedIds) : null);

  let bestId = 'unsorted';
  let bestScore = 0;

  state.categories.forEach((cat) => {
    if (allowed && !allowed.has(cat.id)) return;
    const score = scoreCategory(track, cat);
    if (score > bestScore) {
      bestScore = score;
      bestId = cat.id;
    }
  });

  return bestId;
}

// drops overrides + ai pins that point to categories which no longer exist and
// recategorizes the rest. called after any category edit/reset.
export function pruneCategoryRefs() {
  const ids = new Set(state.categories.map((cat) => cat.id));

  Object.keys(state.overrides).forEach((trackId) => {
    if (!ids.has(state.overrides[trackId])) delete state.overrides[trackId];
  });

  state.tracks.forEach((track) => {
    if (track.categorySource !== 'ai') return;

    const kept = (track.categories || []).filter((id) => ids.has(id));
    if (!kept.length) {
      track.categories = [];
      track.category = 'unsorted';
      track.autoCategory = 'unsorted';
      track.categorySource = 'none';
      return;
    }

    track.categories = kept;
    track.category = kept[0];
    track.autoCategory = kept[0];
  });

  recategorizeAll();
}

// reassigns every track that is not pinned by the ai or by a manual override.
export function recategorizeAll(allowedIds) {
  state.tracks.forEach((track) => {
    if (track.categorySource === 'ai') return;

    track.autoCategory = autoCategoryFor(track, allowedIds);
    const override = state.overrides[track.id];
    const final = override || track.autoCategory;

    track.category = final;
    track.categories = final === 'unsorted' ? [] : [final];
    track.categorySource = override
      ? 'manual'
      : (track.autoCategory === 'unsorted' ? 'none' : 'rule');
  });
}
