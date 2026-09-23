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
  } else if (user.role === 'ADMIN' || user.role === 'OWNER' || user.isAdmin) {
    const roleLabel = user.isOwner || user.role === 'OWNER' ? 'Owner' : 'Admin';
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
        <span class="helper-text" style="color: var(--text-primary); font-weight: 600;">${roleLabel}</span>
      </div>
    `;
  } else if (user.role === 'TEAM_MEMBER') {
    leftContent = `<a href="#" id="brand-link" class="app-title">YTA - colabapp</a>`;

    const myNotifications = (state.notifications || []).filter(
      (n) => n.targetUsername === user.username
    );

    rightContent = `
      <div class="nav-links" style="display: flex; align-items: center; gap: 8px;">
        <span class="helper-text" style="color: var(--text-primary); font-weight: 600;">${user.username}</span>

        <!-- Notification Bell Popover next to pre-existed Logout button -->
        <div class="notif-wrapper" id="header-notif-wrapper">
          <button type="button" id="btn-header-notif-bell" class="btn-notif-bell" aria-label="Notifications" title="Notifications">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            ${myNotifications.length > 0 ? `<span class="notif-badge">${myNotifications.length}</span>` : ''}
          </button>

          <div id="header-notif-popover" class="notif-dropdown-popover" style="display: none;">
            <div class="notif-popover-header">
              <div class="notif-popover-title">
                <span>Notifications</span>
                ${myNotifications.length > 0 ? `<span style="font-size: 10px; background: rgba(239,68,68,0.2); color: #f87171; padding: 1px 5px; border-radius: 8px;">${myNotifications.length}</span>` : ''}
              </div>
              ${myNotifications.length > 0 ? `<button type="button" id="btn-header-clear-all" class="btn-notif-clear-all">Clear all</button>` : ''}
            </div>
            <div class="notif-popover-body">
              ${myNotifications.length === 0 ? `
                <div class="notif-empty-state">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 6px; opacity: 0.4;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                  <div style="font-weight: 600; color: var(--text-primary); font-size: 12px; margin-bottom: 2px;">No notifications</div>
                  <div class="helper-text" style="font-size: 11px;">Admin notifications will appear here</div>
                </div>
              ` : `
                ${myNotifications.map((n) => `
                  <div class="notif-card-item">
                    <div style="flex: 1; min-width: 0;">
                      <div class="notif-card-msg">${n.message}</div>
                      <div class="notif-card-time">${n.timestamp}</div>
                    </div>
                    <button type="button" class="btn-dismiss-notif" data-notif-id="${n.id}" title="Dismiss">✕</button>
                  </div>
                `).join('')}
              `}
            </div>
          </div>
        </div>

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

  const notifBell = container.querySelector('#btn-header-notif-bell');
  const notifPopover = container.querySelector('#header-notif-popover');
  if (notifBell && notifPopover) {
    notifBell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = notifPopover.style.display === 'block';
      notifPopover.style.display = isOpen ? 'none' : 'block';
    });

    if (window._headerDocClickListener) {
      document.removeEventListener('click', window._headerDocClickListener);
    }
    const closeOnDocClick = (e) => {
      const wrapper = document.querySelector('#header-notif-wrapper');
      const popover = document.querySelector('#header-notif-popover');
      if (popover && wrapper && !wrapper.contains(e.target)) {
        popover.style.display = 'none';
      }
    };
    window._headerDocClickListener = closeOnDocClick;
    document.addEventListener('click', closeOnDocClick);
  }

  const clearAllBtn = container.querySelector('#btn-header-clear-all');
  if (clearAllBtn && user) {
    clearAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      clearAllBtn.textContent = 'Clearing...';
      await store.clearAllMyNotifications(user.id);
    });
  }

  container.querySelectorAll('.btn-dismiss-notif').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const notifId = btn.dataset.notifId;
      btn.textContent = '...';
      await store.clearNotification(notifId);
    });
  });

  const logoutBtn = container.querySelector('#nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await store.logout();
      sessionStorage.removeItem('yta_team_channel_id');
      sessionStorage.removeItem('yta_team_video_num');
      navigate('#/landing');
    });
  }
}
