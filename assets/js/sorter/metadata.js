// metadata: filename fallback parser, normalizers and the merge of filename +
// tag values into the object the table renders.

export function emptyMeta() {
  return { artist: '', title: '', bpm: '', key: '', genre: '', album: '', year: '' };
}

export function pickValue(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return value == null ? '' : String(value).trim();
}

export function normalizeBpm(value) {
  const match = String(value || '').match(/\d{2,3}(?:[.,]\d+)?/);
  if (!match) return '';
  const num = parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(num) ? String(Number(num.toFixed(2))) : '';
}

export function normalizeKey(value) {
  let key = String(value || '').replace(/\s+/g, '').trim();
  const camelot = key.match(/^(\d{1,2})([ab])$/i);
  if (camelot) key = camelot[1] + camelot[2].toUpperCase();
  return key;
}

// "01. artist - title (original mix).mp3" -> { artist, title, bpm, key }
export function parseFilename(fileName) {
  const meta = { artist: '', title: '', bpm: '', key: '', genre: '' };
  let base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
  base = base.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  const bracket = base.match(/^[\[(]\s*(\d{2,3})\s*[-–]?\s*([0-9]{1,2}\s*[a-g][#b]?)\s*[\])]\s*[-–]?\s*/i);
  if (bracket) {
    meta.bpm = normalizeBpm(bracket[1]);
    meta.key = normalizeKey(bracket[2]);
    base = base.slice(bracket[0].length);
  } else {
    const bpmPrefix = base.match(/^(\d{2,3})\s*bpm\s*[-–]?\s*/i);
    if (bpmPrefix) {
      meta.bpm = normalizeBpm(bpmPrefix[1]);
      base = base.slice(bpmPrefix[0].length);
    }
  }

  base = base.replace(/^\d{1,3}\s*[.)-]\s+/, '').trim();

  const parts = base.split(/\s+[-–]\s+/);
  if (parts.length >= 2) {
    meta.artist = parts[0].trim();
    meta.title = parts.slice(1).join(' - ').trim();
  } else {
    meta.title = base.trim();
  }

  return meta;
}

export function hasAnyTag(meta) {
  return Boolean(meta && (meta.artist || meta.title || meta.bpm || meta.key || meta.genre));
}

export function mergeMeta(filenameMeta, tagMeta) {
  const merged = { ...emptyMeta(), ...filenameMeta };
  Object.keys(merged).forEach((field) => {
    const value = tagMeta && tagMeta[field] ? String(tagMeta[field]).trim() : '';
    if (value) merged[field] = value;
  });
  merged.bpm = normalizeBpm(merged.bpm);
  merged.key = normalizeKey(merged.key);
  if (!merged.artist) merged.artist = 'unknown artist';
  if (!merged.title) merged.title = 'untitled';
  return merged;
}
