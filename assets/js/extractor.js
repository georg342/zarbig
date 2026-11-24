const YOUTUBE_API_KEY = 'AIzaSyBN02HbxDwq9KuCjaJa4cqtFV9gvIe_xDk'; // default youtube data api key (public search uses jina)
const ADMIN_HASH = 'f1c1592588411002af340cbaedd6fc33';
const JINA_SEARCH_BASE = 'https://r.jina.ai/https://www.youtube.com/results?search_query=';
const STORAGE_KEYS = { ytKey: 'zb_yt_key', adminCfg: 'zb_admin_cfg', excludeKeywords: 'zb_exclude_keywords', ytLinks: 'zb_yt_links', playlistUrl: 'zb_playlist_url' };
const DEFAULT_SUFFIXES = ['official audio', 'topic'];
const DEFAULT_ADMIN_CFG = { maxResults: 15, delayMs: 1000, suffixes: DEFAULT_SUFFIXES, useApi: true, autoPick: true };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(msg) {
  const box = document.getElementById('debugLog');
  if (!box) return;
  box.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  box.scrollTop = box.scrollHeight;
}

window.onerror = (msg, src, l) => log(`erro global (l:${l}): ${msg}`);

let musicasGlobal = [];
let nomePlaylist = "playlist";
let isAdmin = false;

// ==========================================
// ADMIN MODE (same scheme as sets.js)
// ==========================================
// Accepts an array or a ",/;"-separated string and returns a clean suffix list.
// `fallback` is used only when nothing was ever saved (no key in localStorage).
function parseSufixos(valor, fallback) {
  if (valor === undefined || valor === null) return [...fallback];

  const lista = Array.isArray(valor) ? valor : String(valor).split(/[\n,;]+/);
  const sufixos = lista.map(s => String(s).trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean);

  return [...new Set(sufixos)].slice(0, 10);
}

// ==========================================
// TITLE EXCLUDE FILTER (public + admin)
// ==========================================
// "live, Remix ,, cover" -> ['live','remix','cover']
function parseKeywordsExclusao(valor) {
  if (valor === undefined || valor === null) return [];

  const lista = Array.isArray(valor) ? valor : String(valor).split(',');
  const keywords = lista.map(k => String(k).trim().toLowerCase()).filter(Boolean);

  return [...new Set(keywords)];
}

// kept in memory so the filter does not touch localStorage for every result
let keywordsExclusao = [];
let descartesFiltro = 0;

function lerKeywordsExclusao() {
  try {
    return parseKeywordsExclusao(localStorage.getItem(STORAGE_KEYS.excludeKeywords));
  } catch (e) {
    return [];
  }
}

function preencherKeywordsExclusao() {
  const input = document.getElementById('cfgExcludeKeywords');
  if (input) input.value = keywordsExclusao.join(', ');
}

function salvarKeywordsExclusao() {
  const input = document.getElementById('cfgExcludeKeywords');
  if (!input) return;

  keywordsExclusao = parseKeywordsExclusao(input.value);
  try {
    localStorage.setItem(STORAGE_KEYS.excludeKeywords, keywordsExclusao.join(', '));
  } catch (e) {
    log('[warn] não foi possível salvar as keywords de exclusão.');
  }
}

// ==========================================
// PLAYLIST URL (localStorage)
// ==========================================
// Same idea as the exclude keywords: the field is written on every keystroke and
// restored on load, so the last playlist link survives a reload.
function lerUrlPlaylist() {
  try {
    const salva = localStorage.getItem(STORAGE_KEYS.playlistUrl);
    return salva === null ? null : salva;
  } catch (e) {
    return null;
  }
}

function preencherUrlPlaylist() {
  const input = document.getElementById('url');
  if (!input) return;

  const salva = lerUrlPlaylist();
  // never stored (null) keeps the html default; a cleared field stays empty
  if (salva === null) return;

  input.value = salva;
}

function salvarUrlPlaylist() {
  const input = document.getElementById('url');
  if (!input) return;

  try {
    localStorage.setItem(STORAGE_KEYS.playlistUrl, input.value.trim());
  } catch (e) {
    log('[warn] não foi possível salvar a url da playlist.');
  }
}

// true when the video title contains any excluded keyword
function tituloBloqueado(titulo) {
  if (!keywordsExclusao.length) return false;

  const alvo = String(titulo || '').toLowerCase();
  return keywordsExclusao.some(k => alvo.includes(k));
}

// Drops blocked results and counts them for the batch toast.
function filtrarResultados(resultados) {
  if (!keywordsExclusao.length) return resultados;

  return resultados.filter(opt => {
    if (!tituloBloqueado(opt.title)) return true;
    descartesFiltro++;
    log(`[filtro] descartado pelo título: "${opt.title}"`);
    return false;
  });
}

// ==========================================
// ART TRACK PREFERENCE (public + admin)
// ==========================================
// Art tracks are the label-delivered uploads youtube builds from a release: the
// channel is "<artist> - topic" (localized as "- tópico") and the description
// carries the distributor credit ("provided to youtube by ...") plus a ℗/© line.
// Both search backends run their candidates through priorizarArtTracks(), so the
// official audio wins when it exists and the old first-result behaviour stays as
// the fallback when no art track is found.
const ART_TRACK_CHANNEL = /\s-\s*(?:topic|t[óo]pico)\s*$/i;
const ART_TRACK_DESCRIPTION = /provided to youtube by|℗|©\s*\d{4}|&copy;\s*\d{4}/i;

function ehArtTrack(opt) {
  if (!opt) return false;

  // the api returns the channel name as a field; the jina scrape carries it in
  // the markdown, so this single check covers both backends
  if (ART_TRACK_CHANNEL.test(String(opt.channelTitle || ''))) return true;

  return ART_TRACK_DESCRIPTION.test(String(opt.description || ''));
}

// Stable reorder: art tracks first, original order kept inside each group.
function priorizarArtTracks(resultados) {
  if (!Array.isArray(resultados)) return resultados;

  const artTracks = [];
  const demais = [];

  resultados.forEach(opt => {
    opt.artTrack = ehArtTrack(opt);
    (opt.artTrack ? artTracks : demais).push(opt);
  });

  return artTracks.concat(demais);
}

// The spotify artist has to show up in the video title or channel. When it does
// not, the row is flagged so the pick can be reviewed by hand (an accent or a
// featured credit should not trigger it, normalizarNome strips both).
function artistaNoVideo(m, opt) {
  const texto = normalizarNome(`${opt.title || ''} ${opt.channelTitle || ''}`);
  if (!texto) return false;

  const artistas = String(m.artista || '')
    .split(',')
    .map(normalizarNome)
    .filter(a => a && a !== 'unknown');

  // no artist on the spotify side: nothing to compare against
  if (!artistas.length) return true;

  return artistas.some(artista => new RegExp(`\\b${artista}\\b`).test(texto));
}

// ==========================================
// YOUTUBE LINK CACHE (localStorage)
// ==========================================
// Only the picked video id plus the title/channel shown in the ui are kept: the
// url is rebuilt from the yt music toggle, so both link flavours stay valid.
// Key = normalized "artista|titulo", so the same track found in another playlist
// (or loaded again later) skips the whole search.
const LINK_CACHE_LIMIT = 2000;

let linksCache = {};
let linksCacheTimer = null;

function chaveLinkYt(m) {
  return `${normalizarNome(m.artista)}|${normalizarNome(m.titulo)}`;
}

function lerLinkCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ytLinks);
    if (!raw) return {};

    const salvo = JSON.parse(raw);
    if (!salvo || typeof salvo !== 'object' || Array.isArray(salvo)) return {};

    // ignore anything that does not look like a youtube video id
    return Object.keys(salvo).reduce((mapa, chave) => {
      const item = salvo[chave];
      if (item && typeof item.id === 'string' && item.id.length === 11) {
        mapa[chave] = {
          id: item.id,
          title: typeof item.title === 'string' ? item.title : '',
          channel: typeof item.channel === 'string' ? item.channel : ''
        };
      }
      return mapa;
    }, {});
  } catch (e) {
    return {};
  }
}

