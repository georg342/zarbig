// ==========================================
// SHARED UTILITIES (must load before page scripts)
// ==========================================

// Toast notification: reuses #toastContainer when the page provides one,
// otherwise creates it on demand. Visuals come from .toast / .toast-container.
// The container is a polite live region: a purely visual toast is invisible to
// screen readers, so the text has to be announced instead of only painted.
window.mostrarToast = function (message) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);
  // paint the hidden state first, then flip .show on the next frame: appending it
  // already shown would skip the 100ms css snap and the toast would just pop in
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => toast.remove(), 3000);
};

// fetch() with an AbortController timeout.
window.fetchWithTimeout = async function (url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === 'AbortError' ? `timeout (${timeoutMs}ms)` : e.message);
  }
};

// Modal popup shared by every page (replaces prompt/confirm).
// Resolves with the typed value (prompt), true (confirm) or null/false (cancel).
window.showCustomModal = function ({ title = 'confirmation', message = '', isPrompt = false, placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    // apg dialog pattern: the overlay is the modal dialog and the title names it,
    // so assistive tech announces the panel instead of walking into a bare div
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modalTitle');

    overlay.innerHTML = `
      <div class="custom-modal-card">
        <h3 class="section-title" id="modalTitle" style="margin-bottom: 10px;">${title}</h3>
        <div class="custom-modal-msg">${message}</div>
        ${isPrompt ? `<input type="password" id="modalInput" class="custom-modal-input" placeholder="${placeholder}">` : ''}
        <div class="custom-modal-actions">
          <button id="modalBtnCancel" class="btn-modal-cancel">cancel</button>
          <button id="modalBtnConfirm" class="btn-primary">confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // focus returns to whatever opened the modal, so the keyboard flow continues
    const opener = document.activeElement;
    const close = (value) => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (opener && typeof opener.focus === 'function') opener.focus();
      resolve(value);
    };
    // escape is the expected way out of a dialog; it maps to cancel, never confirm
    const onKeydown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close(isPrompt ? null : false);
    };
    document.addEventListener('keydown', onKeydown);

    const input = overlay.querySelector('#modalInput');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          overlay.querySelector('#modalBtnConfirm').click();
        }
      });
    } else {
      // confirm/cancel only: park focus on the panel (not on confirm) so the first
      // enter never fires a destructive action and the page behind stops taking tabs
      const card = overlay.querySelector('.custom-modal-card');
      card.tabIndex = -1;
      card.focus();
    }

    overlay.querySelector('#modalBtnConfirm').addEventListener('click', () => {
      close(input ? input.value : true);
    });

    overlay.querySelector('#modalBtnCancel').addEventListener('click', () => {
      close(isPrompt ? null : false);
    });
  });
};

// ==========================================
// SHARED DOM / TEXT HELPERS
// ==========================================

// escapes a value for safe interpolation into innerHTML templates
window.escapeHtml = function (value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

// strips characters that break downloads or local file systems
window.sanitizeFileName = function (value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120);
};

// clipboard write with a legacy execCommand fallback (non-secure contexts)
window.copyText = function (text, message) {
  const done = () => window.mostrarToast && window.mostrarToast(message || 'copied');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(done).catch(() => window.mostrarToast && window.mostrarToast('copy failed'));
  }
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); done(); }
  catch (e) { window.mostrarToast && window.mostrarToast('copy failed'); }
  area.remove();
};

// ==========================================
// GLOBAL BACKGROUND GRADIENT + ADMIN COLOR PICKER
// ==========================================
// The 3-color gradient is a global preference: it is read from localStorage as
// soon as this script runs, so every page paints the same background. The
// picker itself is admin-only -- pages call window.setAdminBgWidget(true/false)
// from their own admin mode toggles.

const BG_GRADIENT_KEY = 'zb_bg_gradient';
const BG_GRADIENT_SLOTS = ['c1', 'c2', 'c3'];
const BG_GRADIENT_DEFAULTS = { c1: '#0a0a0a', c2: '#0d1410', c3: '#110a16' };
const BG_GRADIENT_VARS = { c1: '--bg-grad-1', c2: '--bg-grad-2', c3: '--bg-grad-3' };
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

let bgGradient = { ...BG_GRADIENT_DEFAULTS };
let bgWidget = null;

function readBgGradient() {
  try {
    const saved = JSON.parse(localStorage.getItem(BG_GRADIENT_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return { ...BG_GRADIENT_DEFAULTS };

    return BG_GRADIENT_SLOTS.reduce((colors, slot) => {
      const value = saved[slot];
      colors[slot] = typeof value === 'string' && HEX_COLOR.test(value)
        ? value.toLowerCase()
        : BG_GRADIENT_DEFAULTS[slot];
      return colors;
    }, {});
  } catch (e) {
    return { ...BG_GRADIENT_DEFAULTS };
  }
}

function saveBgGradient(colors) {
  try {
    localStorage.setItem(BG_GRADIENT_KEY, JSON.stringify(colors));
    return true;
  } catch (e) {
    return false;
  }
}

function clearBgGradient() {
  try {
    localStorage.removeItem(BG_GRADIENT_KEY);
  } catch (e) {
    // storage blocked: nothing to clear
  }
}

// pushes the colors into the :root custom properties (used by base.css on body)
function applyBgGradient(colors) {
  const rootStyle = document.documentElement.style;
  BG_GRADIENT_SLOTS.forEach((slot) => rootStyle.setProperty(BG_GRADIENT_VARS[slot], colors[slot]));

  if (!bgWidget) return;
  BG_GRADIENT_SLOTS.forEach((slot) => {
    const input = document.getElementById('adminBgPick' + slot.slice(1));
    if (input) input.value = colors[slot];
  });
}

// builds and injects the floating widget (kept as a single instance per page)
function buildBgWidget() {
  if (bgWidget || !document.body) return bgWidget;

  const widget = document.createElement('div');
  widget.id = 'adminBgWidget';
  widget.className = 'admin-bg-widget';
  widget.style.display = 'none';
  widget.innerHTML = `
    <div class="admin-bg-widget-head">
      <span class="admin-bg-widget-title">bg gradient</span>
      <button type="button" id="adminBgMin" title="collapse">-</button>
    </div>
    <div class="admin-bg-widget-body" id="adminBgWidgetBody">
      <div class="admin-bg-picks">
        <input type="color" id="adminBgPick1" title="top-left" value="${BG_GRADIENT_DEFAULTS.c1}">
        <input type="color" id="adminBgPick2" title="middle" value="${BG_GRADIENT_DEFAULTS.c2}">
        <input type="color" id="adminBgPick3" title="bottom-right" value="${BG_GRADIENT_DEFAULTS.c3}">
      </div>
      <button type="button" id="adminBgReset" class="admin-bg-reset">reset</button>
    </div>
  `;

  BG_GRADIENT_SLOTS.forEach((slot) => {
    const input = widget.querySelector('#adminBgPick' + slot.slice(1));
    input.value = bgGradient[slot];
    input.addEventListener('input', () => {
      bgGradient = { ...bgGradient, [slot]: input.value };
      applyBgGradient(bgGradient);
      saveBgGradient(bgGradient);
    });
  });

  const minBtn = widget.querySelector('#adminBgMin');
  minBtn.addEventListener('click', () => {
    const collapsed = widget.classList.toggle('is-min');
    minBtn.innerText = collapsed ? '+' : '-';
    minBtn.title = collapsed ? 'expand' : 'collapse';
  });

  widget.querySelector('#adminBgReset').addEventListener('click', () => {
    bgGradient = { ...BG_GRADIENT_DEFAULTS };
    applyBgGradient(bgGradient);
    clearBgGradient();
    window.mostrarToast('bg gradient reset');
  });

  document.body.appendChild(widget);
  bgWidget = widget;
  return widget;
}

// public hook used by every page's admin mode toggle
window.setAdminBgWidget = function (isAdmin) {
  const widget = bgWidget || buildBgWidget();
  if (!widget) return;
  widget.style.display = isAdmin ? 'block' : 'none';
};

// restore the saved gradient before anything else paints
bgGradient = readBgGradient();
applyBgGradient(bgGradient);

// inject the widget (hidden) once the body is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => buildBgWidget());
} else {
  buildBgWidget();
}