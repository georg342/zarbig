// renderAll: one call refreshes every panel. kept in its own module so the
// scan/admin/events modules can import it without a cycle.

import { renderCategoryOptions, renderTable, updateStats } from './table.js';
import { renderMaskHint, renderRenamePreview } from './rename.js';
import { renderCategoryMultiSelect } from './multiSelect.js';

export function renderAll() {
  renderCategoryOptions();
  renderCategoryMultiSelect();
  renderTable();
  updateStats();
  renderMaskHint();
  renderRenamePreview();
}
