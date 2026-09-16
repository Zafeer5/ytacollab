import { store } from '../lib/store.js';
import { toggleMobileSidebar } from './AdminSidebar.js';

export function renderHeader(container, currentView, navigate) {
  const state = store.getState();
  const user = state.currentUser;

  let leftContent = '';
  let rightContent = '';

  if (!user) {
    leftContent = `<a href="#" id="brand-link" class="app-title">YTA - colabapp</a>`;
    if (currentView === 'landing') {
      rightContent = `
        <div class="nav-links">
          <button id="nav-login-btn" class="btn btn-primary btn-sm">Login</button>
        </div>
      `;
    }
  } else if (user.role === 'ADMIN') {
    leftContent = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <button id="header-sidebar-toggle" class="sidebar-hamburger" title="Toggle Navigation">
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
        </button>
        <a href="#" id="brand-link" class="app-title">YTA - colabapp</a>
      </div>
    `;

    rightContent = `
      <div class="nav-links" style="align-items: center; gap: 10px;">
        <span class="helper-text" style="color: var(--text-primary); font-weight: 600;">Admin</span>
      </div>
    `;
  } else if (user.role === 'TEAM_MEMBER') {
    leftContent = `<a href="#" id="brand-link" class="app-title">YTA - colabapp</a>`;
    rightContent = `
      <div class="nav-links">
        <span class="helper-text" style="color: var(--text-primary); font-weight: 600;">${user.username}</span>
        <button id="nav-logout" class="nav-btn logout-btn">Logout</button>
      </div>
    `;
  }

  container.innerHTML = `
    <header class="app-header">
      <div class="header-container">
        ${leftContent}
        ${rightContent}
      </div>
    </header>
  `;

  // Attach event listeners
  const brandLink = container.querySelector('#brand-link');
  if (brandLink) {
    brandLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (!user) navigate('#/landing');
      else if (user.role === 'ADMIN') navigate('#/admin/table');
      else navigate('#/team');
    });
  }

  const sidebarToggle = container.querySelector('#header-sidebar-toggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const sidebarContainer = document.getElementById('sidebar-mount');
      if (sidebarContainer) {
        toggleMobileSidebar(sidebarContainer, currentView, navigate);
      }
    });
  }



  const loginBtn = container.querySelector('#nav-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => navigate('#/login'));
  }

  const logoutBtn = container.querySelector('#nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      store.logout();
      navigate('#/landing');
    });
  }
}
