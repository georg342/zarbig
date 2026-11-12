// constants and defaults: extensions, admin hash, storage key, mask tokens and
// the four category presets shipped with the page.

export const AUDIO_EXTENSIONS = ['mp3', 'opus', 'wav', 'flac', 'm4a', 'aiff', 'aif', 'ogg'];
export const ADMIN_HASH = 'f1c1592588411002af340cbaedd6fc33';
export const SORTER_STORAGE_KEY = 'zb_sorter_cfg';

// legacy storage slot for the deepseek key. it is purged on every load and
// never written again: the key lives only in memory (see sorter/ai.js).
export const LEGACY_DEEPSEEK_KEY_STORAGE = 'zb_deepseek_key';
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_BATCH_SIZE = 20;

export const DEFAULT_MASK = '{artist} - {title}';
export const MASK_PRESETS = {
  bpmKey: '[{bpm} - {key}] {artist} - {title}'
};
export const MASK_TOKENS = ['{artist}', '{title}', '{bpm}', '{key}', '{genre}', '{category}', '{index}', '{ext}'];

export const DEFAULT_CATEGORIES = [
  {
    id: 'warmup_groove',
    label: 'warmup groove',
    description: 'opening material: deep, melodic, progressive and downtempo grooves to build the floor.',
    minBpm: 0,
    maxBpm: 122,
    keywords: ['warm up', 'warmup', 'groove', 'deep house', 'melodic', 'progressive', 'downtempo']
  },
  {
    id: 'hypnotic_techno',
    label: 'hypnotic techno',
    description: 'rolling, dubby and hypnotic tools that keep a steady tension through the middle of the set.',
    minBpm: 122,
    maxBpm: 136,
    keywords: ['hypnotic', 'minimal', 'dub techno', 'psy', 'rolling', 'groove techno']
  },
  {
    id: 'peak_industrial',
    label: 'peak industrial',
    description: 'peak time weapons: hard, industrial, acid and rave driven tracks with heavy weight.',
    minBpm: 136,
    maxBpm: 999,
    keywords: ['industrial', 'hard techno', 'hardgroove', 'acid', 'schranz', 'peak', 'rave', 'distorted']
  },
  {
    id: 'closing_hard',
    label: 'closing hard',
    description: 'closing tracks: anthemic, final-hour material meant to end the set with a bang.',
    minBpm: null,
    maxBpm: null,
    keywords: ['closing', 'closer', 'last track', 'final', 'outro']
  }
];

export function cloneCategories(list) {
  return list.map((cat) => ({ ...cat, keywords: [...cat.keywords] }));
}
