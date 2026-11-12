const YOUTUBE_API_KEY = 'AIzaSyBN02HbxDwq9KuCjaJa4cqtFV9gvIe_xDk'; // default youtube data api key (public search uses jina)
const ADMIN_HASH = 'f1c1592588411002af340cbaedd6fc33';
const JINA_SEARCH_BASE = 'https://r.jina.ai/https://www.youtube.com/results?search_query=';
const STORAGE_KEYS = { ytKey: 'zb_yt_key', adminCfg: 'zb_admin_cfg' };
const DEFAULT_SUFFIXES = ['official audio', 'official video'];
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
    autoPick: autoInput ? autoInput.checked : true
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

function setAdminUI(state) {
  isAdmin = state;

  const adminCard = document.getElementById('adminCard');
  const btnAdminToggle = document.getElementById('btnAdminToggle');

  if (adminCard) adminCard.style.display = state ? 'block' : 'none';
  if (btnAdminToggle) {
    btnAdminToggle.innerHTML = state
      ? '<i class="ph ph-lock-open"></i> exit admin mode'
      : '<i class="ph ph-lock"></i> admin mode';
  }

  // the floating gradient picker follows admin mode (helper lives in main.js)
  if (window.setAdminBgWidget) window.setAdminBgWidget(state);
}

window.toggleAdminMode = async function () {
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

  const pass = await window.showCustomModal({
    title: 'admin access',
    message: 'enter admin password to proceed:',
    isPrompt: true,
    placeholder: 'password...'
  });

  if (pass === null) return;

  if (md5(pass.trim()) === ADMIN_HASH) {
    setAdminUI(true);
    preencherYtKey();
    preencherAdminCfg();
    mostrarToast('login successful');
    if (musicasGlobal.length) render();
  } else {
    mostrarToast('invalid password');
  }
};

// Inicializa melhorias na UI dinamicamente se necessário
document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url');
  if (urlInput && !document.getElementById('btnClearUrl')) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = 'btnClearUrl';
    clearBtn.className = 'btn-url-clear';
    clearBtn.title = 'clear url';
    clearBtn.setAttribute('aria-label', 'clear url');
    clearBtn.innerHTML = '<i class="ph ph-x"></i>';
    clearBtn.onclick = limparUrlSpotify;

    // Wraps the url input so the small clear button sits beside the field.
    const row = document.createElement('div');
    row.className = 'url-row';
    urlInput.parentNode.insertBefore(row, urlInput);
    row.appendChild(urlInput);
    row.appendChild(clearBtn);
  }

  preencherYtKey();

  const scanInput = document.getElementById('scanFolderInput');
  if (scanInput) scanInput.addEventListener('change', onPastaSelecionada);
});

function limparUrlSpotify() {
  const urlInput = document.getElementById('url');
  if (urlInput) urlInput.value = '';
  mostrarToast('spotify url cleared');
}

function limparLog() { document.getElementById('debugLog').value = ''; }
function copiarLog() { navigator.clipboard.writeText(document.getElementById('debugLog').value).then(() => mostrarToast("log copied!")); }
function salvarChaves() {
  localStorage.setItem('sp_cid', document.getElementById('cid').value.trim());
  localStorage.setItem('sp_csec', document.getElementById('csec').value.trim());
}
function toggleBox(id) {
  const b = document.getElementById(id);
  if(b) b.style.display = b.style.display === 'block' ? 'none' : 'block';
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
    erroYt: false 
  };
}

async function semApi(id) {
  const target = `https://open.spotify.com/embed/playlist/${id}`;
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
        document.getElementById('resCard').style.display = 'block';
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
    document.getElementById('resCard').style.display = 'block';
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

  navigator.clipboard.writeText(links.join('\n')).then(() => {
    mostrarToast(`link #${m.num} copied!`);
  });
}