function salvarLinkCache() {
  if (linksCacheTimer) {
    clearTimeout(linksCacheTimer);
    linksCacheTimer = null;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.ytLinks, JSON.stringify(linksCache));
  } catch (e) {
    log(`[warn] cache de links não salvo: ${e.message}`);
  }
}

// drops the oldest entries once the cap is hit (object keys keep insertion order)
function podarLinkCache() {
  const chaves = Object.keys(linksCache);
  const excedente = chaves.length - LINK_CACHE_LIMIT;
  if (excedente <= 0) return;

  chaves.slice(0, excedente).forEach(chave => { delete linksCache[chave]; });
}

// batches write once per 800ms instead of once per track
function agendarSalvarLinkCache() {
  if (linksCacheTimer) return;
  linksCacheTimer = setTimeout(salvarLinkCache, 800);
}

function cachearLinkYt(m, opt) {
  if (!opt || !opt.id) return;

  linksCache[chaveLinkYt(m)] = {
    id: opt.id,
    title: opt.title || '',
    channel: opt.channelTitle || '',
    art: opt.artTrack === true || ehArtTrack(opt)
  };

  podarLinkCache();
  agendarSalvarLinkCache();
}

// Cached option for this track, or null. A cached video whose title is now
// blocked by the exclude keywords is ignored, so the filter still wins.
function lerLinkYt(m) {
  const item = linksCache[chaveLinkYt(m)];
  if (!item) return null;

  if (tituloBloqueado(item.title)) {
    log(`[filtro] link em cache descartado pelo título: "${item.title}"`);
    return null;
  }

  return {
    id: item.id,
    title: item.title,
    channelTitle: item.channel,
    // cache entries written before the art track flag existed are still
    // classifiable by the "<artist> - topic" channel name
    artTrack: item.art === true || ehArtTrack({ channelTitle: item.channel }),
    thumbnail: `https://i.ytimg.com/vi/${item.id}/default.jpg`
  };
}

// Single place that writes a resolved video into a track and mirrors it to the
// link cache, so a later load of the same track skips the search.
function aplicarLinkYt(m, opt, usarYtMusic) {
  const prefixo = usarYtMusic ? "music.youtube.com" : "www.youtube.com";

  m.ytUrl = `https://${prefixo}/watch?v=${opt.id}`;
  m.ytTitle = opt.title;
  m.ytChannel = opt.channelTitle;
  m.ytArt = opt.artTrack === true || ehArtTrack(opt);
  m.artistaOk = artistaNoVideo(m, opt);
  m.erroYt = false;

  cachearLinkYt(m, opt);
}

function getAdminCfg() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.adminCfg);
    if (!raw) return { ...DEFAULT_ADMIN_CFG };

    const parsed = JSON.parse(raw);
    const maxResults = parseInt(parsed.maxResults, 10);
    const delayMs = parseInt(parsed.delayMs, 10);

    return {
      maxResults: Number.isFinite(maxResults) ? Math.min(50, Math.max(1, maxResults)) : DEFAULT_ADMIN_CFG.maxResults,
      delayMs: Number.isFinite(delayMs) ? Math.min(15000, Math.max(0, delayMs)) : DEFAULT_ADMIN_CFG.delayMs,
      // `suffix` (old single string) is still read and migrated into the list.
      suffixes: parseSufixos(parsed.suffixes !== undefined ? parsed.suffixes : parsed.suffix, DEFAULT_ADMIN_CFG.suffixes),
      useApi: parsed.useApi !== false,
      autoPick: parsed.autoPick !== false
    };
  } catch (e) {
    return { ...DEFAULT_ADMIN_CFG };
  }
}

function getYtKey() {
  try {
    return (localStorage.getItem(STORAGE_KEYS.ytKey) || YOUTUBE_API_KEY || '').trim();
  } catch (e) {
    return YOUTUBE_API_KEY;
  }
}

function preencherYtKey() {
  const input = document.getElementById('ytApiKeyInput');
  if (input) input.value = getYtKey();
}

function preencherAdminCfg() {
  const cfg = getAdminCfg();
  const maxInput = document.getElementById('cfgMaxResults');
  const delayInput = document.getElementById('cfgDelay');
  const suffixInput = document.getElementById('cfgSuffix');
  const apiInput = document.getElementById('cfgUseApi');
  const autoInput = document.getElementById('cfgAutoPick');

  if (maxInput) maxInput.value = cfg.maxResults;
  if (delayInput) delayInput.value = cfg.delayMs;
  if (suffixInput) suffixInput.value = cfg.suffixes.join('\n');
  if (apiInput) apiInput.checked = cfg.useApi;
  if (autoInput) autoInput.checked = cfg.autoPick;
}

function salvarYtKey() {
  const input = document.getElementById('ytApiKeyInput');
  const value = input ? input.value.trim() : '';
  if (!value) {
    mostrarToast('empty key, nothing to save!');
    return;
  }

  localStorage.setItem(STORAGE_KEYS.ytKey, value);
  log('[admin] youtube api key saved (localStorage).');
  mostrarToast('youtube api key saved!');
}

function limparYtKey() {
  localStorage.removeItem(STORAGE_KEYS.ytKey);
  preencherYtKey();
  log('[admin] youtube api key reset to the default value.');
  mostrarToast('youtube api key reset to default');
}

function limparChavesSpotify() {
  localStorage.removeItem('sp_cid');
  localStorage.removeItem('sp_csec');

  const cid = document.getElementById('cid');
  const csec = document.getElementById('csec');
  if (cid) cid.value = '';
  if (csec) csec.value = '';

  log('[admin] spotify keys cleared.');
  mostrarToast('spotify keys cleared');
}

function salvarAdminCfg() {
  const maxInput = document.getElementById('cfgMaxResults');
  const delayInput = document.getElementById('cfgDelay');
  const suffixInput = document.getElementById('cfgSuffix');
  const apiInput = document.getElementById('cfgUseApi');
  const autoInput = document.getElementById('cfgAutoPick');
  const atual = getAdminCfg();

  const maxResults = parseInt(maxInput ? maxInput.value : '', 10);
  const delayMs = parseInt(delayInput ? delayInput.value : '', 10);

  const cfg = {
    maxResults: Number.isFinite(maxResults) ? Math.min(50, Math.max(1, maxResults)) : atual.maxResults,
    delayMs: Number.isFinite(delayMs) ? Math.min(15000, Math.max(0, delayMs)) : atual.delayMs,
    suffixes: parseSufixos(suffixInput ? suffixInput.value : '', []),
    useApi: apiInput ? apiInput.checked : atual.useApi,
    autoPick: autoInput ? autoInput.checked : atual.autoPick
  };

  localStorage.setItem(STORAGE_KEYS.adminCfg, JSON.stringify(cfg));
  preencherAdminCfg();
  log(`[admin] search params saved: ${JSON.stringify(cfg)}`);
  mostrarToast('search params saved!');
}

// Instant toggle: turns the official api on/off without waiting for "save params".
function alternarUsoApi() {
  const input = document.getElementById('cfgUseApi');
  const cfg = { ...getAdminCfg(), useApi: !!(input && input.checked) };

  localStorage.setItem(STORAGE_KEYS.adminCfg, JSON.stringify(cfg));
  log(`[admin] official youtube api ${cfg.useApi ? 'enabled' : 'disabled'} (fallback: r.jina.ai).`);
  mostrarToast(cfg.useApi ? 'youtube api enabled' : 'youtube api disabled');
}

function setAdminUI(enabled) {
  isAdmin = enabled;

  const adminCard = document.getElementById('adminCard');
  const btnAdminToggle = document.getElementById('btnAdminToggle');

  if (adminCard) adminCard.style.display = enabled ? 'block' : 'none';
  if (btnAdminToggle) {
    btnAdminToggle.innerHTML = enabled
      ? '<i class="ph ph-lock-open" aria-hidden="true"></i> exit admin mode'
      : '<i class="ph ph-lock" aria-hidden="true"></i> admin mode';
  }

  // admin mode stacks more cards in the controls column: re-measure the panel
  // height and redraw the ghost rows when nothing is loaded
  if (!musicasGlobal.length) render();
  agendarSyncResultsCap();

  // the floating gradient picker follows admin mode (helper lives in main.js)
  if (window.setAdminBgWidget) window.setAdminBgWidget(enabled);
}

