// tag readers: native vorbis comment parser for opus/ogg and the jsmediatags
// fallback for every other container.

import { emptyMeta, hasAnyTag, pickValue } from './metadata.js';
import { logDebug, logWarn } from './debug.js';

export function indexOfBytes(haystack, needle, from) {
  const limit = haystack.length - needle.length;
  for (let i = Math.max(0, from || 0); i <= limit; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) { hit = false; break; }
    }
    if (hit) return i;
  }
  return -1;
}

// Opus/Ogg keep tags as plain utf-8 Vorbis comment pairs:
// vendorLength + vendor + count + (length + "KEY=value")*. jsmediatags
// cannot parse these containers, so the header is read natively. the first
// window covers the usual case; files carrying a large cover art push the
// comment block past it, so the window grows until the whole block fits.
const VORBIS_WINDOW_START = 65536;
const VORBIS_WINDOW_MAX = 4 * 1024 * 1024;

const OPUS_MAGIC = [0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]; // "OpusTags"
const VORBIS_MAGIC = [0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]; // "\x03vorbis"

// returns { found, complete, pairs } for the window it was given.
function parseVorbisBlock(buffer, fileName) {
  const bytes = new Uint8Array(buffer);
  const pairs = {};

  let start = indexOfBytes(bytes, OPUS_MAGIC, 0);
  if (start >= 0) {
    start += OPUS_MAGIC.length;
  } else {
    start = indexOfBytes(bytes, VORBIS_MAGIC, 0);
    if (start < 0) {
      logDebug(`tags: no opus/vorbis header in "${fileName}"`);
      return { found: false, complete: false, pairs };
    }
    start += VORBIS_MAGIC.length;
  }

  if (start + 4 > bytes.length) return { found: true, complete: false, pairs };
  const view = new DataView(buffer);
  const vendorLength = view.getUint32(start, true);
  let pos = start + 4 + vendorLength;
  if (pos + 4 > bytes.length) return { found: true, complete: false, pairs };

  const count = view.getUint32(pos, true);
  pos += 4;

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let complete = true;

  for (let i = 0; i < count; i += 1) {
    if (pos + 4 > bytes.length) { complete = false; break; }
    const length = view.getUint32(pos, true);
    pos += 4;
    if (length > bytes.length - pos) { complete = false; break; } // window cut the comments short
    const pair = decoder.decode(bytes.subarray(pos, pos + length));
    pos += length;

    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const field = pair.slice(0, eq).trim().toUpperCase();
    const value = pair.slice(eq + 1).trim();
    if (field && value && !(field in pairs)) pairs[field] = value;
  }

  return { found: true, complete, pairs };
}

function vorbisMeta(pairs) {
  const meta = emptyMeta();
  meta.title = pairs.TITLE || '';
  meta.artist = pairs.ARTIST || pairs.ALBUMARTIST || pairs.ALBUM_ARTIST || '';
  meta.bpm = pairs.BPM || pairs.TBPM || '';
  meta.key = pairs.INITIALKEY || pairs.KEY || pairs.TKEY || '';
  meta.genre = pairs.GENRE || '';
  meta.album = pairs.ALBUM || '';
  meta.year = pairs.DATE || pairs.YEAR || '';
  return meta;
}

export async function readVorbisComments(file) {
  const total = file.size || 0;
  const limit = Math.max(VORBIS_WINDOW_START, Math.min(VORBIS_WINDOW_MAX, total || VORBIS_WINDOW_MAX));
  let windowSize = Math.min(VORBIS_WINDOW_START, limit);

  for (;;) {
    const buffer = await file.slice(0, windowSize).arrayBuffer();
    const parsed = parseVorbisBlock(buffer, file.name);
    if (!parsed.found) return emptyMeta();
    if (parsed.complete) return vorbisMeta(parsed.pairs);

    if (windowSize >= limit) {
      logDebug(`tags: vorbis comments truncated at ${windowSize} bytes on "${file.name}"`);
      return vorbisMeta(parsed.pairs);
    }

    windowSize = Math.min(windowSize * 4, limit);
    logDebug(`tags: vorbis comments exceed the first ${windowSize / 4} bytes on "${file.name}" — reading ${windowSize}`);
  }
}

export function normalizeId3(tags) {
  const meta = emptyMeta();
  if (!tags || typeof tags !== 'object') return meta;
  meta.title = pickValue(tags.title || tags.TIT2);
  meta.artist = pickValue(tags.artist || tags.albumartist || tags.TPE1);
  meta.bpm = pickValue(tags.TBPM || tags.bpm || tags.BPM);
  meta.key = pickValue(tags.TKEY || tags.initialkey || tags.INITIALKEY);
  meta.genre = pickValue(tags.genre || tags.TCON);
  meta.album = pickValue(tags.album || tags.TALB);
  meta.year = pickValue(tags.year || tags.TDRC);
  return meta;
}

export function readWithJsmediatags(file) {
  return new Promise((resolve) => {
    if (typeof window.jsmediatags === 'undefined' || !window.jsmediatags.read) {
      logWarn('tags: jsmediatags is not loaded — tag reading is disabled');
      resolve(emptyMeta());
      return;
    }
    try {
      window.jsmediatags.read(file, {
        onSuccess: (result) => resolve(normalizeId3(result && result.tags)),
        onError: (err) => {
          logDebug(`tags: jsmediatags failed on "${file.name}" —`, err && err.type ? err.type : err);
          resolve(emptyMeta());
        }
      });
    } catch (err) {
      logWarn(`tags: jsmediatags threw on "${file.name}" —`, err);
      resolve(emptyMeta());
    }
  });
}

// opus/ogg never reach jsmediatags: it throws on those containers.
export async function readTags(file, ext) {
  if (ext === 'opus' || ext === 'ogg') {
    try {
      return { meta: await readVorbisComments(file), source: 'vorbis' };
    } catch (err) {
      logWarn(`tags: vorbis parse failed on "${file.name}" —`, err);
      return { meta: emptyMeta(), source: 'none' };
    }
  }

  const meta = await readWithJsmediatags(file);
  return { meta, source: hasAnyTag(meta) ? 'tags' : 'none' };
}
