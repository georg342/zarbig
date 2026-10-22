import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://exjpfmmaaienrxrgbgqf.supabase.co/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4anBmbW1hYWllbnJ4cmdiZ3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODM5NjIsImV4cCI6MjEwODI1OTk2Mn0.N3jdBZobPWBETNsx8uHZYfQIZsKn5gqov3K-JhSzuuc';
const BUCKET_NAME = 'dj-sets';
const ADMIN_HASH = 'f1c1592588411002af340cbaedd6fc33';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements
const fileInput = document.getElementById('fileInput');
const setNameInput = document.getElementById('setNameInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const dropzoneLabel = document.getElementById('dropzoneLabel');
const btnUpload = document.getElementById('btnUpload');
const btnDeleteAll = document.getElementById('btnDeleteAll');
const statusDiv = document.getElementById('status');
const listaSets = document.getElementById('listaSets');
const audioPlayerCard = document.getElementById('audioPlayerCard');
const audioPlayer = document.getElementById('audioPlayer');
const playerTitle = document.getElementById('playerTitle');
const uploadCard = document.getElementById('uploadCard');
const btnAdminToggle = document.getElementById('btnAdminToggle');

let arquivosAtuais = [];
let isAdmin = false;

// ==========================================
// TOAST SYSTEM
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
  toast.className = 'toast show';
  toast.innerText = mensagem;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// CUSTOM MODAL POPUPS (REPLACES PROMPT/CONFIRM)
// ==========================================
function showCustomModal({ title = 'confirmation', message = '', isPrompt = false, placeholder = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';

    overlay.innerHTML = `
      <div class="custom-modal-card">
        <h3 class="section-title" style="margin-bottom: 10px;">${title}</h3>
        <div class="custom-modal-msg">${message}</div>
        ${isPrompt ? `<input type="password" id="modalInput" class="custom-modal-input" placeholder="${placeholder}">` : ''}
        <div class="custom-modal-actions">
          <button id="modalBtnCancel" class="btn-modal-cancel">cancel</button>
          <button id="modalBtnConfirm" class="btn-primary">confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#modalInput');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('modalBtnConfirm').click();
        }
      });
    }

    overlay.querySelector('#modalBtnConfirm').addEventListener('click', () => {
      const val = input ? input.value : true;
      overlay.remove();
      resolve(val);
    });

    overlay.querySelector('#modalBtnCancel').addEventListener('click', () => {
      overlay.remove();
      resolve(isPrompt ? null : false);
    });
  });
}

// ==========================================
// ADMIN MODE TOGGLE
// ==========================================
window.toggleAdminMode = async function() {
  if (isAdmin) {
    isAdmin = false;
    uploadCard.style.display = 'none';
    btnAdminToggle.innerHTML = '<i class="ph ph-lock"></i> admin mode';
    mostrarToast('admin mode disabled');
    carregarSets();
    return;
  }

  const pass = await showCustomModal({
    title: 'admin access',
    message: 'enter admin password to proceed:',
    isPrompt: true,
    placeholder: 'password...'
  });

  if (pass === null) return;

  const hashed = md5(pass.trim());
  if (hashed === ADMIN_HASH) {
    isAdmin = true;
    uploadCard.style.display = 'block';
    btnAdminToggle.innerHTML = '<i class="ph ph-lock-open"></i> exit admin mode';
    mostrarToast('login successful');
    carregarSets();
  } else {
    mostrarToast('invalid password');
  }
};

// ==========================================
// FILE INPUT INTERACTION
// ==========================================
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    fileNameDisplay.innerText = file.name;
    dropzoneLabel.classList.add('has-file');
    
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
  fileNameDisplay.innerText = 'click to select audio file';
  dropzoneLabel.classList.remove('has-file');
}

// ==========================================
// 1. UPLOAD SET
// ==========================================
btnUpload.addEventListener('click', async () => {
  if (!isAdmin) {
    mostrarToast('unauthorized!');
    return;
  }

  const file = fileInput.files[0];
  if (!file) {
    mostrarToast('select an audio file first!');
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const rawCustomName = setNameInput.value.trim() || file.name.replace(/\.[^/.]+$/, "");

  const safeName = rawCustomName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const finalFileName = `${Date.now()}--${safeName || 'set'}.${ext}`;

  btnUpload.disabled = true;
  statusDiv.innerText = `uploading "${rawCustomName}"... please wait.`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(finalFileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    statusDiv.innerText = `upload error: ${error.message}`;
    mostrarToast('failed to upload file');
    btnUpload.disabled = false;
    return;
  }

  statusDiv.innerText = '';
  mostrarToast('set uploaded successfully!');
  resetarDropzone();
  btnUpload.disabled = false;
  carregarSets();
});

// ==========================================
// 2. LIST SETS
// ==========================================
async function carregarSets() {
  listaSets.innerHTML = `
    <div class="empty-state">
      <i class="ph ph-spinner empty-icon"></i>
      <p>fetching your sets from cloud...</p>
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
        <i class="ph ph-warning empty-icon"></i>
        <p>error loading list</p>
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
        <i class="ph ph-disc empty-icon"></i>
        <p>no sets published yet</p>
        <span>enable admin mode above to upload your first set.</span>
      </div>
    `;
    return;
  }

  btnDeleteAll.style.display = isAdmin ? 'inline-block' : 'none';
  listaSets.innerHTML = '';

  arquivosAtuais.forEach(file => {
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(file.name, {
        download: true
      });

    const publicUrl = publicUrlData.publicUrl;
    const sizeMB = file.metadata?.size ? (file.metadata.size / (1024 * 1024)).toFixed(2) : '0.00';
    const ext = file.name.split('.').pop().toLowerCase();

    let displayName = file.name;
    if (displayName.includes('--')) {
      displayName = displayName.split('--').slice(1).join('--');
    }
    displayName = displayName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");

    const li = document.createElement('li');
    li.className = 'set-card';
    li.innerHTML = `
      <div class="set-left">
        <div class="set-avatar" title="play set"><i class="ph ph-play"></i></div>
        <div class="set-meta">
          <div class="set-name" title="${displayName}">${displayName}</div>
          <div class="set-details">${sizeMB} mb • ${ext}</div>
        </div>
      </div>
      <div class="set-actions">
        <button class="btn-action-play" title="play"><i class="ph ph-play"></i></button>
        <a class="btn-action-dl" href="${publicUrl}" target="_blank" download="${displayName}.${ext}" title="download"><i class="ph ph-download-simple"></i></a>
        <button class="btn-action-copy" title="copy download link"><i class="ph ph-link"></i></button>
        ${isAdmin ? `<button class="btn-action-del" title="delete set"><i class="ph ph-trash"></i></button>` : ''}
      </div>
    `;

    // Play action
    const playHandler = () => {
      audioPlayer.src = publicUrl;
      playerTitle.innerText = displayName;
      audioPlayerCard.style.display = 'block';
      audioPlayer.play().catch(e => console.error(e));
    };

    li.querySelector('.set-avatar').addEventListener('click', playHandler);
    li.querySelector('.btn-action-play').addEventListener('click', playHandler);

    // Copy link action
    li.querySelector('.btn-action-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(publicUrl).then(() => {
        mostrarToast('download link copied!');
      }).catch(() => {
        mostrarToast('failed to copy link');
      });
    });

    // Delete action (only if admin)
    if (isAdmin) {
      li.querySelector('.btn-action-del').addEventListener('click', () => apagarSet(file.name, displayName));
    }

    listaSets.appendChild(li);
  });
}

// ==========================================
// 3. DELETE SET
// ==========================================
async function apagarSet(fileName, displayName) {
  if (!isAdmin) {
    mostrarToast('unauthorized!');
    return;
  }

  const confirmed = await showCustomModal({
    title: 'delete set',
    message: `are you sure you want to delete "${displayName}"?`
  });

  if (!confirmed) return;

  mostrarToast('removing set...');
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([fileName]);

  if (error) {
    mostrarToast(`error deleting: ${error.message}`);
    return;
  }

  mostrarToast('set removed!');
  carregarSets();
}

// ==========================================
// 4. DELETE ALL SETS
// ==========================================
btnDeleteAll.addEventListener('click', async () => {
  if (!isAdmin || arquivosAtuais.length === 0) return;

  const confirmed = await showCustomModal({
    title: 'delete all sets',
    message: `warning: delete all ${arquivosAtuais.length} sets? this cannot be undone.`
  });

  if (!confirmed) return;

  btnDeleteAll.disabled = true;
  mostrarToast('deleting all sets...');

  const todosNomes = arquivosAtuais.map(f => f.name);
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(todosNomes);

  btnDeleteAll.disabled = false;

  if (error) {
    mostrarToast(`error clearing bucket: ${error.message}`);
    return;
  }

  mostrarToast('all sets deleted!');
  carregarSets();
});

// Initialize list on load
document.addEventListener('DOMContentLoaded', carregarSets);
