// ==========================================
// LOCAL AGENT DOWNLOAD (zarbig-yt-agent)
// ==========================================
// Loaded before extractor.js: the page keeps its globals (musicasGlobal,
// getAdminCfg) and this file owns everything the download flow needs. The agent
// runs on the visitor machine and saves the audio to disk, so the browser never
// touches youtube, no cors, no blob juggling.
const ZB_AGENT_BASE = 'http://127.0.0.1:8787';
const ZB_AGENT_TIMEOUT_MS = 8000;
const ZB_DL_POLL_MS = 1000;
const ZB_STORAGE = {
  token: 'zb_agent_token',
  folder: 'zb_dl_folder',
  notice: 'zb_dl_notice_seen'
};

let zbAgentOnline = false;
let zbDownloading = false;
let zbPollTimer = null;
let zbCurrentJob = null;

// ==========================================
// PLATFORM + STORAGE
// ==========================================
// The agent listens on the visitor own machine: phones and safari (no private
// network access to 127.0.0.1 from a public page) cannot use it.
function plataformaSuportada() {
  const ua = navigator.userAgent || '';
  const mobile = /android|iphone|ipad|ipod/i.test(ua)
    || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|edg|firefox|opr/i.test(ua);
  return !mobile && !safari;
}

function tokenAgente() {
  try {
    return (localStorage.getItem(ZB_STORAGE.token) || '').trim();
  } catch (e) {
    return '';
  }
}

function salvarTokenAgente(valor) {
  try {
    localStorage.setItem(ZB_STORAGE.token, String(valor || '').trim());
  } catch (e) {
    // storage blocked: the token just does not survive a reload
  }
}

function limparTokenAgente() {
  try {
    localStorage.removeItem(ZB_STORAGE.token);
  } catch (e) {
    // nothing to clear
  }
}

function pastaDownload() {
  try {
    return (localStorage.getItem(ZB_STORAGE.folder) || '').trim();
  } catch (e) {
    return '';
  }
}

function salvarPastaDownload(caminho) {
  try {
    localStorage.setItem(ZB_STORAGE.folder, String(caminho || '').trim());
  } catch (e) {
    // storage blocked: the folder is asked again next time
  }
  renderFolderInfo();
}

function pastaAvisada() {
  try {
    return localStorage.getItem(ZB_STORAGE.notice) === '1';
  } catch (e) {
    return false;
  }
}

function marcarAvisoVisto() {
  try {
    localStorage.setItem(ZB_STORAGE.notice, '1');
  } catch (e) {
    // storage blocked: the notice simply shows again
  }
}

// ==========================================
// AGENT CARD COLLAPSE
// ==========================================
// The card is setup only: the header keeps the status, the arrow opens the body.
// First visit (no token yet) opens by itself, after that the choice is remembered.
const ZB_AGENT_OPEN_KEY = 'zb_agent_open';

function agenteAbertoNoDom() {
  const body = document.getElementById('agentBody');
  return !!(body && !body.hidden);
}

function setAgenteAberto(aberto, persistir = true) {
  const body = document.getElementById('agentBody');
  const btn = document.getElementById('btnAgentToggle');

  if (body) body.hidden = !aberto;

  if (btn) {
    btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    btn.setAttribute('aria-label', aberto ? 'collapse local agent' : 'expand local agent');
    const icon = btn.querySelector('i');
    if (icon) icon.className = aberto ? 'ph ph-caret-up' : 'ph ph-caret-down';
  }

  if (persistir) {
    try {
      localStorage.setItem(ZB_AGENT_OPEN_KEY, aberto ? '1' : '0');
    } catch (e) {
      // storage blocked: the card just starts collapsed next time
    }
  }
}

function toggleAgentBody() {
  setAgenteAberto(!agenteAbertoNoDom());
}