let __toggleLock = false;
window.toggleAdminMode = async function () {
  if (__toggleLock) return;
  __toggleLock = true;
  try {
    console.log('[admin-debug] click', { isAdmin, md5Type: typeof md5 });
    if (isAdmin) {
      setAdminUI(false);
      mostrarToast('admin mode disabled');
      if (musicasGlobal.length) render();
      return;
    }

    if (typeof md5 !== 'function') {
      log('[err] library md5 não carregou; não é possível validar a senha.');
      mostrarToast('md5 library not loaded');
      return;
    }

    console.log('[admin-debug] opening modal');
    const pass = await window.showCustomModal({
      title: 'admin access',
      message: 'enter admin password to proceed:',
      isPrompt: true,
      placeholder: 'password...'
    });

    console.log('[admin-debug] resolved', { isNull: pass === null, len: pass ? pass.length : null });

    if (pass === null) return;

    console.log('[admin-debug] checking', { match: md5(pass.trim()) === ADMIN_HASH });

    if (md5(pass.trim()) === ADMIN_HASH) {
      console.log('[admin-debug] calling setAdminUI(true)');
      setAdminUI(true);
      console.log('[admin-debug] card display:', (document.getElementById('adminCard') || {}).style?.display);
      preencherYtKey();
      preencherAdminCfg();
      mostrarToast('login successful');
      if (musicasGlobal.length) render();
    } else {
      mostrarToast('invalid password');
    }
  } finally {
    __toggleLock = false;
  }
};

// ==========================================
// RESULTS PANEL HEIGHT
// ==========================================
// The controls column decides how long the page is. Its height is measured with
// the stretch class off (otherwise offsetHeight already reports the stretched
// row). --list-h then caps the track list at (column height - fixed chrome), so
// only the list scrolls: the filter above and the buttons below stay visible and
// the card itself never scrolls. No observer that measures its own target: that
// is what produced the "resizeobserver loop" error.
const MIN_LIST_HEIGHT = 120;

// Height taken by everything except the list body: card border/padding, header,
// search, selection row, toggle, help text and buttons, plus the list margins.
// Summed from the children because the card is stretched: (card height - list
// height) would count the leftover space as chrome.
function medirChromeResCard() {
  const card = document.getElementById('resCard');
  const list = document.getElementById('lista');
  if (!card || !list) return 0;

  const cs = getComputedStyle(card);
  const num = (valor) => parseFloat(valor) || 0;

  let total = num(cs.borderTopWidth) + num(cs.borderBottomWidth)
    + num(cs.paddingTop) + num(cs.paddingBottom);

  Array.from(card.children).forEach(el => {
    const st = getComputedStyle(el);
    if (st.display === 'none') return;

    total += num(st.marginTop) + num(st.marginBottom);
    if (el !== list) total += el.getBoundingClientRect().height;
  });

  return total;
}

function syncResultsCap() {
  const main = document.getElementById('main');
  const controls = document.querySelector('.col-controls');
  if (!main || !controls) return;

  const chrome = medirChromeResCard();

  // the column height is only its own content with the stretch class off,
  // otherwise offsetHeight already reports the stretched grid row
  const esticado = main.classList.contains('stretch-results');
  if (esticado) main.classList.remove('stretch-results');
  const alturaColuna = controls.offsetHeight;
  main.classList.add('stretch-results');

  // the card gets exactly the column height, with a floor that keeps the fixed
  // chrome plus a usable list; the list takes whatever is left and scrolls
  const alturaCartao = Math.max(alturaColuna, chrome + MIN_LIST_HEIGHT);

  main.style.setProperty('--card-h', `${alturaCartao}px`);

  // the list height changed: the ghost rows follow it
  fitPlaceholderRows();
}

function agendarSyncResultsCap() {
  requestAnimationFrame(() => {
    syncResultsCap();
    fitPlaceholderRows();
  });
}

// Inicializa melhorias na UI dinamicamente se necessário
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.fetchWithTimeout !== 'function') {
    log('[fatal] main.js not loaded');
    return;
  }

  const urlInput = document.getElementById('url');
  if (urlInput && !document.getElementById('btnClearUrl')) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = 'btnClearUrl';
    clearBtn.className = 'btn-url-clear';
    clearBtn.title = 'clear url';
    clearBtn.setAttribute('aria-label', 'clear url');
    clearBtn.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
    clearBtn.onclick = limparUrlSpotify;

    // Wraps the url input so the small clear button sits beside the field.
    const row = document.createElement('div');
    row.className = 'url-row';
    urlInput.parentNode.insertBefore(row, urlInput);
    row.appendChild(urlInput);
    row.appendChild(clearBtn);
  }

  keywordsExclusao = lerKeywordsExclusao();
  linksCache = lerLinkCache();
  preencherKeywordsExclusao();
  preencherUrlPlaylist();
  preencherYtKey();

  const scanInput = document.getElementById('scanFolderInput');
  if (scanInput) scanInput.addEventListener('change', onPastaSelecionada);

  // draws the placeholder rows so the results panel is shaped before any load
  render();

  // panel height changes with the viewport: re-measure the cap and the ghost rows
  window.addEventListener('resize', agendarSyncResultsCap);
  agendarSyncResultsCap();

  // fonts and icons change the controls column height after first paint
  window.addEventListener('load', agendarSyncResultsCap);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(agendarSyncResultsCap).catch(() => {});
  }
});

function limparUrlSpotify() {
  const urlInput = document.getElementById('url');
  if (urlInput) urlInput.value = '';
  // clearing the field also clears the stored link, otherwise it returns on reload
  salvarUrlPlaylist();
  mostrarToast('spotify url cleared');
}

function limparLog() { document.getElementById('debugLog').value = ''; }
function copiarLog() { window.copyText(document.getElementById('debugLog').value, "log copied!"); }
function salvarChaves() {
  localStorage.setItem('sp_cid', document.getElementById('cid').value.trim());
  localStorage.setItem('sp_csec', document.getElementById('csec').value.trim());
}
function toggleBox(id) {
  const b = document.getElementById(id);
  if (!b) return;
  const aberto = b.style.display !== 'block';
  b.style.display = aberto ? 'block' : 'none';
  // keep the toggle button in sync for screen readers
  const controle = document.querySelector(`[aria-controls="${id}"]`);
  if (controle) controle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
}

function getId(url) {
  const m = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

// Shared timeout wrapper provided by main.js.
const fetchRapido = window.fetchWithTimeout;

async function extrair() {
  const url = document.getElementById('url').value.trim();
  const status = document.getElementById('status');
  const id = getId(url);
  if (!id) return status.innerText = "invalid link.";

  nomePlaylist = "playlist";
  status.innerText = "extracting playlist...";
  try {
    await semApi(id); 
  } catch (e) {
    status.innerText = `error: ${e.message}`;
    log(`erro na extração: ${e.message}`);
  }
}

function limparTextoSpotify(str) {
  return str.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/^E\s+/, '').toLowerCase();
}

function extrairDados(raw) {
  if (raw.includes("### ") && raw.includes("#### ")) {
    const tm = raw.match(/Title:\s*(.+)/i);
    if (tm) nomePlaylist = tm[1].trim().toLowerCase();
    const rx = /(?:^\d+\.\s*)?###\s+([^\n\r]+)[\s\r\n]+####\s+([^\n\r]+)/gm;
    const faixas = [];
    let m;
    while ((m = rx.exec(raw)) !== null) {
      faixas.push(criarObjetoMusica(faixas.length + 1, m[1], m[2]));
    }
    return faixas;
  }
  return [];
}

function criarObjetoMusica(num, tit, art) {
  return {
    num: num,
    titulo: limparTextoSpotify(tit),
    artista: limparTextoSpotify(art),
    selecionada: true,
    ytUrl: null,
    ytTitle: null,
    ytChannel: null,
    ytArt: false,
    artistaOk: true,
    erroYt: false 
  };
}

