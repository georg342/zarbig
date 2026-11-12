// generic helpers: strings, files, toasts, copy to clipboard and the analyze
// progress bar. no page logic lives here.

import { AUDIO_EXTENSIONS } from './constants.js';

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getExtension(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function isAudioFile(file) {
  return AUDIO_EXTENSIONS.includes(getExtension(file.name));
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function toast(message) {
  if (typeof window.mostrarToast === 'function') window.mostrarToast(message);
}

export function setStatus(message) {
  const el = document.getElementById('analyzeStatus');
  if (el) el.textContent = message;
}

export function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120);
}

export function downloadFile(fileName, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function copyText(text, message) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => toast(message))
      .catch(() => toast('copy failed'));
    return;
  }

  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
    toast(message);
  } catch (err) {
    toast('copy failed');
  }
  area.remove();
}

export function setProgress(percent) {
  const bar = document.getElementById('analyzeBar');
  const wrap = document.getElementById('analyzeWrap');
  if (wrap) wrap.style.display = 'block';
  if (bar) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
}

export function hideProgress() {
  const wrap = document.getElementById('analyzeWrap');
  if (wrap) wrap.style.display = 'none';
}