// ==========================================
// AGENT CLIENT
// ==========================================
async function chamarAgente(path, options = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenAgente();
  if (token) headers['X-Token'] = token;
  if (options.body) headers['Content-Type'] = 'application/json';

  const resposta = await window.fetchWithTimeout(
    ZB_AGENT_BASE + path,
    {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    },
    ZB_AGENT_TIMEOUT_MS
  );

  if (resposta.status === 401) {
    limparTokenAgente();
    const input = document.getElementById('agentTokenInput');
    if (input) input.value = '';
    throw new Error('invalid token');
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.error || `agent http ${resposta.status}`);
  return dados;
}

async function checarAgente() {
  if (!plataformaSuportada()) {
    zbAgentOnline = false;
    renderAgentStatus();
    return false;
  }

  try {
    const info = await chamarAgente('/health');
    zbAgentOnline = !!(info && info.ok);
    if (info && info.folder && !pastaDownload()) salvarPastaDownload(info.folder);
  } catch (e) {
    zbAgentOnline = false;
  }

  renderAgentStatus();
  return zbAgentOnline;
}

function renderAgentStatus() {
  const suportado = plataformaSuportada();
  const status = document.getElementById('agentStatus');
  const help = document.getElementById('agentHelp');
  const card = document.getElementById('agentCard');
  const btnDl = document.getElementById('btnDl');
  const btnFolder = document.getElementById('btnDlFolder');
  const btnPaste = document.getElementById('btnPasteToken');
  const btnConnect = document.getElementById('btnConnectAgent');

  if (status) {
    status.textContent = !suportado ? 'desktop only' : (zbAgentOnline ? 'online' : 'offline');
    status.classList.toggle('is-online', suportado && zbAgentOnline);
  }

  if (card) card.classList.toggle('is-unsupported', !suportado);

  if (help) {
    if (!suportado) {
      help.textContent = 'desktop only: the agent runs on your computer, so mobile and safari are not supported.';
    } else if (!zbAgentOnline) {
      help.textContent = 'agent offline. run start.bat once, then paste the token below.';
    } else if (!tokenAgente()) {
      help.textContent = 'agent running. paste the token printed by start.bat to connect.';
    } else {
      help.textContent = 'agent connected. audio only, saved by the local agent.';
    }
  }

  const travar = !suportado || (!zbAgentOnline && !zbDownloading);
  if (btnDl) btnDl.disabled = travar;
  if (btnFolder) btnFolder.disabled = !suportado || !zbAgentOnline;
  if (btnPaste) btnPaste.disabled = !suportado;
  if (btnConnect) btnConnect.disabled = !suportado;
}

function renderFolderInfo() {
  const alvo = document.getElementById('dlFolderInfo');
  if (!alvo) return;
  const pasta = pastaDownload();
  alvo.textContent = pasta
    ? `audio files are saved in ${pasta}.`
    : 'pick a download folder before the first run.';
}

function definirStatusDownload(texto) {
  const alvo = document.getElementById('status');
  if (alvo) alvo.innerText = texto;
}

