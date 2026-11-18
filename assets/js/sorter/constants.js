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
export const DEEPSEEK_MAX_TAXONOMY_TRACKS = 120;
export const DEEPSEEK_TIMEOUT_MS = 120000;

// public metadata lookup through r.jina.ai (no api token). the free tier is
// rate limited to roughly 20 requests per minute, so the queue waits 3.1s
// between calls. the timeout is generous because the proxy fetches the page.
export const JINA_BASE = 'https://r.jina.ai/';
export const LOOKUP_DELAY_MS = 3100;
export const LOOKUP_TIMEOUT_MS = 60000;
export const LOOKUP_RETRIES = 1;
export const MAX_CATEGORIES_PER_TRACK = 3;

// local categorization default: jina lookup + genre categories, no deepseek.
export const DEFAULT_CATEGORIZE_MODE = 'genre';
export const CATEGORIZE_MODES = ['genre', 'presets', 'hybrid', 'ai'];

// words that make a bandcamp tag/id3 genre worth turning into a category.
// bandcamp tags are uploader tags, so a plain location tag ("berlin") must not
// become a genre category.
export const GENRE_HINTS = [
  'house', 'techno', 'trance', 'bass', 'breaks', 'breakbeat', 'ambient',
  'downtempo', 'electro', 'disco', 'garage', 'dubstep', 'drum', 'jungle',
  'hardcore', 'industrial', 'acid', 'minimal', 'progressive', 'melodic',
  'psy', 'rave', 'club', 'afro', 'amapiano', 'latin', 'pop', 'hip hop',
  'r&b', 'funk', 'soul', 'jazz', 'experimental', 'hardgroove', 'schranz',
  'groove', 'mainstage', 'indie', 'organic', 'deep tech', 'dub'
];

// generic tags that would put every track in the same bucket.
export const NON_GENRE_TAGS = [
  'electronic', 'electronica', 'music', 'edm', 'dj', 'dance', 'album',
  'single', 'ep', 'track', 'remix', 'original mix', 'extended mix'
];

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
