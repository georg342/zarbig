// single shared state object. every module imports this same reference.

import { DEFAULT_MASK, DEFAULT_CATEGORIES, cloneCategories } from './constants.js';

export const state = {
  tracks: [],
  folderName: '',
  scanning: false,
  scanId: 0,
  sortKey: 'index',
  sortDir: 'asc',
  filter: '',
  categoryFilter: 'all',
  overrides: {},
  mask: DEFAULT_MASK,
  categories: cloneCategories(DEFAULT_CATEGORIES),
  isAdmin: false
};