function render() {
  document.getElementById('pTitle').innerText = nomePlaylist.toLowerCase();
  const q = document.getElementById('busca').value.toLowerCase();
  const filtradas = musicasGlobal.filter(m =>
    m.titulo.toLowerCase().includes(q) || m.artista.toLowerCase().includes(q)
  );

  document.getElementById('lista').innerHTML = filtradas.map(m => {
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
          <span style="color: #fff;">video:</span> ${m.ytTitle} | <span style="color: #fff;">channel:</span> ${m.ytChannel}
        </div>
      `;
    }

    let changeVideoBtn = '';
    if (isAdmin && m.ytUrl) {
      changeVideoBtn = `<button class="copy-btn" onclick="alterarVideoManual(${m.num}, event)" title="change video"><i class="ph ph-pencil-simple"></i></button>`;
    }

    const ownedBadge = m.jaTenho ? `<span class="owned-badge">owned</span>` : '';

    return `
      <li class="track-item ${m.selecionada ? 'selected' : ''} ${m.jaTenho ? 'owned' : ''}" onclick="toggleItem(${m.num}, event)">
        <input type="checkbox" ${m.selecionada ? 'checked' : ''} ${m.jaTenho ? 'disabled' : ''} onclick="event.stopPropagation(); toggleItem(${m.num})">
        <span class="num">${m.num}</span>
        <div class="info" style="flex-grow: 1; overflow: hidden;">
          <div class="title">${m.titulo}</div>
          <div class="artist">${m.artista}</div>
          ${ytDetailsHtml}
        </div>
        <div class="badges-container" style="display: flex; align-items: center; gap: 6px;">
          ${ownedBadge}
          ${badgeYt}
          ${changeVideoBtn}
          ${m.ytUrl ? `<button class="copy-btn" onclick="copiarLinkUnico(${m.num}, event)" title="copy link"><i class="ph ph-copy"></i></button>` : ''}
        </div>
      </li>
    `;
  }).join('');

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
  const termos = cfg.suffixes.map(s => `${base} ${s}`.trim()).filter(Boolean);

  // empty suffix list = search without suffix
  return termos.length > 0 ? [...new Set(termos)] : [base];
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

    const trecho = raw.slice(match.index, match.index + 400);
    const canal = trecho.match(channelRegex);

    vistos.add(id);
    resultados.push({
      id: id,
      title: limparTextoSpotify(match[1]).trim(),
      channelTitle: canal ? limparTextoSpotify(canal[1]).trim() : 'youtube',
      thumbnail: `https://i.ytimg.com/vi/${id}/default.jpg`
    });
  }

  return resultados;
}

async function buscarResultadosApi(m) {
  const cfg = getAdminCfg();
  const key = getYtKey();

  if (!key) throw new Error('youtube api key not configured');

  for (const termo of montarTermosBusca(m)) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${cfg.maxResults}&q=${encodeURIComponent(termo)}&key=${key}`;
    log(`[info] [youtube api] buscando opções para: "${termo}"`);

    const res = await fetchRapido(url, {}, 15000);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `http error ${res.status}`);
    }

    const data = await res.json();
    const resultados = (data.items || []).map(item => ({
      id: item.id.videoId,
      title: (item.snippet.title || '').toLowerCase(),
      channelTitle: (item.snippet.channelTitle || '').toLowerCase(),
      thumbnail: item.snippet.thumbnails?.default?.url || ''
    })).filter(opt => opt.id);

    if (resultados.length > 0) return resultados;
    log(`[warn] [youtube api] sem resultados para "${termo}"; tentando o próximo sufixo...`);
  }

  return [];
}

async function buscarResultadosJina(m) {
  const cfg = getAdminCfg();

  for (const termo of montarTermosBusca(m)) {
    const target = `${JINA_SEARCH_BASE}${encodeURIComponent(termo)}`;
    log(`[info] [jina] buscando resultados para: "${termo}"`);

    let resultados = [];

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        // r.jina.ai may answer with a 401 warning header and still return the scraped
        // page, so success is measured by parsed results instead of res.ok.
        const res = await fetchRapido(target, { referrerPolicy: 'no-referrer' }, 20000);
        const txt = await res.text();
        resultados = parseResultadosJina(txt);
        if (resultados.length > 0) break;
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

    let optionsHtml = opcoes.map((opt, index) => `
      <div style="background: #0a0a0a; border: 1px solid var(--border-color); padding: 8px; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px;" data-id="${opt.id}" class="zarbig-opt-item">
        <img src="${opt.thumbnail}" alt="thumb" style="width: 60px; height: 45px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" />
        <div style="flex-grow: 1; overflow: hidden;">
          <div style="color: #fff; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: lowercase;">${index + 1}. ${opt.title}</div>
          <div style="color: var(--text-muted); font-size: 0.7rem; text-transform: lowercase;">channel: ${opt.channelTitle}</div>
        </div>
        <button class="btn-sec" style="width: auto; margin:0; padding: 4px 8px; font-size: 0.7rem; text-transform: lowercase;">select</button>
      </div>
    `).join('');

    overlay.innerHTML = `
      <div class="custom-modal-card" style="max-width: 500px; width: 90%;">
        <h3 class="section-title" style="margin-bottom: 6px; color: #b026ff; text-transform: lowercase;">zarbig mode</h3>
        <div class="custom-modal-msg" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px; text-transform: lowercase;">select the correct video for: <br><strong style="color: #fff;">${m.titulo} - ${m.artista}</strong></div>
        <div style="max-height: 350px; overflow-y: auto; margin-bottom: 14px; padding-right: 4px;">
          ${optionsHtml || '<div style="color:var(--text-muted); text-align:center; text-transform: lowercase;">no results found</div>'}
        </div>
        <div class="custom-modal-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="modalBtnCancel" class="btn-modal-cancel" style="text-transform: lowercase;">cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.zarbig-opt-item').forEach(el => {
      el.addEventListener('click', () => {
        const selectedId = el.getAttribute('data-id');
        const selectedOpt = opcoes.find(o => o.id === selectedId);
        overlay.remove();
        resolve(selectedOpt || null);
      });
    });

    overlay.querySelector('#modalBtnCancel').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
  });
}

