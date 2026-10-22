import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// CONFIGURAÇÃO DO SUPABASE
// ==========================================
const SUPABASE_URL = 'https://exjpfmmaaienrxrgbgqf.supabase.co/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4anBmbW1hYWllbnJ4cmdiZ3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODM5NjIsImV4cCI6MjEwODI1OTk2Mn0.N3jdBZobPWBETNsx8uHZYfQIZsKn5gqov3K-JhSzuuc';
const BUCKET_NAME = 'dj-sets';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Elementos da DOM
const fileInput = document.getElementById('fileInput');
const setNameInput = document.getElementById('setNameInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const dropzoneLabel = document.getElementById('dropzoneLabel');
const btnUpload = document.getElementById('btnUpload');
const btnDeleteAll = document.getElementById('btnDeleteAll');
const statusDiv = document.getElementById('status');
const listaSets = document.getElementById('listaSets');

let arquivosAtuais = [];

// ==========================================
// SISTEMA DE TOAST
// ==========================================
function mostrarToast(mensagem) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = mensagem;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// INTERAÇÃO DO INPUT DE ARQUIVO
// ==========================================
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    fileNameDisplay.innerText = `🎵 ${file.name}`;
    dropzoneLabel.classList.add('has-file');
    
    // Se o usuário ainda não digitou um nome, sugere o nome do arquivo (sem extensão)
    if (!setNameInput.value.trim()) {
      const nomeSemExt = file.name.replace(/\.[^/.]+$/, "");
      setNameInput.value = nomeSemExt;
    }
  } else {
    resetarDropzone();
  }
});

function resetarDropzone() {
  fileInput.value = '';
  setNameInput.value = '';
  fileNameDisplay.innerText = 'Clique para selecionar o arquivo de áudio';
  dropzoneLabel.classList.remove('has-file');
}

// ==========================================
// 1. FAZER UPLOAD COM NOME CUSTOMIZADO
// ==========================================
btnUpload.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    mostrarToast('⚠️ Selecione um arquivo de áudio primeiro!');
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const rawCustomName = setNameInput.value.trim() || file.name.replace(/\.[^/.]+$/, "");

  // Limpa caracteres especiais e usa "--" para separar o ID único do nome amigável
  const safeName = rawCustomName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-zA-Z0-9 _-]/g, '')                  // Remove símbolos inválidos na URL
    .trim()
    .replace(/\s+/g, '_');                            // Espaços viram underline

  const finalFileName = `${Date.now()}--${safeName || 'set'}.${ext}`;

  btnUpload.disabled = true;
  statusDiv.innerText = `⏳ Enviando "${rawCustomName}"... Aguarde.`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(finalFileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    statusDiv.innerText = `❌ Erro no upload: ${error.message}`;
    mostrarToast('❌ Falha ao enviar arquivo');
    btnUpload.disabled = false;
    return;
  }

  statusDiv.innerText = '';
  mostrarToast('✅ Set enviado com sucesso!');
  resetarDropzone();
  btnUpload.disabled = false;
  carregarSets();
});

// ==========================================
// 2. LISTAR SETS DISPONÍVEIS
// ==========================================
async function carregarSets() {
  listaSets.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">⏳</span>
      <p>Buscando seus sets na nuvem...</p>
    </div>
  `;

  const { data: files, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list('', {
      sortBy: { column: 'created_at', order: 'desc' }
    });

  if (error) {
    listaSets.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        <p>Erro ao carregar lista</p>
        <span>${error.message}</span>
      </div>
    `;
    return;
  }

  arquivosAtuais = files.filter(f => f.name !== '.emptyFolderPlaceholder');

  if (arquivosAtuais.length === 0) {
    btnDeleteAll.style.display = 'none';
    listaSets.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎧</span>
        <p>Nenhum set publicado ainda</p>
        <span>Selecione um arquivo acima para fazer o seu primeiro upload.</span>
      </div>
    `;
    return;
  }

  btnDeleteAll.style.display = 'inline-block';
  listaSets.innerHTML = '';

  arquivosAtuais.forEach(file => {
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(file.name);

    const publicUrl = publicUrlData.publicUrl;
    const sizeMB = file.metadata?.size ? (file.metadata.size / (1024 * 1024)).toFixed(2) : '0.00';
    const ext = file.name.split('.').pop().toUpperCase();

    // Extrai o nome amigável (remove o timestamp "1729600000--" do início e a extensão do fim)
    let displayName = file.name;
    if (displayName.includes('--')) {
      displayName = displayName.split('--').slice(1).join('--');
    }
    displayName = displayName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");

    const li = document.createElement('li');
    li.className = 'set-card';
    li.innerHTML = `
      <div class="set-left">
        <div class="set-avatar">🎵</div>
        <div class="set-meta">
          <div class="set-name" title="${displayName}">${displayName}</div>
          <div class="set-details">${sizeMB} MB • Formato ${ext}</div>
        </div>
      </div>
      <div class="set-actions">
        <a class="btn-action-dl" href="${publicUrl}" target="_blank" download="${displayName}.${ext.toLowerCase()}">⬇️ Baixar</a>
        <button class="btn-action-del" data-filename="${file.name}" title="Apagar este set">🗑️</button>
      </div>
    `;

    // Evento de apagar individual
    const btnDel = li.querySelector('.btn-action-del');
    btnDel.addEventListener('click', () => apagarSet(file.name, displayName));

    listaSets.appendChild(li);
  });
}

// ==========================================
// 3. APAGAR UM SET ESPECÍFICO
// ==========================================
async function apagarSet(fileName, displayName) {
  if (!confirm(`Tem certeza que deseja apagar o set "${displayName}"?`)) return;

  mostrarToast('⏳ Removendo set...');
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([fileName]);

  if (error) {
    mostrarToast(`❌ Erro ao apagar: ${error.message}`);
    return;
  }

  mostrarToast('🗑️ Set removido!');
  carregarSets();
}

// ==========================================
// 4. APAGAR TODOS OS SETS
// ==========================================
btnDeleteAll.addEventListener('click', async () => {
  if (arquivosAtuais.length === 0) return;

  const confirmacao = confirm(`⚠️ ATENÇÃO: Deseja realmente apagar TODOS os ${arquivosAtuais.length} sets armazenados? Essa ação não pode ser desfeita.`);
  if (!confirmacao) return;

  btnDeleteAll.disabled = true;
  mostrarToast('⏳ Apagando todos os sets...');

  const todosNomes = arquivosAtuais.map(f => f.name);
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(todosNomes);

  btnDeleteAll.disabled = false;

  if (error) {
    mostrarToast(`❌ Erro ao limpar bucket: ${error.message}`);
    return;
  }

  mostrarToast('✅ Todos os sets foram apagados!');
  carregarSets();
});

// Inicializa a lista ao abrir a página
document.addEventListener('DOMContentLoaded', carregarSets);