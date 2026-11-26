import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://exjpfmmaaienrxrgbgqf.supabase.co/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4anBmbW1hYWllbnJ4cmdiZ3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODM5NjIsImV4cCI6MjEwODI1OTk2Mn0.N3jdBZobPWBETNsx8uHZYfQIZsKn5gqov3K-JhSzuuc';
const BUCKET_NAME = 'dj-sets';
// file share lives under a folder prefix inside the existing bucket, so the
// sets page (bucket root) never mixes with these files.
const PREFIX = 'files';
// supabase free plan caps every upload at 50 mb (global file size limit).
// raise this only if the project moves to a paid plan.
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ADMIN_HASH = 'f1c1592588411002af340cbaedd6fc33';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements
const fileInput = document.getElementById('fileInput');
const fileNameInput = document.getElementById('fileNameInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const dropzoneLabel = document.getElementById('dropzoneLabel');
const btnUpload = document.getElementById('btnUpload');
const btnDeleteAll = document.getElementById('btnDeleteAll');
const statusDiv = document.getElementById('status');
const fileList = document.getElementById('fileList');
const lockScreen = document.getElementById('lockScreen');
const toolContent = document.getElementById('toolContent');
const btnAdminToggle = document.getElementById('btnAdminToggle');
const btnAdminUnlock = document.getElementById('btnAdminUnlock');

let currentFiles = [];
let isAdmin = false;
let __toggleLock = false;

// ==========================================
// CUSTOM MODAL POPUPS (SHARED HELPER FROM main.js)
// ==========================================
// showCustomModal() lives in assets/js/main.js as window.showCustomModal,
// so every page uses the same implementation.

// ==========================================
// ADMIN MODE TOGGLE (kept in sync with sets.js)
// ==========================================
function syncAdminUI() {
  if (btnAdminToggle) {
    btnAdminToggle.setAttribute('aria-expanded', isAdmin ? 'true' : 'false');
    btnAdminToggle.innerHTML = isAdmin
      ? '<i class="ph ph-lock-open" aria-hidden="true"></i> exit admin mode'
      : '<i class="ph ph-lock" aria-hidden="true"></i> admin mode';
  }
  if (btnAdminUnlock) {
    btnAdminUnlock.setAttribute('aria-expanded', isAdmin ? 'true' : 'false');
  }
}

window.toggleAdminMode = async function() {
  if (__toggleLock) return;
  __toggleLock = true;
  try {
    if (isAdmin) {
      isAdmin = false;
      if (window.setAdminBgWidget) window.setAdminBgWidget(false);
      toolContent.style.display = 'none';
      fileList.innerHTML = '';
      currentFiles = [];
      lockScreen.style.display = '';
      syncAdminUI();
      mostrarToast('admin mode disabled');
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
      if (window.setAdminBgWidget) window.setAdminBgWidget(true);
      lockScreen.style.display = 'none';
      toolContent.style.display = 'grid';
      syncAdminUI();
      mostrarToast('login successful');
      loadFiles();
    } else {
      mostrarToast('invalid password');
    }
  } finally {
    __toggleLock = false;
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

    if (!fileNameInput.value.trim()) {
      fileNameInput.value = file.name.replace(/\.[^/.]+$/, '');
    }
  } else {
    resetDropzone();
  }
});

function resetDropzone() {
  fileInput.value = '';
  fileNameInput.value = '';
  fileNameDisplay.innerText = 'click to select any file';
  dropzoneLabel.classList.remove('has-file');
}

// ==========================================
// 1. UPLOAD FILE
// ==========================================
btnUpload.addEventListener('click', async () => {
  if (!isAdmin) {
    mostrarToast('unauthorized!');
    return;
  }

  const file = fileInput.files[0];
  if (!file) {
    mostrarToast('select a file first!');
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const msg = `file too large: ${sizeMB} mb (max ${MAX_FILE_BYTES / (1024 * 1024)} mb)`;
    statusDiv.innerText = msg;
    mostrarToast(msg);
    return;
  }

  const dotIndex = file.name.lastIndexOf('.');
  const hasExt = dotIndex > 0;
  const rawExt = hasExt ? file.name.slice(dotIndex + 1).toLowerCase() : '';
  const ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 10);
  const baseName = hasExt ? file.name.slice(0, dotIndex) : file.name;

  const rawCustomName = fileNameInput.value.trim() || baseName;

  const safeName = rawCustomName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const finalFileName = `${Date.now()}--${safeName || 'file'}${ext ? '.' + ext : ''}`;
  const filePath = `${PREFIX}/${finalFileName}`;

  btnUpload.disabled = true;
  statusDiv.innerText = `uploading "${rawCustomName}"... please wait.`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;
  } catch (err) {
    statusDiv.innerText = `upload error: ${err.message}`;
    mostrarToast('failed to upload file');
    btnUpload.disabled = false;
    return;
  }

  statusDiv.innerText = '';
  mostrarToast('file uploaded successfully!');
  resetDropzone();
  btnUpload.disabled = false;
  loadFiles();
});