// Botão de alteração manual (gatilho exclusivo do admin / Zarbig Mode)
async function alterarVideoManual(num, ev) {
  if (ev) ev.stopPropagation();
  if (!isAdmin) {
    mostrarToast('admin mode required to change videos');
    return;
  }

  const m = musicasGlobal.find(x => x.num === num);
  if (!m) return;

  log(`manual change video requested for track #${m.num}`);
  const opcoes = await buscarResultados(m);

  if (opcoes.length === 0) {
    mostrarToast('no results found');
    return;
  }

  const escolhido = await mostrarModalZarbig(m, opcoes);
  if (escolhido && escolhido.id) {
    const usarYtMusic = document.getElementById('chkYtMusic').checked;
    const prefixo = usarYtMusic ? "music.youtube.com" : "www.youtube.com";
    m.ytUrl = `https://${prefixo}/watch?v=${escolhido.id}`;
    m.ytTitle = escolhido.title;
    m.ytChannel = escolhido.channelTitle;
    m.erroYt = false;
    log(`[ok] [youtube] faixa #${m.num} link encontrado (manual): ${m.ytUrl}`);
    render();
    mostrarToast(`track #${m.num} updated!`);
  }
}

// Execução em lote: admin usa a api oficial, público usa r.jina.ai
async function buscarLinksYoutube() {
  const selecionadas = musicasGlobal.filter(m => m.selecionada && !m.jaTenho);
  if (!selecionadas.length) return mostrarToast("select at least 1 track!");

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

  let concluidas = 0;
  const total = selecionadas.length;

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
        const prefixo = usarYtMusic ? "music.youtube.com" : "www.youtube.com";
        m.ytUrl = `https://${prefixo}/watch?v=${escolhido.id}`;
        m.ytTitle = escolhido.title;
        m.ytChannel = escolhido.channelTitle;
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
    render();
    await sleep(delayMs);
  }

  status.innerText = "search complete!";
  progWrap.style.display = 'none';
  btn.disabled = false;
  mostrarToast("links generated!");
}

async function tentarUnica(num, tipo) {
  const m = musicasGlobal.find(x => x.num === num);
  if (!m) return;
  
  if (tipo === 'yt') {
    log(`=== re-tentando link faixa #${m.num} ===`);
    const res = await acharVideoAutomatico(m);
    if (res && res.id) { 
      const prefixo = document.getElementById('chkYtMusic').checked ? "music.youtube.com" : "www.youtube.com";
      m.ytUrl = `https://${prefixo}/watch?v=${res.id}`; 
      m.ytTitle = res.title;
      m.ytChannel = res.channelTitle;
      m.erroYt = false;
      log(`[ok] [youtube] faixa #${m.num} link encontrado no retry: ${m.ytUrl}`);
    } else {
      m.erroYt = true;
    }
    render();
  }
}

