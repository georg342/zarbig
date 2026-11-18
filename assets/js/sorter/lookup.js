// public metadata lookup through r.jina.ai: beatport first (genre, bpm, key,
// label) then bandcamp (tags). no api token is used. the proxy is rate limited,
// so requests are serialized with a delay and results are cached in memory.

import { state } from './state.js';
import {
  GENRE_HINTS,
  JINA_BASE,
  LOOKUP_DELAY_MS,
  LOOKUP_RETRIES,
  LOOKUP_TIMEOUT_MS,
  NON_GENRE_TAGS
} from './constants.js';
import { normalizeBpm, normalizeKey } from './metadata.js';
import { log, logDebug, logWarn } from './debug.js';

const lookupCache = new Map();
const artistSearchCache = new Map();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(original|extended|radio|club|instrumental|vocal|remix|remixed|remaster(?:ed)?|edit|mix|feat\.?|ft\.?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value) {
  return normalizeMatchText(value).split(' ').filter((token) => token.length > 1);
}

function overlapScore(localValue, candidateValue) {
  const local = tokens(localValue);
  const candidate = new Set(tokens(candidateValue));
  if (!local.length || !candidate.size) return 0;
  const hits = local.filter((token) => candidate.has(token)).length;
  return hits / local.length;
}

function matchScore(track, candidate) {
  const titleScore = overlapScore(track.meta.title, candidate.title);
  const artists = Array.isArray(candidate.artists) ? candidate.artists.join(' ') : (candidate.artists || '');
  const artistScore = overlapScore(track.meta.artist, artists);
  const artistKnown = normalizeMatchText(track.meta.artist) !== 'unknown artist';
  if (titleScore < 0.5) return 0;
  if (artistKnown && artistScore <= 0) return 0;
  return titleScore * 0.7 + artistScore * 0.3;
}

function pickBestMatch(track, candidates) {
  let best = null;
  let bestScore = 0;
  candidates.forEach((candidate) => {
    const score = matchScore(track, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });
  return bestScore >= 0.55 ? best : null;
}

export function isGenreLike(value) {
  const text = normalizeMatchText(value);
  if (!text || NON_GENRE_TAGS.includes(text)) return false;
  return GENRE_HINTS.some((hint) => text.includes(hint));
}

export function pickGenreTag(tags) {
  return (tags || []).find((tag) => isGenreLike(tag)) || '';
}

function uniqueNames(values) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index);
}

function parseBeatportBlock(block) {
  const trackLink = block.match(/\[([^\]]+)\]\((https:\/\/www\.beatport\.com\/track\/[^)\s]+)/);
  if (!trackLink) return null;

  const artistMatches = Array.from(block.matchAll(/\[([^\]]+)\]\(https:\/\/www\.beatport\.com\/artist\/[^)]+\)/g));
  const labelMatch = block.match(/\[([^\]]+)\]\(https:\/\/www\.beatport\.com\/label\/[^)]+\)/);
  const genreMatch = block.match(/\[([^\]]+)\]\(https:\/\/www\.beatport\.com\/genre\/[^)]+\)/);

  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const genreLine = lines.findIndex((line) => line.includes('beatport.com/genre/'));
  let releaseDate = '';
  let bpm = '';
  let key = '';

  for (let i = genreLine + 1; i >= 0 && i < lines.length && i <= genreLine + 14; i += 1) {
    const line = lines[i];
    if (!releaseDate && /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(line)) {
      releaseDate = line;
      continue;
    }
    if (!bpm && /^\d{2,3}$/.test(line)) {
      bpm = line;
      continue;
    }
    if (!key && /^[A-G][#b]?\s+(min|maj)$/i.test(line)) {
      key = line;
    }
  }

  return {
    title: trackLink[1].trim(),
    url: trackLink[2],
    artists: uniqueNames(artistMatches.map((match) => match[1].trim())),
    label: labelMatch ? labelMatch[1].trim() : '',
    genre: genreMatch ? genreMatch[1].trim() : '',
    bpm,
    key,
    releaseDate
  };
}