// ==========================================
// SPOTIFY PLAYLIST > 100 TRACKS (NO OAUTH)
// ==========================================
// The embed page ships an anonymous session token inside __NEXT_DATA__, and the
// web player graphql endpoint answers with it, so playlists above the embed's
// 100 track cap can be paged. cors: api-partner allows authorization/app-platform
// from any origin and r.jina.ai allows x-return-format, so no extra proxy is needed.
const SPOTIFY_CACHE_PREFIX = 'zb_spotify_cache_';
const SPOTIFY_EMBED_BASE = 'https://open.spotify.com/embed/playlist/';
const SPOTIFY_PATHFINDER = 'https://api-partner.spotify.com/pathfinder/v1/query';
const SPOTIFY_FETCH_PLAYLIST = {
  operation: 'fetchPlaylist',
  hash: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf'
};
const SPOTIFY_PAGE_SIZE = 100;

// Pulls accessToken + expiration out of the embed __NEXT_DATA__ payload.
function extrairTokenEmbed(html) {
  if (!html) return null;

  const bloco = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  const json = bloco ? bloco[1] : html;

  let token = null;
  let expiraEm = 0;

  try {
    const sessao = JSON.parse(json)?.props?.pageProps?.state?.settings?.session;
    token = sessao?.accessToken || null;
    expiraEm = parseInt(sessao?.accessTokenExpirationTimestampMs, 10) || 0;
  } catch (e) {
    // regex fallback below handles a payload that the parser rejects
  }

  if (!token) {
    const m = json.match(/"accessToken":"([^"]+)"/);
    token = m ? m[1] : null;
  }
  if (!expiraEm) {
    const m = json.match(/"accessTokenExpirationTimestampMs":(\d+)/);
    expiraEm = m ? parseInt(m[1], 10) : 0;
  }

  return token ? { token: token, expiraEm: expiraEm } : null;
}

// Asks r.jina.ai for the raw embed html (not the markdown) to get the token.
async function buscarTokenSpoti(id) {
  const alvo = `${SPOTIFY_EMBED_BASE}${id}`;
  log('[info] [spotify] buscando token anônimo no embed (html)...');

  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const res = await fetchRapido(`https://r.jina.ai/${alvo}`, {
        headers: { 'X-Return-Format': 'html' },
        referrerPolicy: 'no-referrer'
      }, 25000);

      // jina answers 403/429 when the free tier throttles, and a 200 body can still
      // be a warning page: the token check decides, not the status code.
      const dados = extrairTokenEmbed(await res.text());
      if (dados) return dados;
      ultimoErro = new Error(`sem token no html (http ${res.status})`);
      log(`[warn] [spotify] token não encontrado (tentativa ${tentativa}/2, http ${res.status}).`);
    } catch (e) {
      ultimoErro = e;
      log(`[warn] [spotify] token falhou (tentativa ${tentativa}/2): ${e.message}`);
    }
    if (tentativa < 2) await sleep(1500);
  }

  throw new Error(`token anônimo indisponível (${ultimoErro ? ultimoErro.message : 'sem resposta'})`);
}

// One page of the playlist through the web player persisted query.
async function buscarPaginaSpoti(id, token, offset) {
  const variables = JSON.stringify({
    uri: `spotify:playlist:${id}`,
    offset: offset,
    limit: SPOTIFY_PAGE_SIZE,
    enableWatchFeedEntrypoint: false
  });
  const extensions = JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: SPOTIFY_FETCH_PLAYLIST.hash }
  });
  const url = `${SPOTIFY_PATHFINDER}?operationName=${SPOTIFY_FETCH_PLAYLIST.operation}`
    + `&variables=${encodeURIComponent(variables)}&extensions=${encodeURIComponent(extensions)}`;

  const res = await fetchRapido(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'app-platform': 'WebPlayer' },
    referrerPolicy: 'no-referrer'
  }, 15000);

  if (!res.ok) throw new Error(`pathfinder http ${res.status}`);

  const dados = await res.json();
  if (dados.errors && dados.errors.length) throw new Error(`pathfinder: ${dados.errors[0].message}`);

  const playlist = dados.data && dados.data.playlistV2;
  if (!playlist) throw new Error('pathfinder: playlist vazia');
  return playlist;
}

// itemV2/itemV3 -> the same { titulo, artista } shape the embed parser produces.
function normalizarFaixaSpoti(item) {
  const faixa = (item && (item.itemV2?.data || item.itemV3?.data)) || null;
  if (!faixa) return null;

  const titulo = faixa.name || (faixa.data && faixa.data.name);
  if (!titulo) return null;

  const artistas = (faixa.artists?.items || []).map(a => a && a.profile && a.profile.name).filter(Boolean);
  const doAlbum = (faixa.albumOfTrack?.artists?.items || []).map(a => a && a.profile && a.profile.name).filter(Boolean);

  return { titulo: titulo, artista: (artistas.length ? artistas : doAlbum).join(', ') || 'unknown' };
}

// Pages to the end. Anything unexpected throws so semApi can fall back to the embed parse.
async function extrairViaPathfinder(id) {
  const { token } = await buscarTokenSpoti(id);

  const faixas = [];
  let nome = null;
  let total = 0;
  let offset = 0;

  for (;;) {
    const playlist = await buscarPaginaSpoti(id, token, offset);
    if (!nome) nome = playlist.name || null;

    const pagina = playlist.content || {};
    const itens = pagina.items || [];
    total = pagina.totalCount || total;

    itens.forEach(item => {
      const faixa = normalizarFaixaSpoti(item);
      if (faixa) faixas.push(faixa);
    });

    if (itens.length < SPOTIFY_PAGE_SIZE) break;
    offset += SPOTIFY_PAGE_SIZE;
    if (total && offset >= total) break;
    if (offset >= 10000) break; // safety stop for a runaway loop
  }

  if (!faixas.length) throw new Error('pathfinder não retornou faixas');
  log(`[ok] [spotify] ${faixas.length} faixas via pathfinder (total ${total}).`);
  return { nome: nome, faixas: faixas };
}

function lerCacheSpoti(id) {
  try {
    const raw = sessionStorage.getItem(SPOTIFY_CACHE_PREFIX + id);
    if (!raw) return null;

    const salvo = JSON.parse(raw);
    if (!salvo || !Array.isArray(salvo.faixas) || !salvo.faixas.length) return null;
    return salvo;
  } catch (e) {
    return null;
  }
}

function salvarCacheSpoti(id, dados) {
  try {
    sessionStorage.setItem(SPOTIFY_CACHE_PREFIX + id, JSON.stringify(dados));
  } catch (e) {
    log('[warn] cache da sessão cheio; playlist não foi cacheada.');
  }
}

// Turns the { nome, faixas } payload into the page's music objects.
function aplicarPlaylistSpoti(dados) {
  if (dados.nome) nomePlaylist = dados.nome;
  musicasGlobal = dados.faixas.map((f, i) => criarObjetoMusica(i + 1, f.titulo, f.artista));
  render();
  document.getElementById('status').innerText = `${musicasGlobal.length} tracks loaded!`;
}

async function semApi(id) {
  // same playlist loaded twice in one session reuses the sessionStorage copy
  const cache = lerCacheSpoti(id);
  if (cache) {
    aplicarPlaylistSpoti(cache);
    log(`[cache] ${cache.faixas.length} faixas restauradas da sessão.`);
    return;
  }

  // route 1: anonymous embed token + pathfinder graphql (no 100 track cap)
  try {
    const dados = await extrairViaPathfinder(id);
    salvarCacheSpoti(id, dados);
    aplicarPlaylistSpoti(dados);
    return;
  } catch (e) {
    log(`[warn] [spotify] pathfinder falhou (${e.message}); caindo para o parse do embed.`);
    mostrarToast('limite de 100 faixas (fallback)');
  }

  // route 2: embed markdown parse (spotify caps this one at 100 tracks)
  const target = `${SPOTIFY_EMBED_BASE}${id}`;
  const proxies = [
    { nome: "jina", url: `https://r.jina.ai/${target}` },
    { nome: "allorigins", url: `https://api.allorigins.win/get?url=${encodeURIComponent(target)}` }
  ];
  for (const p of proxies) {
    try {
      log(`buscando playlist via [${p.nome}]...`);
      const r = await fetchRapido(p.url, { referrerPolicy: "no-referrer" });
      if (!r.ok) continue;
      let txt = await r.text();
      if (p.nome === "allorigins") {
        try { txt = JSON.parse(txt).contents; } catch(ex){}
      }
      const dados = extrairDados(txt);
      if (dados && dados.length > 0) {
        musicasGlobal = dados;
        render();
        document.getElementById('status').innerText = `${dados.length} tracks loaded!`;
        log(`sucesso! ${dados.length} músicas extraídas.`);
        return;
      }
    } catch(e) {
      log(`falha proxy ${p.nome}: ${e.message}`);
    }
  }
  throw new Error("não foi possível extrair automaticamente. use o modo manual.");
}