// ==========================================
// SMALL MODAL (text input + checkbox)
// ==========================================
// showCustomModal only does password prompts and confirm dialogs, so the folder
// flow gets its own panel with the same markup and focus rules.
function zbModal({ title, message, input = false, placeholder = '', checkbox = '', confirmLabel = 'confirm', cancelLabel = 'cancel' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'zbModalTitle');

    overlay.innerHTML = `
      <div class="custom-modal-card">
        <h3 class="section-title" id="zbModalTitle" style="margin-bottom: 10px;">${window.escapeHtml(title)}</h3>
        <div class="custom-modal-msg">${window.escapeHtml(message)}</div>
        ${input ? `<input type="text" id="zbModalInput" class="custom-modal-input" autocomplete="off" spellcheck="false" placeholder="${window.escapeHtml(placeholder)}">` : ''}
        ${checkbox ? `<label class="dl-notice-check"><input type="checkbox" id="zbModalCheck"> ${window.escapeHtml(checkbox)}</label>` : ''}
        <div class="custom-modal-actions">
          <button id="zbModalCancel" class="btn-modal-cancel">${window.escapeHtml(cancelLabel)}</button>
          <button id="zbModalConfirm" class="btn-primary">${window.escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const opener = document.activeElement;
    const background = [document.querySelector('main'), document.querySelector('.app-header')].filter(Boolean);
    background.forEach(el => el.setAttribute('inert', ''));

    const ler = (confirmado) => ({
      confirmed: confirmado,
      value: input ? overlay.querySelector('#zbModalInput').value.trim() : '',
      checked: checkbox ? overlay.querySelector('#zbModalCheck').checked : false
    });

    const close = (valor) => {
      document.removeEventListener('keydown', onKeydown);
      background.forEach(el => el.removeAttribute('inert'));
      overlay.remove();
      if (opener && typeof opener.focus === 'function') opener.focus();
      resolve(valor);
    };

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close(ler(false));
    };
    document.addEventListener('keydown', onKeydown);

    const card = overlay.querySelector('.custom-modal-card');
    const campo = overlay.querySelector('#zbModalInput');
    if (campo) {
      campo.focus();
      campo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          close(ler(true));
        }
      });
    } else {
      card.tabIndex = -1;
      card.focus();
    }

    overlay.querySelector('#zbModalConfirm').addEventListener('click', () => close(ler(true)));
    overlay.querySelector('#zbModalCancel').addEventListener('click', () => close(ler(false)));
  });
}

// ==========================================
// TOKEN
// ==========================================
async function colarTokenAgente() {
  if (!plataformaSuportada()) {
    window.mostrarToast('desktop only');
    return;
  }

  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('no clipboard');
    const texto = (await navigator.clipboard.readText() || '').trim();
    if (!texto) {
      window.mostrarToast('clipboard is empty');
      return;
    }

    salvarTokenAgente(texto);
    const campo = document.getElementById('agentTokenInput');
    if (campo) campo.value = texto;
    window.mostrarToast('token pasted');
    await conectarAgente();
  } catch (e) {
    window.mostrarToast('paste failed, type the token instead');
    const campo = document.getElementById('agentTokenInput');
    if (campo) campo.focus();
  }
}

async function conectarAgente() {
  if (!plataformaSuportada()) {
    window.mostrarToast('desktop only');
    return;
  }

  const campo = document.getElementById('agentTokenInput');
  if (campo) salvarTokenAgente(campo.value);

  try {
    await chamarAgente('/status');
    zbAgentOnline = true;
    renderAgentStatus();
    window.mostrarToast('agent connected!');
  } catch (e) {
    zbAgentOnline = false;
    renderAgentStatus();
    window.mostrarToast(e.message === 'invalid token' ? 'invalid token' : 'agent offline');
  }
}

// ==========================================
// FOLDER
// ==========================================
async function escolherPastaDownload() {
  if (!plataformaSuportada()) {
    window.mostrarToast('desktop only');
    return '';
  }

  try {
    const dados = await chamarAgente('/folder/pick', { method: 'POST', body: {} });
    if (dados && dados.folder) {
      salvarPastaDownload(dados.folder);
      window.mostrarToast('folder saved');
      return dados.folder;
    }
    throw new Error('no folder');
  } catch (e) {
    // tkinter missing or agent offline: fall back to a typed absolute path
    const resposta = await zbModal({
      title: 'download folder',
      message: 'absolute path for the downloads. example: C:\\Users\\you\\Downloads\\zarbig',
      input: true,
      placeholder: 'C:\\Users\\...',
      confirmLabel: 'save',
      cancelLabel: 'cancel'
    });
    if (!resposta.confirmed || !resposta.value) return '';
    salvarPastaDownload(resposta.value);
    window.mostrarToast('folder saved');
    return resposta.value;
  }
}

// First run: warn about the default folder, offer to change, allow silence.
async function garantirPastaDownload() {
  let pasta = pastaDownload();

  if (!pasta) {
    try {
      const info = await chamarAgente('/health');
      if (info && info.folder) {
        pasta = info.folder;
        salvarPastaDownload(pasta);
      }
    } catch (e) {
      pasta = '';
    }
  }

  if (!pasta) return escolherPastaDownload();
  if (pastaAvisada()) return pasta;

  const resposta = await zbModal({
    title: 'download folder',
    message: `the agent saves the audio files in ${pasta}. change it now?`,
    checkbox: "don't ask again",
    confirmLabel: 'continue',
    cancelLabel: 'change folder'
  });
  if (resposta.checked) marcarAvisoVisto();

  if (resposta.confirmed) return pastaDownload() || pasta;

  await escolherPastaDownload();
  return pastaDownload();
}

// ==========================================
// DOWNLOAD
// ==========================================
// Selected tracks that already have a link; owned ones are already in the
// library and stay out of the batch.
function tracksParaDownload() {
  return musicasGlobal.filter(m => m.selecionada && m.ytUrl && !m.jaTenho);
}

// A run walks the whole selection: the batch size is only the chunk sent to the
// agent per request, the next chunk starts as soon as one finishes.
let zbDl = { fila: [], lote: 0, lotes: 0, feitos: 0, alvo: 0, loteAlvo: 0, tamanho: 50 };

async function iniciarDownload() {
  if (!plataformaSuportada()) {
    window.mostrarToast('desktop only');
    return;
  }

  if (zbDownloading) {
    await cancelarDownload();
    return;
  }

  const fila = tracksParaDownload();
  if (!fila.length) {
    window.mostrarToast('no selected tracks with links!');
    return;
  }

  if (!tokenAgente()) {
    window.mostrarToast('paste the agent token first');
    const campo = document.getElementById('agentTokenInput');
    if (campo) campo.focus();
    return;
  }

  const pasta = await garantirPastaDownload();
  if (!pasta) return;

  const cfg = getAdminCfg();
  const tamanho = Math.max(1, Number(cfg.dlBatchSize) || 50);

  zbDl = {
    fila: fila.slice(),
    lote: 0,
    lotes: Math.ceil(fila.length / tamanho),
    feitos: 0,
    alvo: fila.length,
    loteAlvo: 0,
    tamanho: tamanho
  };

  zbDownloading = true;
  zbAgentOnline = true;
  renderAgentStatus();
  zbProgressoMostrar('download', 'downloading audio', `batch 0/${zbDl.lotes} · 0/${zbDl.alvo}`);

  executarLoteDownload();
}

async function executarLoteDownload() {
  if (!zbDownloading) return;

  const cfg = getAdminCfg();
  const fatia = zbDl.fila.splice(0, zbDl.tamanho);

  if (!fatia.length) {
    terminarDownload('download finished', zbDl.feitos, zbDl.alvo);
    return;
  }

  zbDl.lote += 1;
  zbDl.loteAlvo = fatia.length;

  fatia.forEach(m => {
    m.dl = { state: 'queued', ext: null, file: null, error: null };
    atualizarBadgeDl(m);
  });

  let dados;
  try {
    dados = await chamarAgente('/download', {
      method: 'POST',
      body: {
        folder: pastaDownload(),
        items: fatia.map(m => ({
          num: m.num,
          url: m.ytUrl,
          artist: m.artista,
          title: m.titulo
        })),
        cfg: {
          timeout: cfg.dlTimeoutS,
          useCookies: cfg.useCookies,
          cookieBrowser: cfg.cookieBrowser
        }
      }
    });
  } catch (e) {
    terminarDownload(`download failed: ${e.message}`);
    return;
  }

  zbCurrentJob = dados.jobId;
  atualizarBarraDownload(zbDl.feitos, zbDl.alvo, true,
    `batch ${zbDl.lote}/${zbDl.lotes} · ${zbDl.feitos}/${zbDl.alvo}`);
  definirStatusDownload(`batch ${zbDl.lote}/${zbDl.lotes}: 0/${Number(dados.total) || fatia.length}`);
  acompanharDownload(dados.jobId);
}

async function acompanharDownload(jobId) {
  clearTimeout(zbPollTimer);
  zbPollTimer = null;

  let dados;
  try {
    dados = await chamarAgente('/status');
  } catch (e) {
    terminarDownload(`agent error: ${e.message}`);
    return;
  }

  aplicarStatusItens(dados.items || []);

  const done = Number(dados.done) || 0;
  const total = Number(dados.total) || zbDl.loteAlvo;
  const atual = (dados.items || []).find(item => item.state === 'downloading');
  const feitos = zbDl.feitos + done;

  atualizarBarraDownload(feitos, zbDl.alvo, true,
    `batch ${zbDl.lote}/${zbDl.lotes} · ${feitos}/${zbDl.alvo}${atual && atual.title ? ` · ${atual.title}` : ''}`);
  definirStatusDownload(dados.state === 'running'
    ? `batch ${zbDl.lote}/${zbDl.lotes}: ${done}/${total}`
    : `batch ${dados.state}`);

  if (dados.state === 'running') {
    zbPollTimer = setTimeout(() => acompanharDownload(jobId), ZB_DL_POLL_MS);
    return;
  }

  zbDl.feitos += done;

  // the selection keeps going: the next chunk starts as soon as this one ends
  if (zbDownloading && zbDl.fila.length) {
    executarLoteDownload();
    return;
  }

  const falhas = (dados.items || []).filter(item => item.state === 'error').length;
  terminarDownload(falhas
    ? `download finished with ${falhas} error(s)`
    : 'download finished', zbDl.feitos, zbDl.alvo);
}

function aplicarStatusItens(items) {
  items.forEach(item => {
    const m = musicasGlobal.find(t => t.num === item.num);
    if (!m) return;

    const estadoAnterior = m.dl ? m.dl.state : null;
    m.dl = {
      state: item.state || 'queued',
      ext: item.ext || null,
      file: item.file || null,
      error: item.error || null
    };

    // only state transitions repaint the row: polling runs once per second
    if (estadoAnterior !== m.dl.state) atualizarBadgeDl(m);
  });
}

function terminarDownload(mensagem, done, total) {
  zbDownloading = false;
  zbCurrentJob = null;
  clearTimeout(zbPollTimer);
  zbPollTimer = null;
  zbDl.fila = [];

  atualizarBarraDownload(total || done || 0, total || done || 0, false);
  definirStatusDownload(total ? `download ${done}/${total}` : '');
  renderAgentStatus();
  window.mostrarToast(mensagem);
}

async function cancelarDownload() {
  zbDl.fila = [];
  try {
    await chamarAgente('/cancel', { method: 'POST', body: {} });
    window.mostrarToast('cancelling...');
  } catch (e) {
    window.mostrarToast(`cancel failed: ${e.message}`);
  }
}

// ==========================================
// AUTO DOWNLOAD (admin) + DELETE ON RETRY
// ==========================================
let zbAutoFila = [];
let zbAutoRodando = false;

// Admin only, opt-in: every resolved link goes straight to the agent. The queue
// keeps one job at a time, the agent refuses a second one with 409.
window.zbAutoBaixar = function (m) {
  if (!m || !m.ytUrl) return;
  if (typeof isAdmin === 'undefined' || !isAdmin) return;
  if (!getAdminCfg().autoDownload) return;
  if (!plataformaSuportada() || !tokenAgente() || !pastaDownload()) return;

  zbAutoFila.push(m);
  processarFilaAuto();
};

async function processarFilaAuto() {
  if (zbAutoRodando) return;
  zbAutoRodando = true;

  try {
    while (zbAutoFila.length) {
      const m = zbAutoFila.shift();
      if (!m.ytUrl) continue;

      const cfg = getAdminCfg();
      try {
        await chamarAgente('/download', {
          method: 'POST',
          body: {
            folder: pastaDownload(),
            items: [{ num: m.num, url: m.ytUrl, artist: m.artista, title: m.titulo }],
            cfg: { timeout: cfg.dlTimeoutS, useCookies: cfg.useCookies, cookieBrowser: cfg.cookieBrowser }
          }
        });
      } catch (e) {
        // 409 (job running) or offline: the row badge already tells the story
        continue;
      }

      m.dl = { state: 'queued', ext: null, file: null, error: null };
      atualizarBadgeDl(m);
      await esperarJobAuto();
    }
  } finally {
    zbAutoRodando = false;
  }
}

async function esperarJobAuto() {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 1500));

    let dados;
    try {
      dados = await chamarAgente('/status');
    } catch (e) {
      return;
    }

    aplicarStatusItens(dados.items || []);
    if (dados.state !== 'running') return;
  }
}

// Retry only: removes the file the agent saved for the old link.
window.zbApagarBaixado = async function (m) {
  const arquivo = m && m.dl && m.dl.file;
  if (!arquivo) return false;

  try {
    await chamarAgente('/delete', { method: 'POST', body: { folder: pastaDownload(), file: arquivo } });
    m.dl = null;
    atualizarBadgeDl(m);
    return true;
  } catch (e) {
    return false;
  }
};

// ==========================================
// UI
// ==========================================
function atualizarBarraDownload(done, total, mostrar, info) {
  if (!mostrar) {
    zbProgressoEsconder('download');
    return;
  }

  const pct = total > 0 ? (done / total) * 100 : 0;
  zbProgressoAtualizar('download', pct, info || `${done}/${total}`);
}

// Badge html lives here so render() (extractor.js) only calls one hook.
window.zbDlBadgeHtml = function (m) {
  const dl = m && m.dl;
  if (!dl) return '';

  const id = `dl-badge-${m.num}`;

  if (dl.state === 'error') {
    const erro = window.escapeHtml(dl.error || 'download failed');
    return `<span id="${id}" class="dl-badge err" role="img" aria-label="download failed" title="${erro}"><i class="ph ph-x" aria-hidden="true"></i></span>`;
  }

  if (dl.state === 'done') {
    const ext = (dl.ext || 'audio').toLowerCase();
    const opus = ext === 'opus';
    const dica = opus ? 'saved as opus' : `source had no opus, saved as ${window.escapeHtml(ext)}`;
    return `<span id="${id}" class="dl-badge ${opus ? 'ok' : 'warn'}" title="${dica}">${window.escapeHtml(ext)}</span>`;
  }

  if (dl.state === 'skipped') {
    return `<span id="${id}" class="dl-badge ok" title="already in folder">saved</span>`;
  }

  if (dl.state === 'downloading') {
    return `<span id="${id}" class="dl-badge is-downloading" title="downloading">dl...</span>`;
  }

  return `<span id="${id}" class="dl-badge" title="queued">dl</span>`;
};

// Patch one row instead of a full render: the list can hold 200 rows.
function atualizarBadgeDl(m) {
  const linha = document.getElementById(`track-${m.num}`);
  if (!linha) return;
  const container = linha.querySelector('.badges-container');
  if (!container) return;

  const html = window.zbDlBadgeHtml(m);
  const atual = document.getElementById(`dl-badge-${m.num}`);

  if (atual) {
    if (html) atual.outerHTML = html;
    else atual.remove();
    return;
  }

  if (html) container.insertAdjacentHTML('afterbegin', html);
}

// ==========================================
// INIT (called by extractor.js on DOMContentLoaded)
// ==========================================
window.zbInitDownloadAgent = function () {
  const campo = document.getElementById('agentTokenInput');
  if (campo) campo.value = tokenAgente();

  let estadoAgente = null;
  try {
    estadoAgente = localStorage.getItem(ZB_AGENT_OPEN_KEY);
  } catch (e) {
    estadoAgente = null;
  }
  setAgenteAberto(estadoAgente === '1' || (estadoAgente === null && !tokenAgente()), false);

  renderFolderInfo();
  renderAgentStatus();
  checarAgente();

  // the agent can be started/stopped while the page is open
  window.addEventListener('focus', () => checarAgente());
};





