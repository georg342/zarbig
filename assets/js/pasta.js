import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://exjpfmmaaienrxrgbgqf.supabase.co/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4anBmbW1hYWllbnJ4cmdiZ3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODM5NjIsImV4cCI6MjEwODI1OTk2Mn0.N3jdBZobPWBETNsx8uHZYfQIZsKn5gqov3K-JhSzuuc';
const BUCKET_NAME = 'dj-sets';
// every post is its own object inside this prefix, so posting never rewrites
// an existing post and clearing one cannot touch the others.
const PASTA_PREFIX = 'pasta';
// the single note from the old files page: moved into the feed once, then removed
const LEGACY_NOTE_PATH = 'posts/post.txt';
const ADMIN_HASH = 'f1c1592588411002af340cbaedd6fc33';
// the poll re-lists only the newest object name, so it costs one tiny request
// and skips the per-post downloads when nothing changed.
const FEED_POLL_MS = 20000;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements
const lockScreen = document.getElementById('lockScreen');
const toolContent = document.getElementById('toolContent');
const btnAdminToggle = document.getElementById('btnAdminToggle');
const btnAdminUnlock = document.getElementById('btnAdminUnlock');
const pastaInput = document.getElementById('pastaInput');
const btnPastaPost = document.getElementById('btnPastaPost');
const btnPastaClear = document.getElementById('btnPastaClear');
const pastaStatus = document.getElementById('pastaStatus');
const pastaState = document.getElementById('pastaState');
const pastaFeed = document.getElementById('pastaFeed');

const POST_IDLE_HTML = '<i class="ph ph-paper-plane-tilt" aria-hidden="true"></i> post';

let isAdmin = false;
let __toggleLock = false;
let postBusy = false;
let postTimer = null;
let feedItems = [];
let feedTop = null;

// ==========================================
// ADMIN MODE TOGGLE (kept in sync with files.js / sets.js)
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
      pastaFeed.innerHTML = '';
      feedItems = [];
      feedTop = null;
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
      await migrateLegacyPost();
      loadFeed();
    } else {
      mostrarToast('invalid password');
    }
  } finally {
    __toggleLock = false;
  }
};

// ==========================================
// 1. MIGRATE THE OLD SINGLE NOTE
// ==========================================
// one-shot: the note posted on the files page becomes the first feed item.
async function migrateLegacyPost() {
  try {
    const { data: entries, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(PASTA_PREFIX);
    if (error) return;
    if ((entries || []).some(entry => entry.id !== null)) return;

    const { data, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(LEGACY_NOTE_PATH);
    if (downloadError || !data) return;

    const text = await data.text();
    if (!text.trim()) return;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(`${PASTA_PREFIX}/${Date.now()}.txt`, new Blob([text], { type: 'text/plain' }), {
        contentType: 'text/plain',
        cacheControl: '0'
      });
    if (uploadError) return;

    await supabase.storage.from(BUCKET_NAME).remove([LEGACY_NOTE_PATH]);
    mostrarToast('old note moved to the feed');
  } catch (err) {
    // best effort: a failed migration never blocks the feed
  }
}

// ==========================================
// 2. FEED (list + download every post)
// ==========================================
async function loadFeed() {
  pastaFeed.innerHTML = `
    <div class="empty-state">
      <i class="ph ph-spinner empty-icon ph-spin" aria-hidden="true"></i>
      <p>fetching posts from cloud...</p>
    </div>
  `;

  let entries = [];

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(PASTA_PREFIX, {
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) throw error;
    entries = (data || []).filter(entry => entry.id !== null && entry.name !== '.emptyFolderPlaceholder');
  } catch (err) {
    feedTop = null;
    pastaFeed.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-warning empty-icon" aria-hidden="true"></i>
        <p>error loading feed</p>
        <span>${window.escapeHtml(err.message)}</span>
      </div>
    `;
    return;
  }

  feedTop = entries.length ? entries[0].name : null;

  if (entries.length === 0) {
    feedItems = [];
    pastaState.innerText = 'feed empty';
    pastaFeed.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-bowl-food empty-icon" aria-hidden="true"></i>
        <p>nothing in the feed yet</p>
        <span>paste anything above and hit post.</span>
      </div>
    `;
    return;
  }

  feedItems = await Promise.all(entries.map(async (entry) => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(`${PASTA_PREFIX}/${entry.name}`);
      if (error) throw error;
      return { name: entry.name, createdAt: entry.created_at, text: await data.text() };
    } catch (err) {
      return { name: entry.name, createdAt: entry.created_at, text: '', failed: true };
    }
  }));

  pastaState.innerText = `${feedItems.length} post${feedItems.length === 1 ? '' : 's'} in cloud`;
  renderFeed();
}

function dateLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown date';
  return date.toLocaleString();
}

function renderFeed() {
  pastaFeed.innerHTML = '';

  feedItems.forEach(item => {
    const li = document.createElement('li');
    li.className = 'set-card pasta-item';
    li.innerHTML = `
      <div class="pasta-text"></div>
      <div class="set-details">${window.escapeHtml(dateLabel(item.createdAt))}${item.failed ? ' • load error' : ''}</div>
      <div class="set-actions">
        <button class="btn-action-copy" type="button" title="copy text" aria-label="copy post text"><i class="ph ph-copy" aria-hidden="true"></i></button>
        <button class="btn-action-del" type="button" title="clear post" aria-label="clear post"><i class="ph ph-trash" aria-hidden="true"></i></button>
      </div>
    `;

    // post text is user data: textContent only, never innerHTML
    li.querySelector('.pasta-text').textContent = item.text || '(empty post)';

    li.querySelector('.btn-action-copy').addEventListener('click', () => {
      if (!item.text) {
        mostrarToast('nothing to copy');
        return;
      }
      window.copyText(item.text, 'copied!');
    });

    li.querySelector('.btn-action-del').addEventListener('click', () => deletePost(item));

    pastaFeed.appendChild(li);
  });
}

// ==========================================
// 3. CLEAR A SINGLE POST
// ==========================================
async function deletePost(item) {
  const snippet = item.text.length > 70 ? `${item.text.slice(0, 70)}...` : item.text;
  const confirmed = await showCustomModal({
    title: 'clear post',
    message: `delete this post? "${snippet}"`
  });

  if (!confirmed) return;

  mostrarToast('clearing post...');
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([`${PASTA_PREFIX}/${item.name}`]);

    if (error) throw error;
  } catch (err) {
    mostrarToast(`error clearing post: ${err.message}`);
    return;
  }

  mostrarToast('post cleared!');
  loadFeed();
}

// ==========================================
// 4. POST TEXT
// ==========================================
async function postPasta() {
  if (!isAdmin) {
    mostrarToast('unauthorized!');
    return;
  }

  if (postBusy) return;

  const text = pastaInput.value;
  if (!text.trim()) {
    mostrarToast('nothing to post!');
    return;
  }

  setPostBusy(true);
  pastaStatus.innerText = 'uploading to supabase...';

  const blob = new Blob([text], { type: 'text/plain' });

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(`${PASTA_PREFIX}/${Date.now()}.txt`, blob, {
        contentType: 'text/plain',
        cacheControl: '0'
      });

    if (error) throw error;
    // success is announced only after the server hands back the stored object
    if (!data) throw new Error('upload not confirmed');
  } catch (err) {
    pastaStatus.innerText = `post error: ${err.message}`;
    mostrarToast('failed to post text');
    setPostBusy(false);
    return;
  }

  pastaInput.value = '';
  pastaStatus.innerText = '';
  pastaState.innerText = 'posted';
  mostrarToast('posted!');
  setPostBusy(false);
  loadFeed();
}

// the post button doubles as the progress display: spinner plus elapsed seconds
function setPostBusy(busy) {
  postBusy = busy;
  btnPastaPost.disabled = busy;
  btnPastaClear.disabled = busy;

  clearInterval(postTimer);
  postTimer = null;

  if (!busy) {
    btnPastaPost.innerHTML = POST_IDLE_HTML;
    return;
  }

  const started = Date.now();
  const paint = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    btnPastaPost.innerHTML = `<i class="ph ph-spinner ph-spin" aria-hidden="true"></i> posting... ${seconds}s`;
  };
  paint();
  postTimer = setInterval(paint, 1000);
}

// ==========================================
// 5. BACKGROUND SYNC
// ==========================================
// only the newest object name is compared: unchanged means no download at all
async function pollFeed() {
  if (!isAdmin || postBusy || document.hidden) return;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(PASTA_PREFIX, {
        limit: 1,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) throw error;
    const newest = (data || []).find(entry => entry.id !== null);
    const newestName = newest ? newest.name : null;
    if (newestName === feedTop) return;

    feedTop = newestName;
    loadFeed();
  } catch (err) {
    // flaky network: stay quiet, the next tick retries
  }
}

btnPastaPost.addEventListener('click', postPasta);

// local only: clearing the field never touches the cloud
btnPastaClear.addEventListener('click', () => {
  pastaInput.value = '';
  pastaStatus.innerText = '';
  pastaInput.focus();
  mostrarToast('field cleared');
});

// coming back to the tab (or unlocking the phone) refreshes the feed
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isAdmin) loadFeed();
});

setInterval(pollFeed, FEED_POLL_MS);

// The tool stays locked until toggleAdminMode() authenticates.
syncAdminUI();
