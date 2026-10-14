// Toast Notification System
// Modern, dark-mode, animated corner toast notifications with micro-interactions

const TOAST_CONTAINER_ID = 'yta-toast-container';

function getOrCreateToastContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = 'yta-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(container);
  }
  return container;
}

const ICONS = {
  success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>`,
  danger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

/**
 * Show a toast notification
 * @param {string} message - Message text to display
 * @param {'success'|'danger'|'warning'|'info'} [type='success'] - Toast variant
 * @param {number} [duration=3800] - Duration in ms before auto-dismiss
 */
export function showToast(message, type = 'success', duration = 3800) {
  const container = getOrCreateToastContainer();
  const normalizedType = ['success', 'danger', 'warning', 'info'].includes(type) ? type : 'info';

  const toast = document.createElement('div');
  toast.className = `yta-toast yta-toast-${normalizedType}`;
  toast.setAttribute('role', 'alert');

  toast.innerHTML = `
    <div class="yta-toast-icon">${ICONS[normalizedType] || ICONS.info}</div>
    <div class="yta-toast-message">${escapeHtml(message)}</div>
    <button type="button" class="yta-toast-close" title="Dismiss notification" aria-label="Close">✕</button>
  `;

  let timeoutId = null;

  function dismiss() {
    if (toast.classList.contains('yta-toast-closing')) return;
    toast.classList.add('yta-toast-closing');
    if (timeoutId) clearTimeout(timeoutId);
    setTimeout(() => {
      toast.remove();
    }, 220);
  }

  const closeBtn = toast.querySelector('.yta-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
  }

  container.appendChild(toast);

  if (duration > 0) {
    timeoutId = setTimeout(dismiss, duration);
  }

  return { dismiss };
}

showToast.success = (msg, duration) => showToast(msg, 'success', duration);
showToast.danger = (msg, duration) => showToast(msg, 'danger', duration);
showToast.error = (msg, duration) => showToast(msg, 'danger', duration);
showToast.warning = (msg, duration) => showToast(msg, 'warning', duration);
showToast.info = (msg, duration) => showToast(msg, 'info', duration);

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
