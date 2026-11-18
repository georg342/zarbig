// single shared state object. every module imports this same reference.

import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORIZE_MODE,
  DEFAULT_MASK,
  cloneCategories
} from './constants.js';

export const state = {
  tracks: [],
  folderName: '',
  scanning: false,
  scanId: 0,
  sortKey: 'index',
  sortDir: 'asc',
  filter: '',
  overrides: {},
  mask: DEFAULT_MASK,
  categories: cloneCategories(DEFAULT_CATEGORIES),
  // ids checked in the category multi-select dropdown (the analysis pool)
  targetCategories: [],
  // genre (default) | presets | hybrid | ai — see analysis.js
  categorizeMode: DEFAULT_CATEGORIZE_MODE,
  isAdmin: false
};