function abrirFonte() {
  const id = getId(document.getElementById('url').value.trim());
  if (id) window.open(`https://r.jina.ai/https://open.spotify.com/embed/playlist/${id}`, '_blank');
}

function extrairManual() {
  const lista = extrairDados(document.getElementById('htmlManual').value.trim());
  if (lista?.length) {
    musicasGlobal = lista;
    render();
    document.getElementById('status').innerText = `${lista.length} tracks loaded!`;
  } else mostrarToast("no tracks found in text.");
}

function atualizarContador() {
  const sel = musicasGlobal.filter(m => m.selecionada).length;
  const comYt = musicasGlobal.filter(m => m.selecionada && m.ytUrl).length;
  document.getElementById('selCount').innerText = `${sel} selected (link: ${comYt})`;
}

function toggleItem(num, ev) {
  if (ev && (ev.target.tagName === 'A' || ev.target.tagName === 'BUTTON' || ev.target.closest('button') || ev.target.dataset?.retry)) return;
  const item = musicasGlobal.find(m => m.num === num);
  if (item && !item.jaTenho) item.selecionada = !item.selecionada;
  render();
}

function selecionarTodas(estado) {
  const q = document.getElementById('busca').value.toLowerCase();
  musicasGlobal.forEach(m => {
    if (m.jaTenho) return;
    if (!q || m.titulo.toLowerCase().includes(q) || m.artista.toLowerCase().includes(q)) {
      m.selecionada = estado;
    }
  });
  render();
}

function copiarLinkUnico(num, ev) {
  if (ev) ev.stopPropagation();
  const m = musicasGlobal.find(x => x.num === num);
  if (!m) return;

  let links = [];
  if (m.ytUrl) links.push(m.ytUrl);

  if (links.length === 0) {
    mostrarToast("no link to copy yet!");
    return;
  }

  window.copyText(links.join('\n'), `link #${m.num} copied!`);
}

// Ghost rows keep the results panel shaped before a playlist is loaded, so the
// page never shows a blank column next to the controls. Rows always use flex to
// share the list height; `placeholderCount` is adjusted by fitPlaceholderRows().
let placeholderCount = 7;

function renderPlaceholderRows(total = 7) {
  const linhas = Array.from({ length: total }, (_, i) => `
    <li class="track-item skeleton" aria-hidden="true">
      <span class="skeleton-box skeleton-check"></span>
      <span class="num">${i + 1}</span>
      <div class="info">
        <span class="skeleton-bar skeleton-title"></span>
        <span class="skeleton-bar skeleton-artist"></span>
      </div>
      <span class="skeleton-box skeleton-badge"></span>
    </li>
  `).join('');

  return `<li class="track-item empty">no playlist loaded yet. paste a spotify link and hit load playlist.</li>${linhas}`;
}

// Keeps the ghost rows close to the height of a real track row (~47px): the
// count follows the panel height instead of stretching a few rows into fat bars.
// The hint row takes ~40px of the list, so it is discounted first.
function fitPlaceholderRows() {
  if (musicasGlobal.length) return;
  if (window.matchMedia('(max-width: 1024px)').matches) return;

  const lista = document.getElementById('lista');
  if (!lista || !lista.clientHeight) return;

  const total = Math.min(40, Math.max(1, Math.round((lista.clientHeight - 40) / 47)));
  if (total === placeholderCount) return;

  placeholderCount = total;
  render();
}

function render() {
  document.getElementById('pTitle').innerText = nomePlaylist.toLowerCase();
  const q = document.getElementById('busca').value.toLowerCase();
  const filtradas = musicasGlobal.filter(m =>
    m.titulo.toLowerCase().includes(q) || m.artista.toLowerCase().includes(q)
  );

  const lista = document.getElementById('lista');
  if (!musicasGlobal.length) {
    lista.innerHTML = renderPlaceholderRows(placeholderCount);
    // the row count follows the panel height, measured by syncResultsCap
    agendarSyncResultsCap();
    atualizarContador();
    updateToolsVisibility();
    return;
  }

  lista.innerHTML = filtradas.map(m => {
    let badgeYt = `<span class="yt-badge" id="badge-yt-${m.num}">no link</span>`;
    if (m.ytUrl) {
      badgeYt = `<a href="${m.ytUrl}" target="_blank" class="yt-badge ok" onclick="event.stopPropagation()">yt link</a>`;
    } else if (m.erroYt) {
      badgeYt = `<span class="yt-badge err" data-retry="true" onclick="tentarUnica(${m.num}, 'yt')">error (retry)</span>`;
    }

    let ytDetailsHtml = '';
    if (m.ytTitle && m.ytChannel) {
      ytDetailsHtml = `
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px; text-transform: lowercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px;">
          <span style="color: #fff;">video:</span> ${window.escapeHtml(m.ytTitle)} | <span style="color: #fff;">channel:</span> ${window.escapeHtml(m.ytChannel)}
        </div>
      `;
    }

    let changeVideoBtn = '';
    if (isAdmin && m.ytUrl) {
      changeVideoBtn = `<button class="copy-btn" onclick="alterarVideoManual(${m.num}, event)" title="change video"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>`;
    }

    const ownedBadge = m.jaTenho ? `<span class="owned-badge">owned</span>` : '';
    // official label upload picked by priorizarArtTracks()
    const artBadge = m.ytArt ? `<span class="art-badge">art track</span>` : '';
    // link resolved but the spotify artist is absent from title/channel: review it
    const avisoArtista = (m.ytUrl && m.artistaOk === false)
      ? `<span class="artist-warn" role="img" aria-label="artist not found in the video" title="artist not found in the video"><i class="ph ph-warning" aria-hidden="true"></i></span>`
      : '';

    return `
      <li class="track-item ${m.selecionada ? 'selected' : ''} ${m.jaTenho ? 'owned' : ''}" onclick="toggleItem(${m.num}, event)">
        <input type="checkbox" ${m.selecionada ? 'checked' : ''} ${m.jaTenho ? 'disabled' : ''} onclick="event.stopPropagation(); toggleItem(${m.num})">
        <span class="num">${m.num}</span>
        <div class="info" style="flex-grow: 1; overflow: hidden;">
          <div class="title">${window.escapeHtml(m.titulo)}</div>
          <div class="artist">${window.escapeHtml(m.artista)}</div>
          ${ytDetailsHtml}
        </div>
        <div class="badges-container" style="display: flex; align-items: center; gap: 6px;">
          ${ownedBadge}
          ${avisoArtista}
          ${artBadge}
          ${badgeYt}
          ${changeVideoBtn}
          ${m.ytUrl ? `<button class="copy-btn" onclick="copiarLinkUnico(${m.num}, event)" title="copy link"><i class="ph ph-copy" aria-hidden="true"></i></button>` : ''}
        </div>
      </li>
    `;
  }).join('');

  // playlist loaded but nothing matches the search: say it instead of leaving a bare box
  if (!filtradas.length) {
    lista.innerHTML = `<li class="track-item empty">no tracks match "${window.escapeHtml(q)}"</li>`;
  }

  atualizarContador();
  updateToolsVisibility();
}

// ==========================================
// YOUTUBE SEARCH LAYER
// public mode -> r.jina.ai scrape (no api key)
// admin mode  -> youtube data api v3 (falls back to jina on error)
// ==========================================
function montarTermosBusca(m) {
  const cfg = getAdminCfg();
  const base = `${m.titulo} ${m.artista}`.trim();
  const comSufixo = cfg.suffixes.map(s => `${base} ${s}`.trim()).filter(Boolean);

  // the bare "title artist" query goes first: it is the one that surfaces art
  // tracks, and the suffixes stay behind it as the transparent fallback
  return [...new Set([base, ...comSufixo])];
}