async function copiarForEach() {
  const btn = document.getElementById("btnForEach");
  const faixas = musicasGlobal.filter(m => m.selecionada && m.ytUrl);

  if (faixas.length === 0) {
    mostrarToast("no track with generated link!");
    return;
  }

  btn.disabled = true;
  let i = 0;

  function proximo() {
    if (i >= faixas.length) {
      btn.disabled = false;
      mostrarToast("all links copied sequentially!");
      return;
    }
    const m = faixas[i];
    const url = m.ytUrl;
    navigator.clipboard.writeText(url).then(() => {
      mostrarToast(`copied (${i + 1}/${faixas.length}): ${m.titulo}`);
      i++;
      setTimeout(proximo, 3000);
    }).catch(() => {
      mostrarToast("failed to copy, check permissions.");
      btn.disabled = false;
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
  navigator.clipboard.writeText(urls.join(',\n')).then(() => mostrarToast("links copied!"));
}

function baixarTxt() {
  const linhas = musicasGlobal.filter(m => m.selecionada).map(m => {
    let texto = `${m.num}. ${m.titulo} - ${m.artista}`;
    if (m.ytUrl) texto += `\n   📺 link: ${m.ytUrl}`;
    return texto;
  }).join('\n\n');
  
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([linhas], { type: 'text/plain;charset=utf-8' }));
  a.download = `${nomePlaylist.replace(/\s+/g, '_')}_extracao.txt`;
  a.click();
  mostrarToast(".txt downloaded!");
}

// ==========================================
// PLAYLIST TOOLS (public)
// ==========================================
function updateToolsVisibility() {
  const toolsCard = document.getElementById('toolsCard');
  if (!toolsCard) return;
  toolsCard.style.display = musicasGlobal.length ? 'block' : 'none';
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
  const falhas = musicasGlobal.filter(m => m.erroYt);
  if (!falhas.length) return mostrarToast('no failed tracks to retry!');

  const progWrap = document.getElementById('progWrap');
  const progBar = document.getElementById('progBar');
  const status = document.getElementById('status');
  const usarYtMusic = document.getElementById('chkYtMusic').checked;
  const cfg = getAdminCfg();
  const delayMs = isAdmin ? cfg.delayMs : Math.max(cfg.delayMs, 1000);

  progWrap.style.display = 'block';
  progBar.style.width = '0%';

  let feitas = 0;

  for (const m of falhas) {
    status.innerText = `retrying (${feitas}/${falhas.length}): ${m.titulo}`;

    try {
      const res = await acharVideoAutomatico(m);
      if (res && res.id) {
        const prefixo = usarYtMusic ? "music.youtube.com" : "www.youtube.com";
        m.ytUrl = `https://${prefixo}/watch?v=${res.id}`;
        m.ytTitle = res.title;
        m.ytChannel = res.channelTitle;
        m.erroYt = false;
        log(`[ok] [retry] faixa #${m.num} link encontrado: ${m.ytUrl}`);
      }
    } catch (e) {
      log(`[err] retry faixa #${m.num}: ${e.message}`);
    }

    feitas++;
    progBar.style.width = `${(feitas / falhas.length) * 100}%`;
    render();
    await sleep(delayMs);
  }

  progWrap.style.display = 'none';
  const restantes = musicasGlobal.filter(m => m.erroYt).length;
  status.innerText = `retry complete (${falhas.length - restantes} ok, ${restantes} failed)`;
  mostrarToast(`retried ${falhas.length} tracks`);
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
    m.erroYt = false;
  });

  render();
  log('[info] all generated links reset.');
  mostrarToast('all links reset!');
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
  navigator.clipboard.writeText(texto).then(() => mostrarToast('formatted list copied!'));
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
  a.download = `${nomePlaylist.replace(/\s+/g, '_')}_extracao.csv`;
  a.click();
  mostrarToast('.csv downloaded!');
}

