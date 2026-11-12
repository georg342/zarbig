// config persistence (mask + category presets) in localStorage, plus the
// sanitizer that turns the admin editor values into a clean category list.

import { SORTER_STORAGE_KEY } from './constants.js';
import { state } from './state.js';
import { slugify } from './utils.js';

export function loadConfig() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(SORTER_STORAGE_KEY) || 'null');
  } catch (err) {
    stored = null;
  }
  if (!stored || typeof stored !== 'object') return;

  if (typeof stored.mask === 'string' && stored.mask.trim()) {
    state.mask = stored.mask.trim();
  }

  if (Array.isArray(stored.categories) && stored.categories.length) {
    const clean = stored.categories
      .filter((cat) => cat && typeof cat.id === 'string' && cat.id.trim())
      .map((cat) => ({
        id: slugify(cat.id),
        label: String(cat.label || cat.id).trim() || slugify(cat.id),
        minBpm: cat.minBpm === null || cat.minBpm === '' ? null : Number(cat.minBpm),
        maxBpm: cat.maxBpm === null || cat.maxBpm === '' ? null : Number(cat.maxBpm),
        keywords: Array.isArray(cat.keywords)
          ? cat.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
          : []
      }))
      .filter((cat) => cat.id);
    if (clean.length) state.categories = clean;
  }
}

export function saveConfig() {
  const payload = {
    mask: state.mask,
    categories: state.categories
  };
  try {
    localStorage.setItem(SORTER_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
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
    if (!id || seen.has(id)) return;
    seen.add(id);

    clean.push({
      id,
      label: String(cat.label || id).trim() || id,
      minBpm: toBpm(cat.minBpm),
      maxBpm: toBpm(cat.maxBpm),
      keywords: (cat.keywords || [])
        .map((keyword) => String(keyword).trim().toLowerCase())
        .filter(Boolean)
    });
  });

  return clean;
}
