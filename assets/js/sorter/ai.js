// deepseek ai mode: the api key is ephemeral by design. it only ever lives in
// the module variable below — it is never written to localStorage/sessionStorage
// and any leftover copy of the legacy slot is purged on init. the input is
// cleared on DOMContentLoaded and on every pageshow (bfcache restores included).

import { state } from './state.js';
import {
  CATEGORIZE_MODES,
  DEEPSEEK_BATCH_SIZE,
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MAX_TAXONOMY_TRACKS,
  DEEPSEEK_MODEL,
  DEEPSEEK_TIMEOUT_MS,
  DEFAULT_CATEGORIZE_MODE,
  LEGACY_DEEPSEEK_KEY_STORAGE,
  MAX_CATEGORIES_PER_TRACK
} from './constants.js';
import { categoryDescription } from './categories.js';
import { normalizeMatchText } from './lookup.js';
import { slugify } from './utils.js';
import { log, logDebug, logWarn, logError } from './debug.js';

const AI_SYSTEM_PROMPT = [
  'you are an electronic music dj and curator.',
  'classify each track into the best matching category(ies) from the provided list,',
  'considering artist, title, bpm, camelot key and existing genre tags.',
  'use only the category ids from the provided list, never invent new ones.',
  'a track may fit more than one category, but only when it truly does.',
  'answer with strict json only, no prose and no markdown, matching this shape:',
  '{"results":[{"id":1,"categories":["category_id"]}]}',
  'return exactly one result per input track, reusing the numeric track id.'
].join(' ');

const TAXONOMY_SYSTEM_PROMPT = [
  'you are an electronic music dj and curator.',
  'define 4 to 8 categories that split the provided tracks by function in a dj set and by sound.',
  'do not create micro-genres: prefer broad, useful categories.',
  'keep all tracks from the same artist in the same main category unless their bpm or genre strongly differ.',
  'assign one to three categories per track, but only when the track truly fits them.',
  'use the provided lookupGenre, lookupBpm, lookupKey and lookupTags fields as evidence when present.',
  'use lowercase snake_case ids in english, short labels and one-sentence descriptions.',
  'answer with strict json only, no prose and no markdown, matching this shape:',
  '{"categories":[{"id":"category_id","label":"category label","description":"one sentence"}],',
  '"results":[{"id":1,"categories":["category_id"]}]}',
  'return exactly one result per input track, reusing the numeric track id.',
  'every track must get at least one category defined in categories.'
].join(' ');

const TAXONOMY_ONLY_PROMPT = [
  'you are an electronic music dj and curator.',
  'define 4 to 8 categories that split the provided tracks by function in a dj set and by sound.',
  'do not create micro-genres: prefer broad, useful categories.',
  'keep all tracks from the same artist in the same main category unless their bpm or genre strongly differ.',
  'use the provided lookupGenre, lookupBpm, lookupKey and lookupTags fields as evidence when present.',
  'use lowercase snake_case ids in english, short labels and one-sentence descriptions.',
  'answer with strict json only, no prose and no markdown, matching this shape:',
  '{"categories":[{"id":"category_id","label":"category label","description":"one sentence"}]}',
  'return only the categories array, no results array.'
].join(' ');

const ASSIGN_SYSTEM_PROMPT = [
  'you are an electronic music dj and curator.',
  'assign each track to one or more of the provided categories.',
  'reuse the provided category ids whenever they fit.',
  'create a new category only when none of the provided categories fit a track.',
  'keep all tracks from the same artist in the same main category unless their bpm or genre strongly differ.',
  'assign one to three categories per track, but only when the track truly fits them.',
  'use the provided lookupGenre, lookupBpm, lookupKey and lookupTags fields as evidence when present.',
  'use lowercase snake_case ids in english, short labels and one-sentence descriptions.',
  'answer with strict json only, no prose and no markdown, matching this shape:',
  '{"categories":[{"id":"category_id","label":"category label","description":"one sentence"}],',
  '"results":[{"id":1,"categories":["category_id"]}]}',
  'return exactly one result per input track, reusing the numeric track id.',
  'every track must get at least one category.'
].join(' ');

let ephemeralDeepseekKey = '';

export function getEphemeralDeepseekKey() {
  return ephemeralDeepseekKey;
}

export function getCategorizeMode() {
  return CATEGORIZE_MODES.includes(state.categorizeMode)
    ? state.categorizeMode
    : DEFAULT_CATEGORIZE_MODE;
}

