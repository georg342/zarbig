// dj categories: keyword + bpm scoring, the shared description used by the
// multi-select and the ai prompt, and the recategorize pass.

import { state } from './state.js';
import { MAX_CATEGORIES_PER_TRACK } from './constants.js';
import { isGenreLike } from './lookup.js';
import { slugify } from './utils.js';
import { logDebug } from './debug.js';

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

  const hasRange = cat.minBpm != null && cat.maxBpm != null
    && Number.isFinite(Number(cat.minBpm)) && Number.isFinite(Number(cat.maxBpm));
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
  const hasRange = Number.isFinite(bpm) && cat.minBpm != null && cat.maxBpm != null
    && Number.isFinite(Number(cat.minBpm)) && Number.isFinite(Number(cat.maxBpm));
  if (hasRange && bpm >= Number(cat.minBpm) && bpm <= Number(cat.maxBpm)) score += 1;

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

// creates a category for a genre/tag when it does not exist yet. the id is the
// slug of the label, so repeated genres reuse the same category across runs.
export function ensureCategory(label, options = {}) {
  const cleanLabel = String(label || '').trim();
  const id = slugify(cleanLabel);
  if (!id) return '';

  let cat = state.categories.find((item) => item.id === id);
  if (!cat) {
    cat = {
      id,
      label: cleanLabel,
      description: String(options.description || '').trim(),
      minBpm: null,
      maxBpm: null,
      keywords: [cleanLabel.toLowerCase()],
      source: options.source === 'ai' ? 'ai' : 'genre'
    };
    state.categories.push(cat);
    if (!state.targetCategories.includes(id)) state.targetCategories.push(id);
    logDebug(`categories: created \"${id}\" from ${cat.source}`);
  } else {
    if (!cat.description && options.description) cat.description = String(options.description).trim();
    if (!cat.source && options.source) cat.source = options.source;
  }

  return id;
}

function trackGenreLabels(track) {
  const labels = [];
  const lookup = track.lookup || {};
  const primary = String(lookup.genre || track.meta.genre || '').trim();
  if (primary && (lookup.genre || isGenreLike(primary))) labels.push(primary);

  const extras = [
    ...(lookup.tags || []),
    track.meta.genre
  ];

  extras.forEach((value) => {
    const label = String(value || '').trim();
    if (label && isGenreLike(label)) labels.push(label);
  });

  const seen = new Set();
  return labels.filter((label) => {
    const id = slugify(label);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_CATEGORIES_PER_TRACK);
}

// genre mode: no deepseek. one category per genre/tag, up to
// MAX_CATEGORIES_PER_TRACK when the tags justify it.
export function applyGenreAnalysis(tracks) {
  let categorized = 0;

  tracks.forEach((track) => {
    const labels = trackGenreLabels(track);
    const ids = labels
      .map((label) => ensureCategory(label, {
        description: track.lookup && track.lookup.genre === label
          ? `beatport genre: ${label}`
          : `tag genre: ${label}`,
        source: 'genre'
      }))
      .filter(Boolean);
    const override = state.overrides[track.id];
    const finalIds = override ? [override] : ids;

    track.autoCategory = ids[0] || 'unsorted';
    track.category = finalIds[0] || 'unsorted';
    track.categories = finalIds;
    track.categorySource = override ? 'manual' : (ids.length ? 'genre' : 'none');
    if (ids.length) categorized += 1;

    logDebug(`genre: ${track.meta.artist} - ${track.meta.title} [${labels.join(', ') || 'no genre'}] → ${track.categories.join(', ') || 'unsorted'} (${track.categorySource}, ${track.lookup ? track.lookup.source : 'tag'})`);
  });

  return categorized;
}

export function tracksWithoutGenre(tracks) {
  return tracks.filter((track) => {
    if (state.overrides[track.id]) return false;
    return !track.autoCategory || track.autoCategory === 'unsorted';
  });
}

// drops overrides + ai/genre pins that point to categories which no longer exist
// and recategorizes the rest. called after any category edit/reset.
export function pruneCategoryRefs() {
  const ids = new Set(state.categories.map((cat) => cat.id));
  let droppedOverrides = 0;
  let resetAiTracks = 0;

  Object.keys(state.overrides).forEach((trackId) => {
    if (!ids.has(state.overrides[trackId])) {
      delete state.overrides[trackId];
      droppedOverrides += 1;
    }
  });

  state.tracks.forEach((track) => {
    if (track.categorySource !== 'ai' && track.categorySource !== 'genre') return;

    const kept = (track.categories || []).filter((id) => ids.has(id));
    if (!kept.length) {
      track.categories = [];
      track.category = 'unsorted';
      track.autoCategory = 'unsorted';
      track.categorySource = 'none';
      resetAiTracks += 1;
      return;
    }

    track.categories = kept;
    track.category = kept[0];
    track.autoCategory = kept[0];
  });

  logDebug(`categories: pruned refs — ${droppedOverrides} override(s) dropped, ${resetAiTracks} ai/genre track(s) back to unsorted`);
  recategorizeAll();
}

// reassigns every track that is not pinned by the ai, by the genre pass or by a
// manual override.
export function recategorizeAll(allowedIds) {
  let recategorized = 0;

  state.tracks.forEach((track) => {
    if (track.categorySource === 'ai' || track.categorySource === 'genre') return;

    track.autoCategory = autoCategoryFor(track, allowedIds);
    const override = state.overrides[track.id];
    const final = override || track.autoCategory;

    track.category = final;
    track.categories = final === 'unsorted' ? [] : [final];
    track.categorySource = override
      ? 'manual'
      : (track.autoCategory === 'unsorted' ? 'none' : 'rule');
    recategorized += 1;
  });

  logDebug(`categories: recategorized ${recategorized} track(s)`);
}