// beatport search markdown puts one result per "![Image N: title]" block.
export function parseBeatportSearch(markdown) {
  return String(markdown || '')
    .split(/\n(?=!\[Image \d+: )/)
    .filter((block) => block.includes('beatport.com/track/'))
    .map(parseBeatportBlock)
    .filter(Boolean);
}

// bandcamp search results are one line per item and expose uploader tags.
export function parseBandcampSearch(markdown) {
  const text = String(markdown || '');
  const results = [];
  const regex = /\*   \[!\[Image \d+\]\([^)]*\)\]\([^)]+\)\s+(TRACK|ALBUM|ARTIST)\s+\[([^\]]+)\]\(([^)]+)\)([^\n]*)/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const type = match[1].toUpperCase();
    if (type === 'ARTIST') continue;

    const rest = match[4] || '';
    const artistMatch = rest.match(/\bby\s+(.+?)(?:\s{2,}|\s+(?:released|from|tags:|$))/i);
    const tagsMatch = rest.match(/tags:\s*(.+)$/i);
    const tags = tagsMatch
      ? tagsMatch[1]
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 1)
        .slice(0, 8)
      : [];

    results.push({
      type,
      title: match[2].trim(),
      url: match[3],
      artists: artistMatch ? [artistMatch[1].trim()] : [],
      tags,
      genre: pickGenreTag(tags)
    });
  }

  return results;
}

function cacheKey(track) {
  return `${normalizeMatchText(track.meta.artist)}|${normalizeMatchText(track.meta.title)}`;
}

function beatportUrl(query) {
  return `https://www.beatport.com/search?q=${encodeURIComponent(query)}`;
}

function bandcampUrl(query) {
  return `https://bandcamp.com/search?q=${encodeURIComponent(query)}`;
}

