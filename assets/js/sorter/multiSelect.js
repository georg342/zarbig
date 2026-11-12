// custom category multi-select (neo-brutalism dropdown): the trigger shows how
// many categories are active and the panel lists every category as a checkbox
// with a short description preview. only the checked ids feed the analysis.

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { categoryDescription } from './categories.js';

const DESCRIPTION_PREVIEW = 72;

export function initTargetCategories() {
  state.targetCategories = state.categories.map((cat) => cat.id);
}

// drops ids that no longer exist after an admin edit/reset.
export function pruneTargetCategories() {
  const ids = state.categories.map((cat) => cat.id);
  state.targetCategories = ids.filter((id) => state.targetCategories.includes(id));
}

export function activeCategoryIds() {
  return state.categories
    .filter((cat) => state.targetCategories.includes(cat.id))
    .map((cat) => cat.id);
}

export function getTargetCategories() {
  return state.categories.filter((cat) => state.targetCategories.includes(cat.id));
}

export function updateMultiSelectLabel() {
  const label = document.getElementById('multiSelectLabel');
  const trigger = document.getElementById('multiSelectTrigger');
  const selected = activeCategoryIds().length;
  const total = state.categories.length;

  if (label) label.textContent = `target categories (${selected} selected)`;
  if (trigger) trigger.title = `${selected} / ${total} categories active`;
  return { selected, total };
}

function itemHtml(cat) {
  const checked = state.targetCategories.includes(cat.id) ? ' checked' : '';
  const description = categoryDescription(cat);
  const preview = description.length > DESCRIPTION_PREVIEW
    ? `${description.slice(0, DESCRIPTION_PREVIEW - 1)}…`
    : description;

  return `<label class="multi-select-item">
    <input type="checkbox" data-cat-id="${escapeHtml(cat.id)}"${checked}>
    <span class="multi-select-text">
      <span class="multi-select-name">${escapeHtml(cat.label)}</span>
      <span class="multi-select-desc">${escapeHtml(preview)}</span>
    </span>
  </label>`;
}

export function renderCategoryMultiSelect() {
  pruneTargetCategories();

  const list = document.getElementById('multiSelectList');
  if (list) {
    list.innerHTML = state.categories.length
      ? state.categories.map(itemHtml).join('')
      : '<p class="multi-select-empty">no categories yet — add one in admin mode.</p>';
  }

  updateMultiSelectLabel();
}

function setPanelOpen(open) {
  const panel = document.getElementById('multiSelectPanel');
  const trigger = document.getElementById('multiSelectTrigger');
  if (panel) panel.hidden = !open;
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function onMultiSelectChange(event) {
  const box = event.target.closest('input[type="checkbox"][data-cat-id]');
  if (!box) return;

  const id = box.dataset.catId;
  if (box.checked) {
    if (!state.targetCategories.includes(id)) state.targetCategories.push(id);
  } else {
    state.targetCategories = state.targetCategories.filter((value) => value !== id);
  }

  updateMultiSelectLabel();
}

export function selectAllTargetCategories() {
  initTargetCategories();
  renderCategoryMultiSelect();
}

export function clearAllTargetCategories() {
  state.targetCategories = [];
  renderCategoryMultiSelect();
}

export function bindMultiSelect() {
  const root = document.getElementById('categoryMultiSelect');
  const trigger = document.getElementById('multiSelectTrigger');
  const list = document.getElementById('multiSelectList');
  if (!root || !trigger) return;

  trigger.addEventListener('click', () => {
    const panel = document.getElementById('multiSelectPanel');
    setPanelOpen(Boolean(panel && panel.hidden));
  });

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) setPanelOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setPanelOpen(false);
  });

  if (list) list.addEventListener('change', onMultiSelectChange);

  const btnSelectAll = document.getElementById('btnSelectAllCats');
  if (btnSelectAll) btnSelectAll.addEventListener('click', selectAllTargetCategories);

  const btnClearAll = document.getElementById('btnClearAllCats');
  if (btnClearAll) btnClearAll.addEventListener('click', clearAllTargetCategories);
}