// The official api only runs in admin mode with the "use official youtube api" toggle on.
function usandoApiOficial() {
  return isAdmin && getAdminCfg().useApi;
}

// Parses the markdown returned by r.jina.ai for youtube search results.
function parseResultadosJina(raw) {
  if (!raw) return [];

  const videoRegex = /^### \[([^\]]+)\]\((https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})[^)]*)\)/gm;
  const channelRegex = /\[([^\]]+)\]\(https:\/\/www\.youtube\.com\/(?:channel\/[A-Za-z0-9_-]+|@[A-Za-z0-9._-]+)\)/;
  const resultados = [];
  const vistos = new Set();

  let match;
  while ((match = videoRegex.exec(raw)) !== null) {
    const id = match[3];
    if (vistos.has(id)) continue;

    // the snippet window stops at the next result heading: without that cut a
    // "provided to youtube by" line bleeds into the previous candidate
    const proximo = raw.indexOf('\n### [', match.index + 4);
    const fim = proximo === -1 ? match.index + 400 : Math.min(proximo, match.index + 400);
    const trecho = raw.slice(match.index, fim);
    const canal = trecho.match(channelRegex);
    // the search markdown sometimes carries the description snippet; that is the
    // only text signal available without an extra fetch per candidate
    const descricao = /provided to youtube by/i.test(trecho) ? 'provided to youtube by' : '';

    vistos.add(id);
    resultados.push({
      id: id,
      title: limparTextoSpotify(match[1]).trim(),
      channelTitle: canal ? limparTextoSpotify(canal[1]).trim() : 'youtube',
      description: descricao,
      thumbnail: `https://i.ytimg.com/vi/${id}/default.jpg`
    });
  }

  return resultados;
}

async function buscarResultadosApi(m) {
  const cfg = getAdminCfg();
  const key = getYtKey();

  if (!key) throw new Error('youtube api key not configured');

  const termos = montarTermosBusca(m);

  for (let i = 0; i < termos.length; i++) {
    const termo = termos[i];
    // the first (bare) query only accepts art tracks; the suffixes keep the old
    // behaviour, so a missing art track falls back to the usual pick
    const apenasArtTrack = i === 0 && termos.length > 1;

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${cfg.maxResults}&q=${encodeURIComponent(termo)}&key=${key}`;
    log(`[info] [youtube api] buscando opções para: "${termo}"`);

    const res = await fetchRapido(url, {}, 15000);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `http error ${res.status}`);
    }

    const data = await res.json();
    const brutos = (data.items || []).map(item => ({
      id: item.id.videoId,
      title: (item.snippet.title || '').toLowerCase(),
      channelTitle: (item.snippet.channelTitle || '').toLowerCase(),
      description: item.snippet.description || '',
      thumbnail: item.snippet.thumbnails?.default?.url || ''
    })).filter(opt => opt.id);
    // art tracks first: the api gives channel + description on the result itself,
    // so no extra details call is needed to confirm one
    const ordenados = priorizarArtTracks(filtrarResultados(brutos));
    const resultados = apenasArtTrack ? ordenados.filter(opt => opt.artTrack) : ordenados;

    if (resultados.length > 0) return resultados;
    if (brutos.length > 0) {
      log(`[info] [youtube api] todos os ${brutos.length} vídeos de "${termo}" caíram no filtro de título; tentando o próximo sufixo...`);
      continue;
    }
    log(`[warn] [youtube api] sem resultados para "${termo}"; tentando o próximo sufixo...`);
  }

  return [];
}

async function buscarResultadosJina(m) {
  const cfg = getAdminCfg();
  const termos = montarTermosBusca(m);

  for (let i = 0; i < termos.length; i++) {
    const termo = termos[i];
    // bare query first: only art tracks count there, the suffixes keep the old
    // behaviour as the fallback when the bare query finds none
    const apenasArtTrack = i === 0 && termos.length > 1;

    const target = `${JINA_SEARCH_BASE}${encodeURIComponent(termo)}`;
    log(`[info] [jina] buscando resultados para: "${termo}"`);

    let resultados = [];

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        // r.jina.ai may answer with a 401 warning header and still return the scraped
        // page, so success is measured by parsed results instead of res.ok.
        const res = await fetchRapido(target, { referrerPolicy: 'no-referrer' }, 20000);
        const txt = await res.text();
        const brutos = parseResultadosJina(txt);
        if (brutos.length > 0) {
          // a suffix whose videos were all filtered still counts as an attempt:
          // no retry, just move on to the next suffix.
          // the "- topic" channel is the art track signal available here; the
          // scrape carries no description, so no extra fetch is spent on it
          const ordenados = priorizarArtTracks(filtrarResultados(brutos));
          resultados = apenasArtTrack ? ordenados.filter(opt => opt.artTrack) : ordenados;
          if (resultados.length === 0) {
            log(`[info] [jina] todos os ${brutos.length} vídeos de "${termo}" caíram no filtro de título.`);
          }
          break;
        }
        log(`[warn] [jina] nenhum vídeo encontrado (tentativa ${tentativa}/3)`);
      } catch (e) {
        log(`[warn] [jina] tentativa ${tentativa}/3 falhou: ${e.message}`);
      }
      if (tentativa < 3) await sleep(1500 * tentativa);
    }

    if (resultados.length > 0) return resultados.slice(0, cfg.maxResults);
    log(`[warn] [jina] nenhum vídeo para "${termo}"; tentando o próximo sufixo...`);
  }

  return [];
}

// Backend: official api (admin + toggle on), with r.jina.ai as fallback.
async function buscarResultados(m) {
  if (usandoApiOficial()) {
    try {
      const resultados = await buscarResultadosApi(m);
      if (resultados.length > 0) return resultados;
      log(`[warn] [youtube api] sem resultados; caindo para jina...`);
    } catch (err) {
      log(`[err] youtube api falhou (${err.message}); caindo para jina...`);
      mostrarToast(`youtube api error: ${err.message}`);
    }
  } else if (isAdmin) {
    log('[info] api oficial desligada nos search params; usando r.jina.ai.');
  }

  return buscarResultadosJina(m);
}

// Busca automática em segundo plano: pega o 1º resultado silenciosamente sem abrir modals
async function acharVideoAutomatico(m) {
  // a track already resolved before (same playlist or not) skips the search
  const emCache = lerLinkYt(m);
  if (emCache) {
    log(`[cache] faixa #${m.num} resolvida pelo cache (${emCache.id}).`);
    return emCache;
  }

  const opcoes = await buscarResultados(m);
  if (opcoes.length > 0) {
    return opcoes[0];
  }
  return null;
}

