import { store } from '../lib/store.js';

let isCollapsed = localStorage.getItem('yta_admin_sidebar_collapsed') === 'true';
let isMobileOpen = false;

export function renderAdminSidebar(container, currentHash, navigate) {
  const navItems = [
    { route: '#/admin/table', label: 'Production Table', tag: 'CORE' },
    { route: '#/admin/channels', label: 'Channels', tag: 'ADD' },
    { route: '#/admin/titles', label: 'Titles', tag: 'ADD' },
    { route: '#/admin/roles', label: 'Roles & Prompts', tag: 'ADD' },
    { route: '#/admin/members', label: 'Team Members', tag: 'ADD' },
    { route: '#/admin/database', label: 'Database / Ledger', tag: 'VIEW' },
    { route: '#/admin/realtime', label: 'Real-Time Updates', tag: 'LIVE' }
  ];

  const navLinksHtml = navItems
    .map((item) => {
      const isActive = currentHash === item.route;
      return `
        <button class="sidebar-item ${isActive ? 'active' : ''}" data-route="${item.route}" title="${item.label}">
          <span class="sidebar-tag">${item.tag}</span>
          <span class="sidebar-label">${item.label}</span>
        </button>
      `;
    })
    .join('');

  container.innerHTML = `
    <!-- Mobile Backdrop -->
    <div class="sidebar-backdrop ${isMobileOpen ? 'show' : ''}" id="sidebar-backdrop"></div>

    <aside class="admin-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'open-mobile' : ''}">
      <div class="sidebar-header">
        <div class="sidebar-brand-group">
          <span class="sidebar-brand-title">YTA</span>
          <span class="sidebar-brand-subtitle">colabapp</span>
        </div>
        <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" title="${isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
          ${isCollapsed ? '→' : '←'}
        </button>
      </div>

      <nav class="sidebar-nav">
        ${navLinksHtml}
      </nav>

      <div class="sidebar-footer">
        <button class="sidebar-item logout-item" id="sidebar-logout-btn" title="Logout">
          <span class="sidebar-tag" style="border-color: var(--pending-border); color: var(--pending-text);">OUT</span>
          <span class="sidebar-label">Logout</span>
        </button>
      </div>
    </aside>
  `;

  // Attach event handlers
  const toggleBtn = container.querySelector('#sidebar-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      localStorage.setItem('yta_admin_sidebar_collapsed', String(isCollapsed));
      renderAdminSidebar(container, currentHash, navigate);
    });
  }

  const backdrop = container.querySelector('#sidebar-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      isMobileOpen = false;
      renderAdminSidebar(container, currentHash, navigate);
    });
  }

  container.querySelectorAll('.sidebar-item[data-route]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const route = e.currentTarget.dataset.route;
      isMobileOpen = false;
      navigate(route);
    });
  });

  const logoutBtn = container.querySelector('#sidebar-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      isMobileOpen = false;
      store.logout();
      navigate('#/landing');
    });
  }
}

export function toggleMobileSidebar(container, currentHash, navigate) {
  isMobileOpen = !isMobileOpen;
  renderAdminSidebar(container, currentHash, navigate);
}
