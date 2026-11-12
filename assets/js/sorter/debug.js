// debug console: the sorter twin of the extractor page log. every module
// imports log/logDebug/logWarn/logError to trace what is being processed, and
// initDebug() wires the global error hooks plus the copy/clear buttons.
//
// the panel lives in pages/sorter.html (#debugLog, readonly textarea) and is
// fed only from here, so "copy log" always exports plain text.

import { state } from './state.js';
import { copyText } from './utils.js';

// the console keeps the most recent lines only: big folders dump a lot of
// per-track lines and the textarea must stay usable.
const MAX_LINES = 1500;
const TRIM_TO = 1000;
const LEVEL_TAG = { info: '[info]', debug: '[debug]', warn: '[warn]', error: '[error]' };

let entries = [];

function box() {
  return document.getElementById('debugLog');
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

// turns anything into a single log-friendly line.
function format(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

function write(level, parts) {
  const line = `[${timestamp()}] ${LEVEL_TAG[level]} ${parts.map(format).join(' ')}`;
  entries.push(line);

  const trimmed = entries.length > MAX_LINES;
  if (trimmed) entries = entries.slice(entries.length - TRIM_TO);

  const area = box();
  if (!area) return;

  if (trimmed) {
    area.value = entries.join('\n') + '\n';
  } else {
    area.value += line + '\n';
  }

  area.scrollTop = area.scrollHeight;
}

export function log(...parts) {
  write('info', parts);
}

export function logDebug(...parts) {
  write('debug', parts);
}

// warnings and errors are mirrored to the browser console (devtools trace).
export function logWarn(...parts) {
  write('warn', parts);
  console.warn('[sorter]', ...parts);
}

export function logError(...parts) {
  write('error', parts);
  console.error('[sorter]', ...parts);
}

export function clearLog() {
  entries = [];
  const area = box();
  if (area) area.value = '';
}

export function copyLog() {
  const area = box();
  const text = area ? area.value : entries.join('\n');
  if (!text.trim()) {
    copyText('', 'log is empty');
    return;
  }
  copyText(text, 'log copied!');
}

// called once by sorter.js on DOMContentLoaded.
export function initDebug() {
  // sorter.html calls these from inline onclick handlers.
  window.copyLog = copyLog;
  window.clearLog = clearLog;

  window.addEventListener('error', (event) => {
    const file = event.filename ? String(event.filename).split('/').pop() : 'inline';
    logError(`global error (${file}:${event.lineno || 0}): ${event.message}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logError('unhandled rejection:', reason && reason.message ? reason.message : reason);
  });

  log(`boot — ${state.categories.length} categories, mask "${state.mask}"`);
}