export function setCategorizeMode(mode) {
  state.categorizeMode = CATEGORIZE_MODES.includes(mode)
    ? mode
    : DEFAULT_CATEGORIZE_MODE;
  const select = document.getElementById('categorizeMode');
  if (select && select.value !== state.categorizeMode) {
    select.value = state.categorizeMode;
  }
  return state.categorizeMode;
}

export function isAiModeSelected() {
  const mode = getCategorizeMode();
  return mode === 'ai' || mode === 'hybrid';
}

// hard purge of the old persisted key: this page must never read it back.
export function purgeEphemeralDeepseekKey() {
  try {
    localStorage.removeItem(LEGACY_DEEPSEEK_KEY_STORAGE);
  } catch (err) {
    // storage blocked: nothing to purge
  }
  try {
    sessionStorage.removeItem(LEGACY_DEEPSEEK_KEY_STORAGE);
  } catch (err) {
    // storage blocked: nothing to purge
  }
}

export function clearDeepseekKeyInput() {
  ephemeralDeepseekKey = '';
  const input = document.getElementById('deepseekKeyInput');
  if (input) input.value = '';
}

export function initAiMode() {
  purgeEphemeralDeepseekKey();
  ephemeralDeepseekKey = '';
  logDebug('ai: legacy deepseek key purged, key kept in memory only');

  const input = document.getElementById('deepseekKeyInput');
  if (input) {
    input.value = '';
    input.addEventListener('input', () => {
      ephemeralDeepseekKey = input.value.trim();
    });
  } else {
    logWarn('ai: #deepseekKeyInput not found — ai mode cannot receive a key');
  }

  const select = document.getElementById('categorizeMode');
  if (select) {
    setCategorizeMode(select.value);
  }

  // reload, back/forward cache and bfcache restores all wipe the key.
  window.addEventListener('pageshow', () => {
    purgeEphemeralDeepseekKey();
    clearDeepseekKeyInput();
    logDebug('ai: pageshow — key wiped');
  });
}

// admin logout and page init both drop the key and return to the safe default.
export function resetAiMode() {
  clearDeepseekKeyInput();
  setCategorizeMode(DEFAULT_CATEGORIZE_MODE);
}

function parseJsonObject(content) {
  const raw = String(content || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(raw);
  } catch (err) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (inner) {
        return {};
      }
    }
    return {};
  }
}

function trackPayload(track, index) {
  const lookup = track.lookup || {};
  return {
    id: index + 1,
    fileName: track.name,
    artist: track.meta.artist,
    title: track.meta.title,
    bpm: track.meta.bpm || lookup.bpm || '',
    keyCamelot: track.meta.key || lookup.key || '',
    id3Genre: track.meta.genre,
    lookupGenre: lookup.genre || '',
    lookupBpm: lookup.bpm || '',
    lookupKey: lookup.key || '',
    lookupTags: Array.isArray(lookup.tags) ? lookup.tags.slice(0, 6) : [],
    lookupSource: lookup.source || ''
  };
}

function categoriesPayload(categories) {
  return categories.map((cat) => ({
    id: cat.id,
    name: cat.label,
    description: categoryDescription(cat)
  }));
}

function buildPayload(batch, categories) {
  return {
    categories: categoriesPayload(categories),
    tracks: batch.map((track, index) => trackPayload(track, index))
  };
}

function assignPayload(batch, categories) {
  return {
    categories: categoriesPayload(categories),
    tracks: batch.map((track, index) => trackPayload(track, index))
  };
}

async function requestJson(systemPrompt, payload, key, label, temperature = 0.2) {
  const request = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    })
  };

  logDebug(`ai: ${label} request — model ${DEEPSEEK_MODEL}`);
  const doFetch = typeof window !== 'undefined' && typeof window.fetchWithTimeout === 'function'
    ? window.fetchWithTimeout
    : fetch;
  const response = await doFetch(DEEPSEEK_ENDPOINT, request, DEEPSEEK_TIMEOUT_MS);
  if (!response.ok) {
    logError(`ai: deepseek answered http ${response.status}`);
    throw new Error(`deepseek http ${response.status}`);
  }

  const data = await response.json();
  const message = data && Array.isArray(data.choices) && data.choices[0]
    ? data.choices[0].message
    : null;
  if (!message) logWarn('ai: response without choices[0].message');
  return parseJsonObject(message ? message.content : '');
}

