const YOUTUBE_API_KEY = 'AIzaSyBN02HbxDwq9KuCjaJa4cqtFV9gvIe_xDk'; // cole sua youtube data api key aqui

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
let cancelaProcessamento = false;

// Inicializa melhorias na UI dinamicamente se necessário
document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url');
  if (urlInput && !document.getElementById('btnClearUrl')) {
    const clearBtn = document.createElement('button');
    clearBtn.id = 'btnClearUrl';
    clearBtn.className = 'btn-sec';
    clearBtn.innerText = 'clear';
    clearBtn.style.marginLeft = '8px';
    clearBtn.style.padding = '8px 12px';
    clearBtn.style.textTransform = 'lowercase';
    clearBtn.onclick = limparUrlSpotify;
    urlInput.parentNode.insertBefore(clearBtn, urlInput.nextSibling);
  }
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

async function fetchRapido(url, opcoes = {}, timeout = 9000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opcoes, signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw new Error(e.name === 'AbortError' ? `timeout (${timeout}ms)` : e.message);
  }
}

async function extrair() {
  const url = document.getElementById('url').value.trim();
  const status = document.getElementById('status');
  const id = getId(url);
  if (!id) return status.innerText = "invalid link.";

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
  if (item) item.selecionada = !item.selecionada;
  render();
}

function selecionarTodas(estado) {
  const q = document.getElementById('busca').value.toLowerCase();
  musicasGlobal.forEach(m => {
    if (!q || m.titulo.toLowerCase().includes(q) || m.artista.toLowerCase().includes(q)) {
      m.selecionada = estado;
    }
  });
  render();
}

function mostrarToast(mensagem) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = mensagem.toLowerCase();
  toast.classList.add("show");
  
  if(window.toastTimer) clearTimeout(window.toastTimer);
  
  window.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
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
    if (m.ytUrl) {
      changeVideoBtn = `<button class="copy-btn" onclick="alterarVideoManual(${m.num}, event)" title="change video"><i class="ph ph-pencil-simple"></i></button>`;
    }

    return `
      <li class="track-item ${m.selecionada ? 'selected' : ''}" onclick="toggleItem(${m.num}, event)">
        <input type="checkbox" ${m.selecionada ? 'checked' : ''} onclick="event.stopPropagation(); toggleItem(${m.num})">
        <span class="num">${m.num}</span>
        <div class="info" style="flex-grow: 1; overflow: hidden;">
          <div class="title">${m.titulo}</div>
          <div class="artist">${m.artista}</div>
          ${ytDetailsHtml}
        </div>
        <div class="badges-container" style="display: flex; align-items: center; gap: 6px;">
          ${badgeYt}
          ${changeVideoBtn}
          ${m.ytUrl ? `<button class="copy-btn" onclick="copiarLinkUnico(${m.num}, event)" title="copy link"><i class="ph ph-copy"></i></button>` : ''}
        </div>
      </li>
    `;
  }).join('');

  atualizarContador();
}

// YouTube Data API v3 Search (retorna até 15 resultados)
async function buscarResultadosZarbig(m) {
  const termo = `${m.titulo} ${m.artista}`;
  log(`🔎 [youtube api] buscando opções para: "${termo}"`);

  if (!YOUTUBE_API_KEY) {
    log(`⚠️ [youtube api] chave da api do youtube não configurada!`);
    mostrarToast("configure your youtube api key in extractor.js");
    return [];
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(termo)}&key=${YOUTUBE_API_KEY}`;
    const res = await fetchRapido(url, {}, 15000);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `http error ${res.status}`);
    }

    const data = await res.json();
    const results = (data.items || []).map(item => ({
      id: item.id.videoId,
      title: (item.snippet.title || '').toLowerCase(),
      channelTitle: (item.snippet.channelTitle || '').toLowerCase(),
      thumbnail: item.snippet.thumbnails?.default?.url || ''
    }));

    return results;
  } catch (err) {
    log(`⚠️ erro youtube api: ${err.message}`);
    mostrarToast(`youtube api error: ${err.message}`);
    return [];
  }
}

// Busca automática em segundo plano: pega o 1º resultado silenciosamente sem abrir modals
async function acharVideoAutomatico(m) {
  const opcoes = await buscarResultadosZarbig(m);
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

// Botão de alteração manual (gatilho exclusivo do modal Zarbig Mode)
async function alterarVideoManual(num, ev) {
  if (ev) ev.stopPropagation();
  const m = musicasGlobal.find(x => x.num === num);
  if (!m) return;

  log(`manual change video requested for track #${m.num}`);
  const opcoes = await buscarResultadosZarbig(m);
  if (opcoes.length > 0) {
    const escolhido = await mostrarModalZarbig(m, opcoes);
    if (escolhido && escolhido.id) {
      const usarYtMusic = document.getElementById('chkYtMusic').checked;
      const prefixo = usarYtMusic ? "music.youtube.com" : "www.youtube.com";
      m.ytUrl = `https://${prefixo}/watch?v=${escolhido.id}`;
      m.ytTitle = escolhido.title;
      m.ytChannel = escolhido.channelTitle;
      m.erroYt = false;
      render();
      mostrarToast(`track #${m.num} updated!`);
    }
  }
}

// Execução em lote: busca silenciosa automática (pega o 1º resultado)
async function buscarLinksYoutube() {
  const selecionadas = musicasGlobal.filter(m => m.selecionada);
  if (!selecionadas.length) return mostrarToast("select at least 1 track!");

  const btn = document.getElementById('btnYt');
  const progWrap = document.getElementById('progWrap');
  const progBar = document.getElementById('progBar');
  const status = document.getElementById('status');
  const usarYtMusic = document.getElementById('chkYtMusic').checked;

  cancelaProcessamento = false;
  btn.disabled = true;
  progWrap.style.display = 'block';
  progBar.style.width = '0%';

  let concluidas = 0;
  const total = selecionadas.length;

  for (let m of selecionadas) {
    status.innerText = `processing (${concluidas}/${total}): ${m.titulo}`;
    m.erroYt = false;

    try {
      const res = await acharVideoAutomatico(m);
      if (res && res.id) {
        const prefixo = usarYtMusic ? "music.youtube.com" : "www.youtube.com";
        m.ytUrl = `https://${prefixo}/watch?v=${res.id}`;
        m.ytTitle = res.title;
        m.ytChannel = res.channelTitle;
      } else {
        m.erroYt = true;
      }
    } catch(e) {
      m.erroYt = true;
      log(`erro fatal faixa #${m.num}: ${e.message}`);
    }

    concluidas++;
    progBar.style.width = `${(concluidas / total) * 100}%`;
    render();
    await sleep(400);
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
    } else {
      m.erroYt = true;
    }
    render();
  }
}

async function copiarForEach() {
  const btn = document.getElementById("btnForEach");
  const faixas = musicasGlobal.filter(m => m.selecionada && (m.ytUrl || m.dlUrl));

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
    const url = m.ytUrl || m.dlUrl;
    navigator.clipboard.writeText(url).then(() => {
      mostrarToast(`copied (${i + 1}/${faixas.length}): ${m.titulo}`);
      i++;
      setTimeout(proximo, 1000);
    }).catch(() => {
      mostrarToast("failed to copy, check permissions.");
      btn.disabled = false;
    });
  }

  proximo();
}

function copiarApenasLinks(apenasAudio = false) {
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