// Abre o modal de seleção manual (Zarbig Mode) para escolher entre os 15 resultados
async function mostrarModalZarbig(m, opcoes) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    // same apg dialog pattern as showCustomModal: named, modal and escapable,
    // otherwise keyboard users are left on the trigger behind the overlay
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'zarbigModalTitle');

    let optionsHtml = opcoes.map((opt, index) => `
      <div style="background: #0a0a0a; border: var(--border-width) solid var(--border-color); padding: 8px; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px;" data-id="${window.escapeHtml(opt.id)}" class="zarbig-opt-item">
        <img src="${window.escapeHtml(opt.thumbnail)}" alt="thumb" style="width: 60px; height: 45px; object-fit: cover; border: var(--border-width) solid var(--border-color); flex-shrink: 0;" />
        <div style="flex-grow: 1; overflow: hidden;">
          <div style="color: #fff; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: lowercase;">${index + 1}. ${window.escapeHtml(opt.title)}</div>
          <div style="color: var(--text-muted); font-size: 0.7rem; text-transform: lowercase;">channel: ${window.escapeHtml(opt.channelTitle)}</div>
        </div>
        <button class="btn-sec" style="width: auto; margin:0; padding: 4px 8px; font-size: 0.7rem; text-transform: lowercase;">select</button>
      </div>
    `).join('');

    overlay.innerHTML = `
      <div class="custom-modal-card" style="max-width: 500px; width: 90%;">
        <h3 class="section-title" id="zarbigModalTitle" style="margin-bottom: 6px; color: var(--admin-text); text-transform: lowercase;">zarbig mode</h3>
        <div class="custom-modal-msg" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px; text-transform: lowercase;">select the correct video for: <br><strong style="color: #fff;">${window.escapeHtml(m.titulo)} - ${window.escapeHtml(m.artista)}</strong></div>
        <div style="max-height: 350px; overflow-y: auto; margin-bottom: 14px; padding-right: 4px;">
          ${optionsHtml || '<div style="color:var(--text-muted); text-align:center; text-transform: lowercase;">no results found</div>'}
        </div>
        <div class="custom-modal-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="modalBtnCancel" class="btn-modal-cancel" style="text-transform: lowercase;">cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // focus goes back to the trigger on close; escape cancels like the button does
    const opener = document.activeElement;
    const close = (value) => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (opener && typeof opener.focus === 'function') opener.focus();
      resolve(value);
    };
    const onKeydown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close(null);
    };
    document.addEventListener('keydown', onKeydown);

    // park focus on the panel (not on a "select" button): the list is announced and
    // the first enter cannot pick a video by accident
    const card = overlay.querySelector('.custom-modal-card');
    card.tabIndex = -1;
    card.focus();

    overlay.querySelectorAll('.zarbig-opt-item').forEach(el => {
      el.addEventListener('click', () => {
        const selectedId = el.getAttribute('data-id');
        const selectedOpt = opcoes.find(o => o.id === selectedId);
        close(selectedOpt || null);
      });
    });

    overlay.querySelector('#modalBtnCancel').addEventListener('click', () => {
      close(null);
    });
  });
}

// Botão de alteração manual (gatilho exclusivo do admin / Zarbig Mode)
async function alterarVideoManual(num, ev) {
  if (window.__zbBatchRunning) { mostrarToast('already running'); return; }
  window.__zbBatchRunning = true;

  if (ev) ev.stopPropagation();
  if (!isAdmin) {
    window.__zbBatchRunning = false;
    mostrarToast('admin mode required to change videos');
    return;
  }

  const m = musicasGlobal.find(x => x.num === num);
  if (!m) {
    window.__zbBatchRunning = false;
    return;
  }

  log(`manual change video requested for track #${m.num}`);
  const opcoes = await buscarResultados(m);

  if (opcoes.length === 0) {
    window.__zbBatchRunning = false;
    mostrarToast('no results found');
    return;
  }

  const escolhido = await mostrarModalZarbig(m, opcoes);
  if (escolhido && escolhido.id) {
    aplicarLinkYt(m, escolhido, document.getElementById('chkYtMusic').checked);
    log(`[ok] [youtube] faixa #${m.num} link encontrado (manual): ${m.ytUrl}`);
    render();
    mostrarToast(`track #${m.num} updated!`);
  }

  window.__zbBatchRunning = false;
}

// Execução em lote: admin usa a api oficial, público usa r.jina.ai
async function buscarLinksYoutube() {
  if (window.__zbBatchRunning) { mostrarToast('already running'); return; }
  window.__zbBatchRunning = true;

  const selecionadas = musicasGlobal.filter(m => m.selecionada && !m.jaTenho);
  if (!selecionadas.length) {
    window.__zbBatchRunning = false;
    return mostrarToast("select at least 1 track!");
  }

  const btn = document.getElementById('btnYt');
  const progWrap = document.getElementById('progWrap');
  const progBar = document.getElementById('progBar');
  const status = document.getElementById('status');
  const usarYtMusic = document.getElementById('chkYtMusic').checked;
  const cfg = getAdminCfg();
  const delayMs = isAdmin ? cfg.delayMs : Math.max(cfg.delayMs, 1000);

  const viaApi = usandoApiOficial();
  log(`[info] busca em lote via ${viaApi ? 'youtube api' : 'jina'} (${selecionadas.length} faixas, delay ${delayMs}ms)`);
  if (!viaApi) log('[info] r.jina.ai: limite ~20 req/min no free tier.');

  btn.disabled = true;
  progWrap.style.display = 'block';
  progBar.style.width = '0%';
  progBar.setAttribute('aria-valuenow', '0');

  let concluidas = 0;
  const total = selecionadas.length;
  descartesFiltro = 0;

  for (let m of selecionadas) {
    status.innerText = `processing (${concluidas}/${total}): ${m.titulo}`;
    m.erroYt = false;

    try {
      let escolhido = null;

      if (isAdmin && !cfg.autoPick) {
        const opcoes = await buscarResultados(m);
        if (opcoes.length > 0) escolhido = await mostrarModalZarbig(m, opcoes);
      } else {
        escolhido = await acharVideoAutomatico(m);
      }

      if (escolhido && escolhido.id) {
        aplicarLinkYt(m, escolhido, usarYtMusic);
        log(`[ok] [youtube] faixa #${m.num} link encontrado: ${m.ytUrl}`);
      } else if (!(isAdmin && !cfg.autoPick)) {
        m.erroYt = true;
      }
    } catch(e) {
      m.erroYt = true;
      log(`erro fatal faixa #${m.num}: ${e.message}`);
    }

    concluidas++;
    progBar.style.width = `${(concluidas / total) * 100}%`;
    progBar.setAttribute('aria-valuenow', String(Math.round((concluidas / total) * 100)));
    render();
    await sleep(delayMs);
  }

  status.innerText = "search complete!";
  progWrap.style.display = 'none';
  btn.disabled = false;
  salvarLinkCache();
  mostrarToast("links generated!");
  if (descartesFiltro > 0) mostrarToast(`${descartesFiltro} videos discarded by title filter`);
  window.__zbBatchRunning = false;
}

async function tentarUnica(num, tipo) {
  const m = musicasGlobal.find(x => x.num === num);
  if (!m) return;
  
  if (tipo === 'yt') {
    log(`=== re-tentando link faixa #${m.num} ===`);
    const res = await acharVideoAutomatico(m);
    if (res && res.id) { 
      aplicarLinkYt(m, res, document.getElementById('chkYtMusic').checked);
      log(`[ok] [youtube] faixa #${m.num} link encontrado no retry: ${m.ytUrl}`);
    } else {
      m.erroYt = true;
    }
    render();
  }
}

async function copiarForEach() {
  if (window.__zbBatchRunning) { mostrarToast('already running'); return; }
  window.__zbBatchRunning = true;

  const btn = document.getElementById("btnForEach");
  const faixas = musicasGlobal.filter(m => m.selecionada && m.ytUrl);

  if (faixas.length === 0) {
    window.__zbBatchRunning = false;
    mostrarToast("no track with generated link!");
    return;
  }

  btn.disabled = true;
  let i = 0;

  function proximo() {
    if (i >= faixas.length) {
      btn.disabled = false;
      window.__zbBatchRunning = false;
      mostrarToast("all links copied sequentially!");
      return;
    }
    const m = faixas[i];
    const url = m.ytUrl;
    Promise.resolve(window.copyText(url, `copied (${i + 1}/${faixas.length}): ${m.titulo}`)).then(() => {
      i++;
      setTimeout(proximo, 3000);
    });
  }

  proximo();
}

function copiarApenasLinks() {
  const urls = musicasGlobal
    .filter(m => m.selecionada)
    .map(m => m.ytUrl)
    .filter(url => url); 

  if (!urls.length) return mostrarToast("no links generated for selected tracks!");
  window.copyText(urls.join('\n'), "links copied!");
}

function baixarTxt() {
  const linhas = musicasGlobal.filter(m => m.selecionada).map(m => {
    let texto = `${m.num}. ${m.titulo} - ${m.artista}`;
    if (m.ytUrl) texto += `\n   📺 link: ${m.ytUrl}`;
    return texto;
  }).join('\n\n');
  
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([linhas], { type: 'text/plain;charset=utf-8' }));
  a.download = `${window.sanitizeFileName(nomePlaylist).replace(/\s+/g, '_')}_extracao.txt`;
  a.click();
  mostrarToast(".txt downloaded!");
}