async function requestBatch(batch, categories, key) {
  const parsed = await requestJson(
    AI_SYSTEM_PROMPT,
    buildPayload(batch, categories),
    key,
    `preset batch (${batch.length} tracks, ${categories.length} categories)`
  );
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  if (!results.length) logWarn('ai: response had no usable "results" array');
  return results;
}

// classifies the given tracks against the given categories, batch by batch.
// returns how many tracks actually received at least one valid category.
export async function categorizeWithAi(tracks, categories, options = {}) {
  const key = ephemeralDeepseekKey.trim();
  if (!key) {
    logError('ai: missing deepseek api key');
    throw new Error('missing deepseek api key');
  }

  const allowed = new Set(categories.map((cat) => cat.id));
  const batches = Math.ceil(tracks.length / DEEPSEEK_BATCH_SIZE);
  log(`ai: start — ${tracks.length} tracks in ${batches} batch(es) of ${DEEPSEEK_BATCH_SIZE}`);

  let done = 0;
  let categorized = 0;

  for (let start = 0; start < tracks.length; start += DEEPSEEK_BATCH_SIZE) {
    const batch = tracks.slice(start, start + DEEPSEEK_BATCH_SIZE);
    logDebug(`ai: batch ${Math.floor(start / DEEPSEEK_BATCH_SIZE) + 1}/${batches} (${batch.length} tracks)`);
    const results = await requestBatch(batch, categories, key);
    logDebug(`ai: batch returned ${results.length} result(s)`);

    results.forEach((result) => {
      if (!result || typeof result !== 'object') return;

      const position = Number(result.id);
      const track = Number.isInteger(position) ? batch[position - 1] : null;
      if (!track) {
        logDebug(`ai: ignored result with unknown track id ${result.id}`);
        return;
      }

      const rawIds = Array.isArray(result.categories)
        ? result.categories
        : [result.category];
      const ids = rawIds
        .map((value) => String(value == null ? '' : value).trim())
        .filter((id, index, list) => allowed.has(id) && list.indexOf(id) === index);
      if (!ids.length) {
        logDebug(`ai: no valid category for "${track.meta.artist} - ${track.meta.title}" —`, rawIds);
        return;
      }

      track.categories = ids;
      track.category = ids[0];
      track.autoCategory = ids[0];
      track.categorySource = 'ai';
      delete state.overrides[track.id];
      categorized += 1;
      logDebug(`ai: "${track.meta.artist} - ${track.meta.title}" → ${ids.join(', ')}`);
    });

    done += batch.length;
    if (typeof options.onProgress === 'function') options.onProgress(done, tracks.length);
  }

  return categorized;
}

function sanitizeAiCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = slugify(raw.id || raw.label || '');
  if (!id) return null;
  const label = String(raw.label || raw.id || id).trim().slice(0, 80) || id;
  return {
    id,
    label,
    description: String(raw.description || '').trim().slice(0, 240)
  };
}

function normalizeAiCategories(rawList) {
  const map = new Map();
  (Array.isArray(rawList) ? rawList : []).forEach((raw) => {
    const cat = sanitizeAiCategory(raw);
    if (cat && !map.has(cat.id)) map.set(cat.id, cat);
  });
  return map;
}

function collectResultIds(results) {
  const ids = new Set();
  (Array.isArray(results) ? results : []).forEach((result) => {
    const rawIds = result && Array.isArray(result.categories)
      ? result.categories
      : [result ? result.category : null];
    rawIds.forEach((value) => {
      const id = slugify(value);
      if (id) ids.add(id);
    });
  });
  return ids;
}

// batch requests reuse ids starting at 1; shift them back to the full track list
// before applying the results.
function offsetResults(results, offset) {
  return (Array.isArray(results) ? results : []).map((result) => {
    if (!result || typeof result !== 'object') return result;
    const id = Number(result.id);
    return Number.isInteger(id) ? { ...result, id: id + offset } : result;
  });
}

function mergeAiCategory(cat) {
  const existing = state.categories.find((item) => item.id === cat.id);
  if (existing) {
    if (!existing.description && cat.description) existing.description = cat.description;
    return;
  }

  state.categories.push({
    id: cat.id,
    label: cat.label,
    description: cat.description,
    minBpm: null,
    maxBpm: null,
    keywords: [cat.label.toLowerCase()],
    source: 'ai'
  });
  if (!state.targetCategories.includes(cat.id)) state.targetCategories.push(cat.id);
  logDebug(`ai: created category "${cat.id}"`);
}

