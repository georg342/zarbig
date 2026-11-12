// rename mask: applies the mask tokens to a track and renders the preview
// textarea. files on disk are never touched.

import { state } from './state.js';
import { DEFAULT_MASK } from './constants.js';
import { sanitizeFileName } from './utils.js';
import { categoryLabel } from './categories.js';
import { getActionableTracks } from './table.js';

export function renderMaskHint() {
  const hint = document.getElementById('maskHint');
  if (hint) hint.textContent = `rename mask: ${state.mask} — change it in admin mode.`;

  const maskInput = document.getElementById('maskInput');
  if (maskInput && document.activeElement !== maskInput && maskInput.value !== state.mask) {
    maskInput.value = state.mask;
  }
}

export function applyMask(track, index) {
  const tokens = {
    '{artist}': track.meta.artist,
    '{title}': track.meta.title,
    '{bpm}': track.meta.bpm,
    '{key}': track.meta.key,
    '{genre}': track.meta.genre,
    '{category}': track.category === 'unsorted' ? '' : categoryLabel(track.category),
    '{index}': String(index + 1).padStart(2, '0'),
    '{ext}': track.ext
  };

  let out = state.mask || DEFAULT_MASK;
  Object.keys(tokens).forEach((token) => {
    out = out.split(token).join(tokens[token] || '');
  });

  out = out
    .replace(/\{[a-z]+\}/gi, '')
    .replace(/\[\s*[-\s]*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s*$/, '')
    .trim();

  const fallback = `${track.meta.artist} - ${track.meta.title}`;
  return sanitizeFileName(out) || sanitizeFileName(fallback) || 'track';
}

export function renderRenamePreview() {
  const output = document.getElementById('renameOutput');
  if (!output) return;

  const list = getActionableTracks();
  if (!list.length) {
    output.value = '';
    return;
  }

  output.value = list
    .map((track, index) => `${track.name}  ->  ${applyMask(track, index)}.${track.ext}`)
    .join('\n');
}

export function applyMaskInput() {
  const input = document.getElementById('maskInput');
  if (!input) return;
  state.mask = input.value.trim() || DEFAULT_MASK;
  renderMaskHint();
  renderRenamePreview();
}
