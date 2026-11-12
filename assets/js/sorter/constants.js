// constants and defaults: extensions, admin hash, storage key, mask tokens and
// the four category presets shipped with the page.

export const AUDIO_EXTENSIONS = ['mp3', 'opus', 'wav', 'flac', 'm4a', 'aiff', 'aif', 'ogg'];
export const ADMIN_HASH = 'f1c1592588411002af340cbaedd6fc33';
export const SORTER_STORAGE_KEY = 'zb_sorter_cfg';

export const DEFAULT_MASK = '{artist} - {title}';
export const MASK_PRESETS = {
  bpmKey: '[{bpm} - {key}] {artist} - {title}'
};
export const MASK_TOKENS = ['{artist}', '{title}', '{bpm}', '{key}', '{genre}', '{category}', '{index}', '{ext}'];

export const DEFAULT_CATEGORIES = [
  {
    id: 'warmup_groove',
    label: 'warmup groove',
    minBpm: 0,
    maxBpm: 122,
    keywords: ['warm up', 'warmup', 'groove', 'deep house', 'melodic', 'progressive', 'downtempo']
  },
  {
    id: 'hypnotic_techno',
    label: 'hypnotic techno',
    minBpm: 122,
    maxBpm: 136,
    keywords: ['hypnotic', 'minimal', 'dub techno', 'psy', 'rolling', 'groove techno']
  },
  {
    id: 'peak_industrial',
    label: 'peak industrial',
    minBpm: 136,
    maxBpm: 999,
    keywords: ['industrial', 'hard techno', 'hardgroove', 'acid', 'schranz', 'peak', 'rave', 'distorted']
  },
  {
    id: 'closing_hard',
    label: 'closing hard',
    minBpm: null,
    maxBpm: null,
    keywords: ['closing', 'closer', 'last track', 'final', 'outro']
  }
];

export function cloneCategories(list) {
  return list.map((cat) => ({ ...cat, keywords: [...cat.keywords] }));
}