function applyAiAssignments(tracks, results, allowed) {
  let categorized = 0;

  (Array.isArray(results) ? results : []).forEach((result) => {
    if (!result || typeof result !== 'object') return;

    const position = Number(result.id);
    const track = Number.isInteger(position) ? tracks[position - 1] : null;
    if (!track) {
      logDebug(`ai: ignored result with unknown track id ${result.id}`);
      return;
    }

    const rawIds = Array.isArray(result.categories)
      ? result.categories
      : [result.category];
    const ids = rawIds
      .map((value) => slugify(value))
      .filter((id, index, list) => id && allowed.has(id) && list.indexOf(id) === index)
      .slice(0, MAX_CATEGORIES_PER_TRACK);

    if (!ids.length) {
      logDebug(`ai: no valid category for "${track.meta.artist} - ${track.meta.title}" —`, rawIds);
      return;
    }

    track.categories = ids;
    track.category = ids[0];
    track.autoCategory = ids[0];
    track.categorySource = 'ai';
    delete state.overrides[track.id];
    categorized += 1;
    logDebug(`ai: "${track.meta.artist} - ${track.meta.title}" → ${ids.join(', ')}`);
  });

  return categorized;
}

function genreSignature(track) {
  return new Set(
    normalizeMatchText((track.lookup && track.lookup.genre) || track.meta.genre || '')
      .split(' ')
      .filter(Boolean)
  );
}

function artistGroupIsDivergent(group) {
  const bpms = group
    .map((track) => parseFloat((track.lookup && track.lookup.bpm) || track.meta.bpm))
    .filter(Number.isFinite);
  if (bpms.length > 1 && Math.max(...bpms) - Math.min(...bpms) >= 12) return true;

  const signatures = group.map(genreSignature).filter((signature) => signature.size);
  if (signatures.length > 1) {
    const common = new Set(signatures[0]);
    signatures.slice(1).forEach((signature) => {
      Array.from(common).forEach((token) => {
        if (!signature.has(token)) common.delete(token);
      });
    });
    if (!common.size) return true;
  }

  return false;
}

// the prompt asks the model to keep an artist together; this pass enforces it
// when the tracks are not strongly divergent.
function enforceArtistConsistency(tracks) {
  const groups = new Map();
  tracks.forEach((track) => {
    const key = normalizeMatchText(track.meta.artist) || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(track);
  });

  groups.forEach((group) => {
    if (group.length < 2) return;
    const counts = new Map();
    group.forEach((track) => {
      counts.set(track.category, (counts.get(track.category) || 0) + 1);
    });
    if (counts.size < 2) return;
    if (artistGroupIsDivergent(group)) {
      logDebug(`ai: artist "${group[0].meta.artist}" kept split — tracks are divergent`);
      return;
    }

    const majority = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];
    group.forEach((track) => {
      if (track.category === majority) return;
      track.categories = [majority, ...(track.categories || []).filter((id) => id !== majority)]
        .slice(0, MAX_CATEGORIES_PER_TRACK);
      track.category = majority;
      track.autoCategory = majority;
      logDebug(`ai: artist "${track.meta.artist}" forced to main category "${majority}"`);
    });
  });
}

export function isAiModeActive() {
  return state.isAdmin
    && isAiModeSelected()
    && ephemeralDeepseekKey.length > 0;
}

// taxonomy functions live below; function declarations are hoisted.

function compactTracks(tracks) {
  return tracks.map((track, index) => trackPayload(track, index));
}

function buildCategoryResult(rawCategories, results) {
  const categories = normalizeAiCategories(rawCategories);
  const usedIds = collectResultIds(results);
  usedIds.forEach((id) => {
    if (!categories.has(id)) {
      categories.set(id, {
        id,
        label: id.replace(/_/g, ' '),
        description: ''
      });
    }
  });
  return {
    categories: Array.from(categories.values()).filter((cat) => usedIds.has(cat.id)),
    usedIds
  };
}

function commitAiCategories(categories) {
  categories.forEach(mergeAiCategory);
  return new Set(categories.map((cat) => cat.id));
}

