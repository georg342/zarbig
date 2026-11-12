// ==========================================
// SHARED UTILITIES (must load before page scripts)
// ==========================================

// Toast notification: reuses #toastContainer when the page provides one,
// otherwise creates it on demand. Visuals come from .toast / .toast-container.
window.mostrarToast = function (message) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.innerText = message;
  container.appendChild(toast);
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
          overlay.querySelector('#modalBtnConfirm').click();
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
};