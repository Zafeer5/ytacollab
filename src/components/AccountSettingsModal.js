import { store } from '../lib/store.js';

const EYE_OPEN_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

export function openAccountSettingsModal(onSuccess) {
  const state = store.getState();
  const user = state.currentUser;
  if (!user) return;

  const prev = document.getElementById('yta-account-modal');
  if (prev) prev.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'yta-account-modal';
  backdrop.className = 'channel-about-modal-backdrop';

  backdrop.innerHTML = `
    <div class="channel-about-modal-dialog" role="dialog" aria-modal="true" style="max-width: 420px;" aria-label="Account Settings">
      <div class="channel-about-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="sidebar-tag" style="background: rgba(255, 122, 0, 0.15); color: var(--accent); border-color: var(--accent); font-weight: 700;">USER</span>
          <div class="channel-about-modal-title">Account Credentials</div>
        </div>
        <button type="button" class="channel-about-modal-close" id="btn-close-acc-modal" title="Close (Esc)">✕</button>
      </div>

      <div class="channel-about-modal-body" style="padding: 18px 20px;">
        <form id="form-account-credentials">
          <div class="form-group" style="margin-bottom: 14px;">
            <label for="acc-input-username" style="font-size: 12px; font-weight: 600;">Username</label>
            <input type="text" id="acc-input-username" value="${user.username || ''}" required autocomplete="username" />
            <span class="helper-text" style="font-size: 11px; margin-top: 4px; display: block;">Login identifier for your account</span>
          </div>

          <div class="form-group" style="margin-bottom: 14px;">
            <label for="acc-input-password" style="font-size: 12px; font-weight: 600;">New Password (leave empty to keep current)</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="acc-input-password" placeholder="Enter new password..." autocomplete="new-password" style="padding-right: 36px; font-family: monospace;" />
              <button type="button" id="btn-toggle-new-pw" style="position: absolute; right: 6px; background: transparent; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;" title="Show/Hide">
                ${EYE_OPEN_SVG}
              </button>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 16px;" id="group-confirm-pw">
            <label for="acc-input-confirm-password" style="font-size: 12px; font-weight: 600;">Confirm New Password</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="acc-input-confirm-password" placeholder="Repeat new password..." autocomplete="new-password" style="padding-right: 36px; font-family: monospace;" />
              <button type="button" id="btn-toggle-confirm-pw" style="position: absolute; right: 6px; background: transparent; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;" title="Show/Hide">
                ${EYE_OPEN_SVG}
              </button>
            </div>
          </div>

          <div id="acc-modal-error" style="color: var(--pending-text); font-size: 12px; margin-bottom: 12px; display: none; background: rgba(239, 68, 68, 0.1); padding: 8px 10px; border-radius: 4px; border: 1px solid var(--pending-border);"></div>
          <div id="acc-modal-success" style="color: var(--success-text); font-size: 12px; margin-bottom: 12px; display: none; background: rgba(16, 185, 129, 0.1); padding: 8px 10px; border-radius: 4px; border: 1px solid var(--success-border);"></div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-acc-modal">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm" id="btn-submit-acc-creds">Save Credentials</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeModal = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeModal();
  };

  document.addEventListener('keydown', onKeyDown);
  backdrop.querySelector('#btn-close-acc-modal').addEventListener('click', closeModal);
  backdrop.querySelector('#btn-cancel-acc-modal').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  // Password visibility toggles
  const pwInput = backdrop.querySelector('#acc-input-password');
  const confirmPwInput = backdrop.querySelector('#acc-input-confirm-password');
  const toggleNewPwBtn = backdrop.querySelector('#btn-toggle-new-pw');
  const toggleConfirmPwBtn = backdrop.querySelector('#btn-toggle-confirm-pw');

  let showPw = false;
  toggleNewPwBtn.addEventListener('click', () => {
    showPw = !showPw;
    pwInput.type = showPw ? 'text' : 'password';
    toggleNewPwBtn.innerHTML = showPw ? EYE_OFF_SVG : EYE_OPEN_SVG;
  });

  let showConfirmPw = false;
  toggleConfirmPwBtn.addEventListener('click', () => {
    showConfirmPw = !showConfirmPw;
    confirmPwInput.type = showConfirmPw ? 'text' : 'password';
    toggleConfirmPwBtn.innerHTML = showConfirmPw ? EYE_OFF_SVG : EYE_OPEN_SVG;
  });

  // Form submit handler
  const form = backdrop.querySelector('#form-account-credentials');
  const usernameInput = backdrop.querySelector('#acc-input-username');
  const errEl = backdrop.querySelector('#acc-modal-error');
  const succEl = backdrop.querySelector('#acc-modal-success');
  const submitBtn = backdrop.querySelector('#btn-submit-acc-creds');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    const newUsername = usernameInput.value.trim();
    const newPassword = pwInput.value;
    const confirmPassword = confirmPwInput.value;

    if (!newUsername) {
      errEl.textContent = 'Username is required.';
      errEl.style.display = 'block';
      return;
    }

    if (newPassword && newPassword.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters long.';
      errEl.style.display = 'block';
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      errEl.textContent = 'Passwords do not match.';
      errEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const res = await store.updateMyCredentials({
      username: newUsername,
      password: newPassword || undefined
    });

    if (res.success) {
      succEl.textContent = '✓ Credentials updated successfully!';
      succEl.style.display = 'block';
      submitBtn.textContent = 'Saved!';
      setTimeout(() => {
        closeModal();
        if (typeof onSuccess === 'function') onSuccess();
      }, 1200);
    } else {
      errEl.textContent = res.error || 'Failed to update credentials.';
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Credentials';
    }
  });
}
