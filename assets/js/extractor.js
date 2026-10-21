// ==========================================
// VARIÁVEIS E CONFIGURAÇÕES GLOBAIS
// ==========================================
let musicasGlobal = [];
let nomePlaylist = "playlist";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(msg) {
  const box = document.getElementById('debugLog');
  if (!box) return;
  box.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  box.scrollTop = box.scrollHeight;
}

window.onerror = (msg, src, l) => log(`ERRO GLOBAL (L:${l}): ${msg}`);

// Inicialização: Roda apenas quando a tela carrega
document.addEventListener("DOMContentLoaded", () => {
  const cid = document.getElementById('cid');
  const csec = document.getElementById('csec');
  
  if (cid && csec) {
    cid.value = localStorage.getItem('sp_cid') || '';
    csec.value = localStorage.getItem('sp_csec') || '';
    log("App iniciado (Hospedado). Motor Piped c/ YT Music preparado.");
  }
});

// ==========================================
// FUNÇÕES DE INTERFACE (Chamadas pelo HTML)
// ==========================================
function limparLog() { document.getElementById('debugLog').value = ''; }
function copiarLog() { navigator.clipboard.writeText(document.getElementById('debugLog').value).then(() => alert("Log copiado!")); }
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
    throw new Error(e.name === 'AbortError' ? `Timeout (${timeout}ms)` : e.message);
  }
}

// ==========================================
// ETAPA 1: SPOTIFY PARSING
// ==========================================
async function extrair() {
  const url = document.getElementById('url').value.trim();
  const status = document.getElementById('status');
  const id = getId(url);
  if (!id) return status.innerText = "❌ Link inválido.";

  status.innerText = "⏳ Extraindo playlist...";
  try {
    await semApi(id); 
  } catch (e) {
    log("Erro extração: " + e.message);
    status.innerText = "❌ " + e.message;
  }
}

function limparTextoSpotify(str) {
  return str.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/^E\s+/, '').trim();
}

function extrairDados(raw) {
  if (raw.includes("### ") && raw.includes("#### ")) {
    const tm = raw.match(/Title:\s*(.+)/i);
    if (tm) nomePlaylist = tm[1].trim();
    const rx = /(?:^\d+\.\s*)?###\s+([^\n\r]+)[\s\r\n]+####\s+([^\n\r]+)/gm;
    const faixas = [];
    let m;
    while ((m = rx.exec(raw)) !== null) {
      faixas.push(criarObjetoMusica(faixas.length + 1, m[1], m[2]));
    }
    if (faixas.length > 0) return faixas;
  }
  const m1 = raw.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (m1) {
    const entity = JSON.parse(m1[1])?.props?.pageProps?.state?.data?.entity;
    if (entity?.trackList) {
      nomePlaylist = entity.name || "Playlist";
      return entity.trackList.map((t, i) => criarObjetoMusica(i + 1, t.title, t.subtitle));
    }
  }
  return null;
}

function criarObjetoMusica(num, tit, art) {
  return {
    num: num,
    titulo: limparTextoSpotify(tit),
    artista: limparTextoSpotify(art),
    selecionada: true,
    ytUrl: null,
    erroYt: false,
    dlUrl: null,    
    erroDl: false   
  };
}

async function semApi(id) {
  const target = `https://open.spotify.com/embed/playlist/${id}`;
  const proxies = [
    { nome: "Jina", url: `https://r.jina.ai/${target}` },
    { nome: "AllOrigins", url: `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`, json: true }
  ];
  for (const p of proxies) {
    try {
      log(`Buscando playlist via [${p.nome}]...`);
      const r = await fetchRapido(p.url, { referrerPolicy: "no-referrer" });
      if (!r.ok) continue;
      const txt = p.json ? (await r.json()).contents : await r.text();
      const lista = extrairDados(txt || "");
      if (lista?.length) {
        musicasGlobal = lista;
        render();
        document.getElementById('status').innerText = `✅ ${lista.length} músicas carregadas!`;
        return;
      }
    } catch (err) { log(`Falha playlist [${p.nome}]: ${err.message}`); }
  }
  throw new Error("Use o Modo Manual acima para colar os dados.");
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
    document.getElementById('status').innerText = `✅ ${lista.length} músicas carregadas!`;
  } else alert("Nenhuma música encontrada no texto.");
}