// ==========================================
// PLAYLIST TOOLS (public)
// ==========================================
function updateToolsVisibility() {
  const toolsCard = document.getElementById('toolsCard');
  if (!toolsCard) return;

  const antes = toolsCard.style.display;
  const agora = musicasGlobal.length ? 'block' : 'none';
  toolsCard.style.display = agora;

  // the tools card sets the controls column height, so the panel cap follows it
  if (antes !== agora) agendarSyncResultsCap();
}

// Marca apenas as faixas que falharam.
function selecionarFalhas() {
  const falhas = musicasGlobal.filter(m => m.erroYt && !m.jaTenho);
  if (!falhas.length) return mostrarToast('no failed tracks found!');

  musicasGlobal.forEach(m => { m.selecionada = false; });
  falhas.forEach(m => { m.selecionada = true; });

  render();
  mostrarToast(`checked ${falhas.length} failed tracks!`);
}

// Inverte a seleção das faixas visíveis (respeitando o filtro de busca).
function inverterSelecao() {
  const q = document.getElementById('busca').value.toLowerCase();
  let alteradas = 0;

  musicasGlobal.forEach(m => {
    if (m.jaTenho) return;
    if (q && !m.titulo.toLowerCase().includes(q) && !m.artista.toLowerCase().includes(q)) return;
    m.selecionada = !m.selecionada;
    alteradas++;
  });

  render();
  mostrarToast(`inverted ${alteradas} tracks`);
}

// Re-tenta somente as faixas marcadas com erro.
async function retentarFalhas() {
  if (window.__zbBatchRunning) { mostrarToast('already running'); return; }
  window.__zbBatchRunning = true;

  const falhas = musicasGlobal.filter(m => m.erroYt);
  if (!falhas.length) {
    window.__zbBatchRunning = false;
    return mostrarToast('no failed tracks to retry!');
  }

  const progWrap = document.getElementById('progWrap');
  const progBar = document.getElementById('progBar');
  const status = document.getElementById('status');
  const usarYtMusic = document.getElementById('chkYtMusic').checked;
  const cfg = getAdminCfg();
  const delayMs = isAdmin ? cfg.delayMs : Math.max(cfg.delayMs, 1000);

  progWrap.style.display = 'block';
  progBar.style.width = '0%';
  progBar.setAttribute('aria-valuenow', '0');

  let feitas = 0;
  descartesFiltro = 0;

  for (const m of falhas) {
    status.innerText = `retrying (${feitas}/${falhas.length}): ${m.titulo}`;

    try {
      const res = await acharVideoAutomatico(m);
      if (res && res.id) {
        aplicarLinkYt(m, res, usarYtMusic);
        log(`[ok] [retry] faixa #${m.num} link encontrado: ${m.ytUrl}`);
      }
    } catch (e) {
      log(`[err] retry faixa #${m.num}: ${e.message}`);
    }

    feitas++;
    progBar.style.width = `${(feitas / falhas.length) * 100}%`;
    progBar.setAttribute('aria-valuenow', String(Math.round((feitas / falhas.length) * 100)));
    render();
    await sleep(delayMs);
  }

  progWrap.style.display = 'none';
  const restantes = musicasGlobal.filter(m => m.erroYt).length;
  status.innerText = `retry complete (${falhas.length - restantes} ok, ${restantes} failed)`;
  salvarLinkCache();
  mostrarToast(`retried ${falhas.length} tracks`);
  if (descartesFiltro > 0) mostrarToast(`${descartesFiltro} videos discarded by title filter`);
  window.__zbBatchRunning = false;
}

// Limpa todos os links gerados (com confirmação).
async function resetarLinks() {
  if (!musicasGlobal.length) return mostrarToast('no playlist loaded!');

  const confirmado = await window.showCustomModal({
    title: 'reset links',
    message: `clear all generated links for "${nomePlaylist}"?`
  });

  if (!confirmado) return;

  musicasGlobal.forEach(m => {
    m.ytUrl = null;
    m.ytTitle = null;
    m.ytChannel = null;
    m.ytArt = false;
    m.artistaOk = true;
    m.erroYt = false;
    // reset also forgets the cached picks, otherwise the next run would just
    // hand back the same links without searching again
    delete linksCache[chaveLinkYt(m)];
  });

  salvarLinkCache();
  render();
  log('[info] all generated links reset (cache entries dropped).');
  mostrarToast('all links reset!');
}

// Wipes every link saved in localStorage (the whole browser cache), not only the
// links of the playlist that happens to be open.
async function limparCacheLinks() {
  const confirmado = await window.showCustomModal({
    title: 'clear saved links',
    message: 'delete every youtube link saved in this browser?'
  });

  if (!confirmado) return;

  linksCache = {};
  // salvarLinkCache() cancels the pending debounce and rewrites the key (with its
  // try/catch), so the storage ends up empty instead of holding stale entries
  salvarLinkCache();
  mostrarToast('saved links cleared!');
}

// Normaliza nomes de arquivos/títulos para comparar sem acento, extensão ou pontuação.
function normalizarNome(valor) {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nomePresente(nomes, alvo) {
  if (!alvo) return false;
  if (nomes.includes(alvo)) return true;
  if (alvo.length < 8) return false;
  return nomes.some(n => n.includes(alvo));
}

function escanearPasta() {
  const input = document.getElementById('scanFolderInput');
  if (input) input.click();
}

function onPastaSelecionada(event) {
  const files = event.target.files;
  if (!files || !files.length) return;

  const nomes = [];
  for (let i = 0; i < files.length; i++) {
    nomes.push(files[i].name.replace(/\.[^/.]+$/, ''));
  }

  const textarea = document.getElementById('exclusionInput');
  if (textarea) textarea.value = nomes.join('\n');

  log(`[info] pasta escaneada: ${nomes.length} arquivos locais.`);
  mostrarToast(`scanned ${nomes.length} local files`);

  event.target.value = '';
}

// Marca (sem apagar nada) as faixas que já existem na biblioteca local.
function aplicarFiltroExclusao() {
  if (!musicasGlobal.length) return mostrarToast('no playlist loaded!');

  const textarea = document.getElementById('exclusionInput');
  const bruto = textarea ? textarea.value : '';
  if (!bruto.trim()) return mostrarToast('paste file names or scan a folder first!');

  const nomes = bruto.split(/\r?\n/).map(normalizarNome).filter(Boolean);
  if (!nomes.length) return mostrarToast('no valid names found!');

  let marcadas = 0;

  musicasGlobal.forEach(m => {
    const titulo = normalizarNome(m.titulo);
    const completo = normalizarNome(`${m.artista} ${m.titulo}`);
    const jaTem = nomePresente(nomes, titulo) || nomePresente(nomes, completo);

    m.jaTenho = jaTem;
    if (jaTem) {
      m.selecionada = false;
      marcadas++;
    }
  });

  render();
  log(`[info] filtro "já tenho": ${marcadas} faixas marcadas como owned.`);
  mostrarToast(marcadas ? `marked ${marcadas} tracks as owned` : 'no owned tracks matched');
}

// Exporta a seleção como "artista - titulo | url".
function copiarListaFormatada() {
  const faixas = musicasGlobal.filter(m => m.selecionada && m.ytUrl);
  if (!faixas.length) return mostrarToast('no generated links for selected tracks!');

  const texto = faixas.map(m => `${m.artista} - ${m.titulo} | ${m.ytUrl}`).join('\n');
  window.copyText(texto, 'formatted list copied!');
}

function baixarCsv() {
  const faixas = musicasGlobal.filter(m => m.selecionada);
  if (!faixas.length) return mostrarToast('select at least 1 track!');

  const escapar = (valor) => `"${String(valor == null ? '' : valor).replace(/"/g, '""')}"`;
  const linhas = ['num,titulo,artista,yt_url,yt_title,yt_channel'];

  faixas.forEach(m => {
    linhas.push([m.num, m.titulo, m.artista, m.ytUrl || '', m.ytTitle || '', m.ytChannel || ''].map(escapar).join(','));
  });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `${window.sanitizeFileName(nomePlaylist).replace(/\s+/g, '_')}_extracao.csv`;
  a.click();
  mostrarToast('.csv downloaded!');
}