async function fetchJina(target, stats) {
  const wait = Math.max(0, LOOKUP_DELAY_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const doFetch = typeof window !== 'undefined' && typeof window.fetchWithTimeout === 'function'
    ? window.fetchWithTimeout
    : fetch;
  let lastError = null;

  for (let attempt = 0; attempt <= LOOKUP_RETRIES; attempt += 1) {
    try {
      stats.requests += 1;
      const response = await doFetch(`${JINA_BASE}${target}`, {
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'text/plain' }
      }, LOOKUP_TIMEOUT_MS);
      if (response.ok) return await response.text();
      lastError = new Error(`jina http ${response.status}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (err) {
      lastError = err;
    }
    if (attempt < LOOKUP_RETRIES) await sleep(15000);
  }

  throw lastError || new Error('jina request failed');
}

async function artistCandidates(track, stats) {
  const key = normalizeMatchText(track.meta.artist);
  if (artistSearchCache.has(key)) return artistSearchCache.get(key);
  const text = await fetchJina(beatportUrl(track.meta.artist), stats);
  const candidates = parseBeatportSearch(text);
  artistSearchCache.set(key, candidates);
  return candidates;
}

async function trackCandidates(track, stats) {
  const query = `${track.meta.artist} ${track.meta.title}`.trim();
  const text = await fetchJina(beatportUrl(query), stats);
  return parseBeatportSearch(text);
}

function toLookupResult(candidate, source, query) {
  return {
    source,
    genre: candidate.genre || '',
    bpm: candidate.bpm || '',
    key: candidate.key || '',
    label: candidate.label || '',
    url: candidate.url || '',
    tags: candidate.tags || [],
    confidence: source === 'beatport' ? 0.9 : 0.6,
    query
  };
}

function applyLookupResult(track, result) {
  if (!result) {
    track.lookupStatus = 'unresolved';
    return;
  }

  track.lookup = result;
  if (result.genre && (!track.meta.genre || !isGenreLike(track.meta.genre))) {
    track.meta.genre = result.genre;
  }
  if (result.bpm && !track.meta.bpm) track.meta.bpm = normalizeBpm(result.bpm);
  if (result.key && !track.meta.key) track.meta.key = normalizeKey(result.key);
  track.lookupStatus = result.genre ? result.source : 'unresolved';
}

// looks up the selected tracks one by one. beatport artist pages are cached and
// reused when the folder has more than one track from the same artist.
export async function lookupTracks(tracks, options = {}) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  const stats = {
    total: list.length,
    resolved: 0,
    unresolved: 0,
    requests: 0,
    cacheHits: 0,
    cancelled: false
  };
  if (!list.length) return stats;

  const runId = state.scanId;
  const artistCounts = new Map();
  list.forEach((track) => {
    if (track.lookup && track.lookup.genre) return;
    if (lookupCache.has(cacheKey(track))) return;
    const key = normalizeMatchText(track.meta.artist);
    artistCounts.set(key, (artistCounts.get(key) || 0) + 1);
  });

  let done = 0;
  const mark = (track, result) => {
    applyLookupResult(track, result);
    if (track.lookup && track.lookup.genre) {
      stats.resolved += 1;
      lookupCache.set(cacheKey(track), track.lookup);
    } else {
      stats.unresolved += 1;
    }
    done += 1;
    if (typeof options.onProgress === 'function') {
      options.onProgress(done, list.length, track);
    }
  };

  log(`lookup: starting ${list.length} track(s) through r.jina.ai`);

  for (const track of list) {
    if (runId !== state.scanId) {
      stats.cancelled = true;
      logDebug('lookup: cancelled by workspace change');
      return stats;
    }

    if (track.lookup && track.lookup.genre) {
      mark(track, track.lookup);
      continue;
    }

    const cached = lookupCache.get(cacheKey(track));
    if (cached) {
      stats.cacheHits += 1;
      mark(track, cached);
      continue;
    }

    const artistKey = normalizeMatchText(track.meta.artist);
    const query = `${track.meta.artist} ${track.meta.title}`.trim();
    let result = null;

    try {
      if ((artistCounts.get(artistKey) || 0) > 1) {
        try {
          const candidates = await artistCandidates(track, stats);
          const match = pickBestMatch(track, candidates);
          if (match) result = toLookupResult(match, 'beatport', track.meta.artist);
        } catch (err) {
          logWarn(`lookup: artist query failed for "${track.meta.artist}" —`, err);
        }
      }

      if (!result) {
        try {
          const candidates = await trackCandidates(track, stats);
          const match = pickBestMatch(track, candidates);
          if (match) result = toLookupResult(match, 'beatport', query);
        } catch (err) {
          logWarn(`lookup: beatport query failed for "${query}" —`, err);
        }
      }

      if (!result) {
        try {
          const text = await fetchJina(bandcampUrl(query), stats);
          const match = pickBestMatch(track, parseBandcampSearch(text));
          if (match) result = toLookupResult(match, 'bandcamp', query);
        } catch (err) {
          logWarn(`lookup: bandcamp query failed for "${query}" —`, err);
        }
      }
    } catch (err) {
      logWarn(`lookup: \"${track.meta.artist} - ${track.meta.title}\" failed —`, err);
    }

    if (runId !== state.scanId) {
      stats.cancelled = true;
      logDebug('lookup: cancelled after a request — workspace changed');
      return stats;
    }

    mark(track, result);
    if (result) {
      logDebug(`lookup: ${result.source} -> ${track.meta.artist} - ${track.meta.title} [${result.genre || 'no genre'} / ${result.bpm || '?'} bpm / ${result.key || '?'}]`);
    } else {
      logDebug(`lookup: unresolved -> ${track.meta.artist} - ${track.meta.title}`);
    }
  }

  log(`lookup: done — ${stats.resolved} resolved, ${stats.unresolved} unresolved, ${stats.requests} request(s), ${stats.cacheHits} cache hit(s)`);
  return stats;
}