function atualizarContador() {
  const sel = musicasGlobal.filter(m => m.selecionada).length;
  const comYt = musicasGlobal.filter(m => m.selecionada && m.ytUrl).length;
  const comDl = musicasGlobal.filter(m => m.selecionada && m.dlUrl).length;
  document.getElementById('selCount').innerText = `${sel} marcadas (Link: ${comYt} | DL: ${comDl})`;
}

function toggleItem(num, ev) {
  if (ev && (ev.target.tagName === 'A' || ev.target.dataset?.retry)) return;
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

function render() {
  document.getElementById('pTitle').innerText = nomePlaylist;
  const q = document.getElementById('busca').value.toLowerCase();
  const filtradas = musicasGlobal.filter(m =>
    m.titulo.toLowerCase().includes(q) || m.artista.toLowerCase().includes(q)
  );

  document.getElementById('lista').innerHTML = filtradas.map(m => {
    let badgeYt = `<span class="yt-badge" id="badge-yt-${m.num}">S/ Link</span>`;
    if (m.ytUrl) {
      const isYTM = m.ytUrl.includes("music.youtube");
      badgeYt = `<a class="yt-badge ok" href="${m.ytUrl}" target="_blank">▶ ${isYTM ? 'YTM' : 'YT'}</a>`;
    }
    else if (m.erroYt) badgeYt = `<span class="yt-badge err" data-retry="1" onclick="tentarUnica(${m.num}, 'yt')">🔄 Buscar</span>`;

    let badgeDl = '';
    if (m.dlUrl) {
      badgeDl = `<a class="yt-badge dl-ok" href="${m.dlUrl}" target="_blank">⬇️ M4A</a>`;
    } else if (m.erroDl) {
      badgeDl = `<span class="yt-badge dl-err" data-retry="1" onclick="tentarUnica(${m.num}, 'dl')">🔄 Áudio</span>`;
    } else if (m.ytUrl) {
      badgeDl = `<span class="yt-badge" id="badge-dl-${m.num}">Pendente</span>`;
    }

    return `
      <li class="track-item ${m.selecionada ? 'selected' : ''}" onclick="toggleItem(${m.num}, event)">
        <input type="checkbox" ${m.selecionada ? 'checked' : ''} onclick="event.stopPropagation(); toggleItem(${m.num})" />
        <span class="num">${m.num}</span>
        <div class="info">
          <div class="title">${m.titulo}</div>
          <div class="artist">${m.artista}</div>
        </div>
        <div class="badges-container">
          ${badgeYt}
          ${badgeDl}
        </div>
      </li>
    `;
  }).join('');

  atualizarContador();
  document.getElementById('resCard').style.display = 'block';
}

// ==========================================
// ETAPA 2: YOUTUBE BUSCA
// ==========================================
function extrairVideoIdDeTexto(txt) {
  const regexes = [ /watch\?v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/, /\/vi\/([a-zA-Z0-9_-]{11})\//, /\/embed\/([a-zA-Z0-9_-]{11})/ ];
  for (const rx of regexes) { const m = txt.match(rx); if (m && m[1]) return m[1]; }
  return null;
}

async function acharVideoIdYoutube(m) {
  const tituloLimpo = m.titulo.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
  const primeiroArtista = m.artista.split(',')[0].trim();
  const queries = [`${m.titulo} ${m.artista} official audio`, `${tituloLimpo} ${primeiroArtista} topic`];

  for (let qIdx = 0; qIdx < queries.length; qIdx++) {
    const termo = queries[qIdx];
    const q = encodeURIComponent(termo);
    log(`🔎 [${m.num}] Buscando ID | Query: "${termo}"`);

    const fontes = [
      { nome: "Jina-YT", url: `https://r.jina.ai/https://www.youtube.com/results?search_query=${q}` },
      { nome: "Piped-Kavin", url: `https://pipedapi.kavin.rocks/search?q=${q}&filter=music_songs` },
      { nome: "Invidious-Nadeko", url: `https://inv.nadeko.net/api/v1/search?q=${q}&type=video` }
    ];

    for (const f of fontes) {
      const t0 = Date.now();
      try {
        const r = await fetchRapido(f.url, { referrerPolicy: "no-referrer" }, 8000);
        const ms = Date.now() - t0;

        if (!r.ok) {
          if (r.status === 429) { log(`  ⏸️ Rate-limit 429 [${f.nome}], aguardando...`); await sleep(1500); }
          continue;
        }

        const txt = await r.text();
        const vid = extrairVideoIdDeTexto(txt);

        if (vid) {
          log(`  ✅ [${f.nome}] Achou ID=${vid} (${ms}ms)`);
          return { id: vid, fonte: f.nome };
        }
      } catch (e) {
         log(`  ❌ [${f.nome}] Falhou em ${Date.now() - t0}ms: ${e.message}`);
      }
    }
  }
  return null;
}

async function buscarLinksYoutube() {
  const selecionadas = musicasGlobal.filter(m => m.selecionada);
  if (!selecionadas.length) return alert("Selecione pelo menos 1 música!");

  const btn = document.getElementById('btnYt');
  const progWrap = document.getElementById('progWrap');
  const progBar = document.getElementById('progBar');
  const status = document.getElementById('status');
  
  const usarYtMusic = document.getElementById('chkYtMusic').checked;
  const prefixoDominio = usarYtMusic ? "music.youtube.com" : "www.youtube.com";

  btn.disabled = true;
  progWrap.style.display = 'block';
  progBar.style.width = '0%';

  log(`=== INICIANDO BUSCA DE LINKS (${selecionadas.length} faixas) ===`);
  let concluidas = 0;

  for (const m of selecionadas) {
    if (m.ytUrl) { concluidas++; continue; }

    const badge = document.getElementById(`badge-yt-${m.num}`);
    if (badge) badge.innerText = "⏳...";
    status.innerText = `🔍 (${concluidas + 1}/${selecionadas.length}): ${m.titulo}`;

    const res = await acharVideoIdYoutube(m);
    if (res) {
      m.ytUrl = `https://${prefixoDominio}/watch?v=${res.id}`;
      m.erroYt = false;
    } else {
      m.erroYt = true;
      log(`🚨 FALHA TOTAL ao buscar ID para [${m.num}]`);
    }

    concluidas++;
    progBar.style.width = `${Math.round((concluidas / selecionadas.length) * 100)}%`;
    render();
    await sleep(500); 
  }

  btn.disabled = false;
  status.innerText = `✅ Busca de links finalizada!`;
  log(`=== FIM DA BUSCA DE LINKS ===`);
}

// ==========================================
// ETAPA 3: AUDIO EXTRACTION VIA PIPED
// ==========================================
async function obterLinkAudioDireto(m) {
  const match = m.ytUrl.match(/v=([a-zA-Z0-9_-]{11})/);
  if (!match) return null;
  const videoId = match[1];

  const instancias = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.syncpundit.io",
    "https://api.piped.privacydev.net"
  ];

  for (let i = 0; i < instancias.length; i++) {
    const base = instancias[i];
    const apiUrl = `${base}/streams/${videoId}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
    
    log(`🎛️ [${m.num}] Lendo Piped via Proxy (${base})...`);
    const t0 = Date.now();
    
    try {
      const r = await fetchRapido(proxyUrl, { method: "GET" }, 120000); 
      const ms = Date.now() - t0;

      if (!r.ok) {
        log(`  ⚠️ Proxy falhou HTTP ${r.status} (${ms}ms)`);
        continue; 
      }

      const originData = await r.json();
      if (!originData.contents) {
        log(`  ⚠️ Proxy retornou vazio (${ms}ms)`);
        continue;
      }

      const json = JSON.parse(originData.contents);

      if (json.audioStreams && json.audioStreams.length > 0) {
        const streams = json.audioStreams.sort((a, b) => b.bitrate - a.bitrate);
        const melhorAudio = streams.find(s => s.format === "M4A") || streams[0];
        
        if (melhorAudio && melhorAudio.url) {
          log(`  ✅ Áudio ${melhorAudio.format} capturado! (${Math.round(melhorAudio.bitrate/1000)}kbps | ${ms}ms)`);
          return melhorAudio.url;
        }
      }
      log(`  ❌ Instância não retornou blocos de áudio.`);
    } catch(e) {
      const ms = Date.now() - t0;
      log(`  🚨 Falha técnica em ${base} (${ms}ms): ${e.message}`);
    }
  }
  return null;
}

async function buscarDownloadsAudio() {
  const faixasValidas = musicasGlobal.filter(m => m.selecionada && m.ytUrl);
  if (!faixasValidas.length) return alert("Nenhuma faixa selecionada possui link gerado! Gere os links primeiro.");

  const btn = document.getElementById('btnDl');
  const progWrap = document.getElementById('progWrapDl');
  const progBar = document.getElementById('progBarDl');
  const status = document.getElementById('status');

  btn.disabled = true;
  progWrap.style.display = 'block';
  progBar.style.width = '0%';

  log(`=== INICIANDO EXTRAÇÃO DE ÁUDIO DIRETO (${faixasValidas.length} faixas) ===`);
  let concluidas = 0;

  for (const m of faixasValidas) {
    if (m.dlUrl) { concluidas++; continue; }

    const badge = document.getElementById(`badge-dl-${m.num}`);
    if (badge) badge.innerText = "⏳...";
    status.innerText = `🎛️ Localizando Áudio Direto (${concluidas + 1}/${faixasValidas.length}): ${m.titulo}`;

    const dlResult = await obterLinkAudioDireto(m);
    if (dlResult) {
      m.dlUrl = dlResult;
      m.erroDl = false;
    } else {
      m.erroDl = true;
      log(`🚨 FALHA TOTAL ao extrair Áudio Direto de [${m.num}]`);
    }

    concluidas++;
    progBar.style.width = `${Math.round((concluidas / faixasValidas.length) * 100)}%`;
    render();
    await sleep(500); 
  }

  btn.disabled = false;
  status.innerText = `✅ Busca de links de Áudio finalizada!`;
  log(`=== FIM DA EXTRAÇÃO ===`);
}

async function tentarUnica(num, tipo) {
  const m = musicasGlobal.find(x => x.num === num);
  if (!m) return;
  
  if (tipo === 'yt') {
    log(`=== Re-tentando Link faixa #${m.num} ===`);
    const res = await acharVideoIdYoutube(m);
    if (res) { 
      const prefixo = document.getElementById('chkYtMusic').checked ? "music.youtube.com" : "www.youtube.com";
      m.ytUrl = `https://${prefixo}/watch?v=${res.id}`; 
      m.erroYt = false; 
    }
    else { m.erroYt = true; }
  } 
  else if (tipo === 'dl') {
    if (!m.ytUrl) return alert("Extraia o Link primeiro!");
    log(`=== Re-tentando Áudio faixa #${m.num} ===`);
    const dlRes = await obterLinkAudioDireto(m);
    if (dlRes) { m.dlUrl = dlRes; m.erroDl = false; }
    else { m.erroDl = true; }
  }
  render();
}

function copiarApenasLinks(apenasAudio = false) {
  const urls = musicasGlobal
    .filter(m => m.selecionada)
    .map(m => apenasAudio ? m.dlUrl : m.ytUrl)
    .filter(url => url); 

  if (!urls.length) return alert("Nenhum link gerado para as músicas selecionadas!");
  navigator.clipboard.writeText(urls.join('\n')).then(() => alert("Links copiados!"));
}

function baixarTxt() {
  const linhas = musicasGlobal.filter(m => m.selecionada).map(m => {
    let texto = `${m.num}. ${m.titulo} - ${m.artista}`;
    if (m.ytUrl) texto += `\n   📺 Link: ${m.ytUrl}`;
    if (m.dlUrl) texto += `\n   🎛️ DL: ${m.dlUrl}`;
    return texto;
  }).join('\n\n');
  
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([linhas], { type: 'text/plain;charset=utf-8' }));
  a.download = `${nomePlaylist.replace(/\s+/g, '_')}_extracao.txt`;
  a.click();
}
