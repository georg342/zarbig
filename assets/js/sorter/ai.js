// deepseek ai mode: the api key is ephemeral by design. it only ever lives in
// the module variable below — it is never written to localStorage/sessionStorage
// and any leftover copy of the legacy slot is purged on init. the input is
// cleared on DOMContentLoaded and on every pageshow (bfcache restores included).

import { state } from './state.js';
import {
  DEEPSEEK_BATCH_SIZE,
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODEL,
  LEGACY_DEEPSEEK_KEY_STORAGE
} from './constants.js';
import { categoryDescription } from './categories.js';

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

let ephemeralDeepseekKey = '';

export function getEphemeralDeepseekKey() {
  return ephemeralDeepseekKey;
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

  const input = document.getElementById('deepseekKeyInput');
  if (input) {
    input.value = '';
    input.addEventListener('input', () => {
      ephemeralDeepseekKey = input.value.trim();
    });
  }

  // reload, back/forward cache and bfcache restores all wipe the key.
  window.addEventListener('pageshow', () => {
    purgeEphemeralDeepseekKey();
    clearDeepseekKeyInput();
  });
}

// admin logout and page init both drop the key and uncheck the toggle.
export function resetAiMode() {
  clearDeepseekKeyInput();
  const toggle = document.getElementById('chkAiMode');
  if (toggle) toggle.checked = false;
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

function buildPayload(batch, categories) {
  return {
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.label,
      description: categoryDescription(cat)
    })),
    tracks: batch.map((track, index) => ({
      id: index + 1,
      fileName: track.name,
      artist: track.meta.artist,
      title: track.meta.title,
      bpm: track.meta.bpm,
      keyCamelot: track.meta.key,
      id3Genre: track.meta.genre
    }))
  };
}

async function requestBatch(batch, categories, key) {
  const request = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(buildPayload(batch, categories)) }
      ]
    })
  };

  const doFetch = typeof window.fetchWithTimeout === 'function' ? window.fetchWithTimeout : fetch;
  const response = await doFetch(DEEPSEEK_ENDPOINT, request, 60000);
  if (!response.ok) throw new Error(`deepseek http ${response.status}`);

  const data = await response.json();
  const message = data && Array.isArray(data.choices) && data.choices[0]
    ? data.choices[0].message
    : null;
  const parsed = parseJsonObject(message ? message.content : '');
  return Array.isArray(parsed.results) ? parsed.results : [];
}

// classifies the given tracks against the given categories, batch by batch.
// returns how many tracks actually received at least one valid category.
export async function categorizeWithAi(tracks, categories, options = {}) {
  const key = ephemeralDeepseekKey.trim();
  if (!key) throw new Error('missing deepseek api key');

  const allowed = new Set(categories.map((cat) => cat.id));
  let done = 0;
  let categorized = 0;

  for (let start = 0; start < tracks.length; start += DEEPSEEK_BATCH_SIZE) {
    const batch = tracks.slice(start, start + DEEPSEEK_BATCH_SIZE);
    const results = await requestBatch(batch, categories, key);

    results.forEach((result) => {
      if (!result || typeof result !== 'object') return;

      const position = Number(result.id);
      const track = Number.isInteger(position) ? batch[position - 1] : null;
      if (!track) return;

      const rawIds = Array.isArray(result.categories)
        ? result.categories
        : [result.category];
      const ids = rawIds
        .map((value) => String(value == null ? '' : value).trim())
        .filter((id, index, list) => allowed.has(id) && list.indexOf(id) === index);
      if (!ids.length) return;

      track.categories = ids;
      track.category = ids[0];
      track.autoCategory = ids[0];
      track.categorySource = 'ai';
      delete state.overrides[track.id];
      categorized += 1;
    });

    done += batch.length;
    if (typeof options.onProgress === 'function') options.onProgress(done, tracks.length);
  }

  return categorized;
}

export function isAiModeActive() {
  const toggle = document.getElementById('chkAiMode');
  return state.isAdmin
    && Boolean(toggle && toggle.checked)
    && ephemeralDeepseekKey.length > 0;
}
