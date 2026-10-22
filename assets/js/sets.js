// Importa o cliente do Supabase direto do CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Substitua pelas suas chaves reais do painel do Supabase
const SUPABASE_URL = 'https://exjpfmmaaienrxrgbgqf.supabase.co/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4anBmbW1hYWllbnJ4cmdiZ3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODM5NjIsImV4cCI6MjEwODI1OTk2Mn0.N3jdBZobPWBETNsx8uHZYfQIZsKn5gqov3K-JhSzuuc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET_NAME = 'dj-sets';

// Referências da tela
const btnUpload = document.getElementById('btnUpload');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('status');
const listaSets = document.getElementById('listaSets');

// ==========================================
// 1. FUNÇÃO DE UPLOAD
// ==========================================
btnUpload.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    statusDiv.innerText = '⚠️ Selecione um arquivo de áudio primeiro!';
    return;
  }

  // Limpa o nome do arquivo para evitar bugs na URL
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_zarbig_set.${fileExt}`;

  btnUpload.disabled = true;
  statusDiv.innerText = `⏳ Enviando ${file.name}... (Isso pode demorar dependendo do tamanho)`;

  // Faz o upload direto para o bucket
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false // Não substitui arquivos com o mesmo nome
    });

  if (error) {
    statusDiv.innerText = `❌ Erro no upload: ${error.message}`;
    btnUpload.disabled = false;
    return;
  }

  statusDiv.innerText = '✅ Upload concluído com sucesso!';
  fileInput.value = ''; // Limpa o input
  btnUpload.disabled = false;
  
  // Recarrega a lista para mostrar o novo arquivo
  carregarSets();
});

// ==========================================
// 2. FUNÇÃO PARA LISTAR E BAIXAR
// ==========================================
async function carregarSets() {
  listaSets.innerHTML = '<li>Carregando sets...</li>';

  // Busca a lista de arquivos dentro do bucket
  const { data: files, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list();

  if (error) {
    listaSets.innerHTML = `<li>Erro ao carregar: ${error.message}</li>`;
    return;
  }

  // Filtra arquivos ocultos (como o .emptyFolderPlaceholder)
  const validFiles = files.filter(f => f.name !== '.emptyFolderPlaceholder');

  if (validFiles.length === 0) {
    listaSets.innerHTML = '<li>Nenhum set disponível no momento.</li>';
    return;
  }

  listaSets.innerHTML = '';

  validFiles.forEach(file => {
    // Gera a URL pública para download
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(file.name);

    const publicUrl = publicUrlData.publicUrl;
    
    // Converte o tamanho de bytes para Megabytes
    const sizeMB = (file.metadata.size / (1024 * 1024)).toFixed(2);

    // Cria o item na lista usando as classes CSS que você já tem
    const li = document.createElement('li');
    li.className = 'track-item';
    li.innerHTML = `
      <div class="info">
        <div class="title">${file.name}</div>
        <div class="artist">${sizeMB} MB</div>
      </div>
      <div class="badges-container">
        <a class="yt-badge dl-ok" href="${publicUrl}" target="_blank" download>⬇️ Baixar</a>
      </div>
    `;
    listaSets.appendChild(li);
  });
}

// Inicia carregando os arquivos assim que a página abre
document.addEventListener("DOMContentLoaded", carregarSets);