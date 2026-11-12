// renderAll: one call refreshes every panel. kept in its own module so the
// scan/admin/events modules can import it without a cycle.

import { renderCategoryOptions, renderTable, updateStats } from './table.js';
import { renderMaskHint, renderRenamePreview } from './rename.js';

export function renderAll() {
  renderCategoryOptions();
  renderTable();
  updateStats();
  renderMaskHint();
  renderRenamePreview();
}
