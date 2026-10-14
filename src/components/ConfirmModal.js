// Confirmation Modal with Blur Backdrop & Micro-Interactions
// Used for destructive actions (e.g. deleting users, deleting channels)

const MODAL_CONTAINER_ID = 'yta-confirm-modal';

/**
 * Show a blur-overlay confirmation modal
 * @param {Object} options
 * @param {string} [options.title='Confirm Action']
 * @param {string} [options.message='Are you sure you want to proceed?']
 * @param {string} [options.confirmText='Confirm']
 * @param {string} [options.cancelText='Cancel']
 * @param {boolean} [options.danger=true]
 * @param {string} [options.loadingText='Processing...']
 * @param {Function} options.onConfirm - Async or sync callback to execute on confirm
 */
export function showConfirmModal({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  danger = true,
  loadingText = 'Deleting...',
  onConfirm = async () => {}
}) {
  // Remove any existing confirm modal
  const existing = document.getElementById(MODAL_CONTAINER_ID);
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = MODAL_CONTAINER_ID;
  backdrop.className = 'yta-modal-backdrop';

  const iconSvg = danger
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  backdrop.innerHTML = `
    <div class="yta-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div class="yta-modal-header">
        <div class="yta-modal-icon-badge ${danger ? 'yta-modal-icon-danger' : 'yta-modal-icon-accent'}">
          ${iconSvg}
        </div>
        <div style="flex: 1;">
          <h3 id="confirm-modal-title" class="yta-modal-title">${escapeHtml(title)}</h3>
          <div class="yta-modal-subtitle">Permanent action</div>
        </div>
        <button type="button" class="yta-modal-close" id="btn-close-confirm" aria-label="Close">✕</button>
      </div>

      <div class="yta-modal-body">
        <div class="yta-modal-message">${message}</div>
      </div>

      <div class="yta-modal-footer">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-confirm" style="height: 38px; padding: 0 16px;">
          ${escapeHtml(cancelText)}
        </button>
        <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'} btn-sm" id="btn-action-confirm" style="height: 38px; min-width: 110px; font-weight: 700;">
          ${escapeHtml(confirmText)}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const confirmBtn = backdrop.querySelector('#btn-action-confirm');
  const cancelBtn = backdrop.querySelector('#btn-cancel-confirm');
  const closeBtn = backdrop.querySelector('#btn-close-confirm');

  let isClosing = false;

  function close() {
    if (isClosing) return;
    isClosing = true;
    backdrop.classList.add('yta-modal-closing');
    document.removeEventListener('keydown', handleKey);
    setTimeout(() => {
      backdrop.remove();
    }, 180);
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  document.addEventListener('keydown', handleKey);

  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    closeBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="btn-spinner"></span> ${escapeHtml(loadingText)}`;

    try {
      await onConfirm();
      close();
    } catch (err) {
      console.error('Confirmation action error:', err);
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      closeBtn.disabled = false;
      confirmBtn.textContent = confirmText;
    }
  });

  // Focus confirm button for quick keyboard navigation
  setTimeout(() => {
    if (confirmBtn) confirmBtn.focus();
  }, 50);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
