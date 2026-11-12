// config persistence (mask + category presets) in localStorage, plus the
// sanitizer that turns the admin editor values into a clean category list.

import { SORTER_STORAGE_KEY } from './constants.js';
import { state } from './state.js';
import { slugify } from './utils.js';
import { log, logDebug, logWarn } from './debug.js';

export function loadConfig() {
  let stored = null;
  let raw = null;

  try {
    raw = localStorage.getItem(SORTER_STORAGE_KEY);
    stored = JSON.parse(raw || 'null');
  } catch (err) {
    logWarn('config: stored json is invalid, falling back to defaults —', err);
    stored = null;
  }
  if (!stored || typeof stored !== 'object') {
    logDebug(`config: nothing stored under "${SORTER_STORAGE_KEY}" — defaults in use`);
    return;
  }

  if (typeof stored.mask === 'string' && stored.mask.trim()) {
    state.mask = stored.mask.trim();
  }

  if (Array.isArray(stored.categories) && stored.categories.length) {
    const clean = stored.categories
      .filter((cat) => cat && typeof cat.id === 'string' && cat.id.trim())
      .map((cat) => ({
        id: slugify(cat.id),
        label: String(cat.label || cat.id).trim() || slugify(cat.id),
        description: String(cat.description || '').trim(),
        minBpm: cat.minBpm === null || cat.minBpm === '' ? null : Number(cat.minBpm),
        maxBpm: cat.maxBpm === null || cat.maxBpm === '' ? null : Number(cat.maxBpm),
        keywords: Array.isArray(cat.keywords)
          ? cat.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
          : []
      }))
      .filter((cat) => cat.id);
    if (clean.length) state.categories = clean;
    logDebug(`config: ${stored.categories.length} stored categories → ${state.categories.length} after sanitize`);
  }
}

export function saveConfig() {
  const payload = {
    mask: state.mask,
    categories: state.categories
  };
  try {
    localStorage.setItem(SORTER_STORAGE_KEY, JSON.stringify(payload));
    log(`config: saved — mask "${payload.mask}", ${payload.categories.length} categories`);
    return true;
  } catch (err) {
    logWarn('config: save failed (storage blocked) —', err);
    return false;
  }
}

export function normalizeCategoryList(list) {
  const seen = new Set();
  const clean = [];

  const toBpm = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  list.forEach((cat) => {
    const id = slugify(cat.id || cat.label || '');
    if (!id || seen.has(id)) {
      logDebug(`config: dropped category "${cat.id || cat.label || ''}" (empty or duplicated id)`);
      return;
    }
    seen.add(id);

    clean.push({
      id,
      label: String(cat.label || id).trim() || id,
      description: String(cat.description || '').trim(),
      minBpm: toBpm(cat.minBpm),
      maxBpm: toBpm(cat.maxBpm),
      keywords: (cat.keywords || [])
        .map((keyword) => String(keyword).trim().toLowerCase())
        .filter(Boolean)
    });
  });

  return clean;
}
