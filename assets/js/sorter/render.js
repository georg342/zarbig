// renderAll: one call refreshes every panel. kept in its own module so the
// scan/admin/events modules can import it without a cycle.

import { renderCategoryOptions, renderTable, updateStats } from './table.js';
import { renderMaskHint, renderRenamePreview } from './rename.js';
import { renderCategoryMultiSelect } from './multiSelect.js';
import { state } from './state.js';
import { logDebug } from './debug.js';

export function renderAll() {
  const selected = state.tracks.filter((track) => track.selected).length;
  logDebug(`render: full redraw — ${state.tracks.length} tracks (${selected} selected), ${state.categories.length} categories`);

  renderCategoryOptions();
  renderCategoryMultiSelect();
  renderTable();
  updateStats();
  renderMaskHint();
  renderRenamePreview();
}
