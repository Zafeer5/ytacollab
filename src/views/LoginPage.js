import { store } from '../lib/store.js';

export function renderLoginPage(container, navigate) {
  const state = store.getState();
  const schemaWarning = !state.schemaReady && state.lastError
    ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); font-size: 12px; margin-bottom: 14px;">
        ⚠️ <strong>Database Setup Required:</strong> Please run <code>supabase/schema.sql</code> in your Supabase SQL Editor to initialize tables and authentication.
       </div>`
    : '';

  container.innerHTML = `
    <div class="main-content" style="max-width: 380px; margin: 50px auto;">
      ${schemaWarning}
      <div class="card">
        <h1 style="margin-bottom: 20px; font-size: 20px;">Login</h1>

        <form id="login-form">
          <div class="form-group">
            <label for="input-username">username</label>
            <input type="text" id="input-username" required autocomplete="username" placeholder="username" />
          </div>

          <div class="form-group" style="margin-bottom: 18px;">
            <label for="input-password">password</label>
            <input type="password" id="input-password" required autocomplete="current-password" placeholder="password" />
          </div>

          <div id="login-error" style="color: var(--pending-text); font-size: 12px; margin-bottom: 12px; display: none;"></div>

          <button type="submit" id="btn-login-submit" class="btn btn-primary btn-full" style="height: 42px;">
            Login
          </button>
        </form>
      </div>
    </div>
  `;

  const loginForm = container.querySelector('#login-form');
  const usernameInput = container.querySelector('#input-username');
  const passwordInput = container.querySelector('#input-password');
  const errorEl = container.querySelector('#login-error');
  const submitBtn = container.querySelector('#btn-login-submit');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const username = usernameInput.value;
    const password = passwordInput.value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
      const result = await store.login(username, password);
      if (result.success) {
        const postLoginRedirect = sessionStorage.getItem('yta_post_login_redirect');
        sessionStorage.removeItem('yta_post_login_redirect');

        if (result.user.role === 'ADMIN') {
          navigate(postLoginRedirect && postLoginRedirect.startsWith('#/admin') ? postLoginRedirect : '#/admin/table');
        } else {
          navigate('#/team');
        }
      } else {
        errorEl.textContent = result.error || 'Invalid credentials.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Login failed. Please check network connection.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  });
}
