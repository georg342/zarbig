// category presets editor (admin only): one row per category with id, label,
// bpm range and keywords.

import { state } from './state.js';
import { DEFAULT_CATEGORIES, cloneCategories } from './constants.js';
import { escapeHtml, toast } from './utils.js';
import { pruneCategoryRefs } from './categories.js';
import { renderAll } from './render.js';
import { renderCategoryMultiSelect } from './multiSelect.js';

export function categoryRowHtml(cat, index) {
  return `<div class="cat-row" data-index="${index}">
    <div class="cat-row-head">
      <span class="cat-row-id">${escapeHtml(cat.id)}</span>
      <button type="button" class="cat-remove" data-remove="${index}" title="remove category"><i class="ph ph-trash"></i></button>
    </div>
    <div class="cat-grid">
      <div>
        <label>id</label>
        <input type="text" data-field="id" data-cat="${index}" value="${escapeHtml(cat.id)}">
      </div>
      <div>
        <label>label</label>
        <input type="text" data-field="label" data-cat="${index}" value="${escapeHtml(cat.label)}">
      </div>
      <div>
        <label>min bpm</label>
        <input type="text" inputmode="numeric" data-field="minBpm" data-cat="${index}" value="${cat.minBpm === null ? '' : cat.minBpm}">
      </div>
      <div>
        <label>max bpm</label>
        <input type="text" inputmode="numeric" data-field="maxBpm" data-cat="${index}" value="${cat.maxBpm === null ? '' : cat.maxBpm}">
      </div>
      <div class="cat-full">
        <label>description (multi-select + ai)</label>
        <input type="text" data-field="description" data-cat="${index}" value="${escapeHtml(cat.description || '')}" placeholder="optional — falls back to bpm + keywords">
      </div>
      <div class="cat-full">
        <label>keywords (comma separated)</label>
        <input type="text" data-field="keywords" data-cat="${index}" value="${escapeHtml(cat.keywords.join(', '))}">
      </div>
    </div>
  </div>`;
}

export function renderCategoryEditor() {
  const editor = document.getElementById('categoryEditor');
  if (!editor) return;

  if (!state.categories.length) {
    editor.innerHTML = '<p class="help-text">no categories yet — add one below.</p>';
    return;
  }

  editor.innerHTML = state.categories.map(categoryRowHtml).join('');

  editor.querySelectorAll('input[data-cat]').forEach((input) => {
    input.addEventListener('input', onCategoryFieldInput);
  });

  editor.querySelectorAll('.cat-remove').forEach((button) => {
    button.addEventListener('click', () => removeCategory(Number(button.dataset.remove)));
  });
}

export function onCategoryFieldInput(event) {
  const input = event.target;
  const index = Number(input.dataset.cat);
  const field = input.dataset.field;
  const cat = state.categories[index];
  if (!cat || !field) return;

  if (field === 'keywords') {
    cat.keywords = input.value
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return;
  }

  if (field === 'minBpm' || field === 'maxBpm') {
    const raw = input.value.trim();
    const num = Number(raw);
    cat[field] = raw === '' || !Number.isFinite(num) ? null : num;
    return;
  }

  cat[field] = input.value.trim();
}

export async function removeCategory(index) {
  const cat = state.categories[index];
  if (!cat) return;

  const ok = await window.showCustomModal({
    title: 'remove category',
    message: `delete "${escapeHtml(cat.label)}"? matching tracks fall back to the next best rule.`
  });
  if (!ok) return;

  state.categories.splice(index, 1);
  pruneCategoryRefs();
  renderCategoryEditor();
  renderCategoryMultiSelect();
  renderAll();
  toast('category removed');
}

export function addCategory() {
  let id = 'new_category';
  let counter = 2;
  while (state.categories.some((cat) => cat.id === id)) {
    id = `new_category_${counter}`;
    counter += 1;
  }

  state.categories.push({
    id,
    label: 'new category',
    description: '',
    minBpm: null,
    maxBpm: null,
    keywords: []
  });

  renderCategoryEditor();
  renderCategoryMultiSelect();
  toast('category added');
}

export async function resetCategories() {
  const ok = await window.showCustomModal({
    title: 'reset categories',
    message: 'restore the four default presets? manual overrides are cleared too.'
  });
  if (!ok) return;

  state.categories = cloneCategories(DEFAULT_CATEGORIES);
  state.overrides = {};
  pruneCategoryRefs();
  renderCategoryEditor();
  renderCategoryMultiSelect();
  renderAll();
  toast('default categories restored');
}
