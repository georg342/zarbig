// admin mode: md5 password gate, rename mask editor and the commit that
// applies + saves the whole config (mask + categories).

import { state } from './state.js';
import { ADMIN_HASH, DEFAULT_CATEGORIES, DEFAULT_MASK, MASK_TOKENS, cloneCategories } from './constants.js';
import { toast } from './utils.js';
import { normalizeCategoryList, saveConfig } from './config.js';
import { recategorizeAll } from './categories.js';
import { renderAll } from './render.js';
import { applyMaskInput, renderMaskHint, renderRenamePreview } from './rename.js';
import { renderCategoryEditor } from './adminCategories.js';

export function setAdminUI(enabled) {
  state.isAdmin = enabled;

  const card = document.getElementById('adminCard');
  const badge = document.getElementById('adminBadge');
  const toggle = document.getElementById('btnAdminToggle');

  if (card) card.style.display = enabled ? 'block' : 'none';
  if (badge) badge.style.display = enabled ? 'inline-flex' : 'none';
  if (toggle) {
    toggle.innerHTML = enabled
      ? '<i class="ph ph-lock-open"></i> exit admin mode'
      : '<i class="ph ph-lock"></i> admin mode';
  }

  // the floating gradient picker follows admin mode (helper lives in main.js)
  if (window.setAdminBgWidget) window.setAdminBgWidget(enabled);

  if (enabled) {
    renderMaskEditor();
    renderCategoryEditor();
  }
}

window.toggleAdminMode = async function () {
  if (state.isAdmin) {
    setAdminUI(false);
    toast('admin mode disabled');
    return;
  }

  // md5 comes from the blueimp cdn script, so it lives on window.
  if (typeof window.md5 !== 'function') {
    toast('md5 library not loaded');
    return;
  }

  const pass = await window.showCustomModal({
    title: 'admin access',
    message: 'enter admin password to proceed:',
    isPrompt: true,
    placeholder: 'password...'
  });

  if (pass === null) return;

  if (window.md5(pass.trim()) === ADMIN_HASH) {
    setAdminUI(true);
    toast('login successful');
  } else {
    toast('invalid password');
  }
};

export function renderMaskEditor() {
  const input = document.getElementById('maskInput');
  if (input) input.value = state.mask;

  const chips = document.getElementById('maskTokens');
  if (!chips) return;

  chips.innerHTML = MASK_TOKENS
    .map((token) => `<button type="button" class="token-chip" data-token="${token}">${token}</button>`)
    .join('');

  chips.querySelectorAll('.token-chip').forEach((chip) => {
    chip.addEventListener('click', () => insertMaskToken(chip.dataset.token));
  });
}

export function insertMaskToken(token) {
  const input = document.getElementById('maskInput');
  if (!input) return;

  const start = input.selectionStart == null ? input.value.length : input.selectionStart;
  const end = input.selectionEnd == null ? input.value.length : input.selectionEnd;
  input.value = input.value.slice(0, start) + token + input.value.slice(end);

  const pos = start + token.length;
  input.setSelectionRange(pos, pos);
  input.focus();
  applyMaskInput();
}

export function resetMask() {
  state.mask = DEFAULT_MASK;
  const input = document.getElementById('maskInput');
  if (input) input.value = DEFAULT_MASK;
  renderMaskHint();
  renderRenamePreview();
  toast('default mask restored');
}

export function commitConfig() {
  const maskInput = document.getElementById('maskInput');
  const mask = maskInput && maskInput.value.trim() ? maskInput.value.trim() : DEFAULT_MASK;

  const clean = normalizeCategoryList(state.categories);
  state.mask = mask;
  state.categories = clean.length ? clean : cloneCategories(DEFAULT_CATEGORIES);

  Object.keys(state.overrides).forEach((trackId) => {
    const stillExists = state.categories.some((cat) => cat.id === state.overrides[trackId]);
    if (!stillExists) delete state.overrides[trackId];
  });

  recategorizeAll();
  renderMaskEditor();
  renderCategoryEditor();
  renderAll();

  const saved = saveConfig();
  toast(saved ? 'config saved' : 'config applied (storage blocked)');
}