// ==========================================
// 2. LIST FILES
// ==========================================
function formatSize(bytes) {
  if (!bytes) return '0 kb';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(2)} mb` : `${Math.max(1, Math.round(bytes / 1024))} kb`;
}

const ICON_GROUPS = {
  'ph-file-audio': ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'aiff', 'wma', 'mid', 'midi'],
  'ph-file-image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'avif', 'tiff'],
  'ph-file-video': ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv'],
  'ph-file-zip': ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  'ph-file-pdf': ['pdf'],
  'ph-file-text': ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
};

function iconForExt(ext) {
  for (const [icon, exts] of Object.entries(ICON_GROUPS)) {
    if (exts.includes(ext)) return icon;
  }
  return 'ph-file';
}

async function loadFiles() {
  fileList.innerHTML = `
    <div class="empty-state">
      <i class="ph ph-spinner empty-icon" aria-hidden="true"></i>
      <p>fetching your files from cloud...</p>
    </div>
  `;

  let files = [];

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(PREFIX, {
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) throw error;
    files = data || [];
  } catch (err) {
    currentFiles = [];
    btnDeleteAll.style.display = 'none';
    fileList.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-warning empty-icon" aria-hidden="true"></i>
        <p>error loading list</p>
        <span>${window.escapeHtml(err.message)}</span>
      </div>
    `;
    return;
  }

  // folders (id === null) have nothing to download or delete here
  currentFiles = files.filter(f => f.name !== '.emptyFolderPlaceholder' && f.id !== null);

  if (currentFiles.length === 0) {
    btnDeleteAll.style.display = 'none';
    fileList.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-files empty-icon" aria-hidden="true"></i>
        <p>no files uploaded yet</p>
        <span>drop any file above to get started.</span>
      </div>
    `;
    return;
  }

  btnDeleteAll.style.display = 'inline-block';
  fileList.innerHTML = '';
  renderFiles();
}

function renderFiles() {
  currentFiles.forEach(file => {
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`${PREFIX}/${file.name}`, {
        download: true
      });

    const publicUrl = publicUrlData.publicUrl;
    const sizeLabel = formatSize(file.metadata?.size);
    const dotIndex = file.name.lastIndexOf('.');
    const ext = dotIndex > 0 ? file.name.slice(dotIndex + 1).toLowerCase() : '';

    let displayName = file.name;
    displayName = displayName.replace(/^\d{10,}--/, '');
    displayName = displayName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

    const escapedName = window.escapeHtml(displayName);
    const escapedUrl = window.escapeHtml(publicUrl);
    // download names pass through the shared sanitizer (never raw bucket names)
    const downloadBase = window.sanitizeFileName(displayName) || 'file';
    const downloadName = window.escapeHtml(ext ? `${downloadBase}.${ext}` : downloadBase);
    const icon = iconForExt(ext);

    const li = document.createElement('li');
    li.className = 'set-card';
    li.innerHTML = `
      <div class="set-left">
        <span class="file-icon" aria-hidden="true"><i class="ph ${icon}"></i></span>
        <div class="set-meta">
          <div class="set-name" title="${escapedName}">${escapedName}</div>
          <div class="set-details">${sizeLabel} • ${window.escapeHtml(ext || 'file')}</div>
        </div>
      </div>
      <div class="set-actions">
        <a class="btn-action-dl" href="${escapedUrl}" target="_blank" rel="noopener" download="${downloadName}" title="download" aria-label="download ${escapedName}"><i class="ph ph-download-simple" aria-hidden="true"></i></a>
        <button class="btn-action-copy" type="button" title="copy download link" aria-label="copy download link"><i class="ph ph-link" aria-hidden="true"></i></button>
        <button class="btn-action-del" type="button" title="delete file" aria-label="delete ${escapedName}"><i class="ph ph-trash" aria-hidden="true"></i></button>
      </div>
    `;

    li.querySelector('.btn-action-copy').addEventListener('click', () => {
      window.copyText(publicUrl, 'download link copied!');
    });

    li.querySelector('.btn-action-del').addEventListener('click', () => deleteFile(file.name, displayName));

    fileList.appendChild(li);
  });
}

// ==========================================
// 3. DELETE FILE
// ==========================================
async function deleteFile(fileName, displayName) {
  if (!isAdmin) {
    mostrarToast('unauthorized!');
    return;
  }

  const confirmed = await showCustomModal({
    title: 'delete file',
    message: `are you sure you want to delete "${displayName}"?`
  });

  if (!confirmed) return;

  mostrarToast('removing file...');
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([`${PREFIX}/${fileName}`]);

    if (error) throw error;
  } catch (err) {
    mostrarToast(`error deleting: ${err.message}`);
    return;
  }

  mostrarToast('file removed!');
  loadFiles();
}

// ==========================================
// 4. DELETE ALL FILES
// ==========================================
btnDeleteAll.addEventListener('click', async () => {
  if (!isAdmin || currentFiles.length === 0) return;

  const confirmed = await showCustomModal({
    title: 'delete all files',
    message: `warning: delete all ${currentFiles.length} files? this cannot be undone.`
  });

  if (!confirmed) return;

  btnDeleteAll.disabled = true;
  mostrarToast('deleting all files...');

  const allPaths = currentFiles.map(f => `${PREFIX}/${f.name}`);
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(allPaths);

    if (error) throw error;
  } catch (err) {
    btnDeleteAll.disabled = false;
    mostrarToast(`error clearing files: ${err.message}`);
    return;
  }

  btnDeleteAll.disabled = false;

  mostrarToast('all files deleted!');
  loadFiles();
});

// The tool stays locked until toggleAdminMode() authenticates.
syncAdminUI();