// ai defines the taxonomy itself. small selections use one request; larger
// selections define the categories first and then assign them in batches so the
// taxonomy stays consistent across requests.
export async function categorizeWithAiTaxonomy(tracks, options = {}) {
  const key = ephemeralDeepseekKey.trim();
  if (!key) {
    logError('ai: missing deepseek api key');
    throw new Error('missing deepseek api key');
  }
  if (!tracks.length) return 0;

  log(`ai: taxonomy start — ${tracks.length} track(s)`);
  let rawCategories = [];
  let results = [];

  if (tracks.length <= DEEPSEEK_MAX_TAXONOMY_TRACKS) {
    const parsed = await requestJson(
      TAXONOMY_SYSTEM_PROMPT,
      { tracks: compactTracks(tracks) },
      key,
      `taxonomy (${tracks.length} tracks)`,
      0.3
    );
    rawCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
    results = Array.isArray(parsed.results) ? parsed.results : [];
    if (typeof options.onProgress === 'function') options.onProgress(tracks.length, tracks.length);
  } else {
    const parsedTaxonomy = await requestJson(
      TAXONOMY_ONLY_PROMPT,
      { tracks: compactTracks(tracks) },
      key,
      `taxonomy only (${tracks.length} tracks)`,
      0.3
    );
    rawCategories = Array.isArray(parsedTaxonomy.categories) ? parsedTaxonomy.categories : [];
    const payloadCategories = Array.from(normalizeAiCategories(rawCategories).values());
    if (!payloadCategories.length) throw new Error('ai returned no taxonomy');

    let done = 0;
    for (let start = 0; start < tracks.length; start += DEEPSEEK_BATCH_SIZE) {
      const batch = tracks.slice(start, start + DEEPSEEK_BATCH_SIZE);
      const parsed = await requestJson(
        ASSIGN_SYSTEM_PROMPT,
        assignPayload(batch, payloadCategories),
        key,
        `assign batch ${Math.floor(start / DEEPSEEK_BATCH_SIZE) + 1} (${batch.length} tracks)`
      );
      rawCategories = rawCategories.concat(Array.isArray(parsed.categories) ? parsed.categories : []);
      results = results.concat(offsetResults(parsed.results, start));
      done += batch.length;
      if (typeof options.onProgress === 'function') options.onProgress(done, tracks.length);
    }
  }

  const { categories } = buildCategoryResult(rawCategories, results);
  if (!categories.length) {
    logWarn('ai: taxonomy returned no usable categories');
    return 0;
  }

  const allowed = commitAiCategories(categories);
  const categorized = applyAiAssignments(tracks, results, allowed);
  enforceArtistConsistency(tracks);
  log(`ai: taxonomy done — ${categorized}/${tracks.length} track(s), ${categories.length} categories`);
  return categorized;
}

// hybrid mode: only the tracks that the local genre pass could not resolve are
// sent to deepseek. existing genre categories are offered as a starting point.
export async function assignUnresolvedWithAi(tracks, categories, options = {}) {
  const key = ephemeralDeepseekKey.trim();
  if (!key) {
    logError('ai: missing deepseek api key');
    throw new Error('missing deepseek api key');
  }
  if (!tracks.length) return 0;

  log(`ai: fallback start — ${tracks.length} unresolved track(s), ${categories.length} existing categories`);
  const payloadCategories = Array.isArray(categories) ? categories : [];
  let rawCategories = payloadCategories.slice();
  let results = [];
  let done = 0;

  for (let start = 0; start < tracks.length; start += DEEPSEEK_BATCH_SIZE) {
    const batch = tracks.slice(start, start + DEEPSEEK_BATCH_SIZE);
    const parsed = await requestJson(
      ASSIGN_SYSTEM_PROMPT,
      assignPayload(batch, payloadCategories),
      key,
      `fallback batch ${Math.floor(start / DEEPSEEK_BATCH_SIZE) + 1} (${batch.length} tracks)`
    );
    rawCategories = rawCategories.concat(Array.isArray(parsed.categories) ? parsed.categories : []);
    results = results.concat(offsetResults(parsed.results, start));
    done += batch.length;
    if (typeof options.onProgress === 'function') options.onProgress(done, tracks.length);
  }

  const { categories: usedCategories } = buildCategoryResult(rawCategories, results);
  if (!usedCategories.length) {
    logWarn('ai: fallback returned no usable categories');
    return 0;
  }

  const allowed = commitAiCategories(usedCategories);
  const categorized = applyAiAssignments(tracks, results, allowed);
  enforceArtistConsistency(tracks);
  log(`ai: fallback done — ${categorized}/${tracks.length} unresolved track(s) categorized`);
  return categorized;
}
