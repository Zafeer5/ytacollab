import './index.css';
import { store } from './lib/store.js';
import { renderHeader } from './components/Header.js';
import { renderAdminSidebar } from './components/AdminSidebar.js';
import { renderLandingPage } from './views/LandingPage.js';
import { renderLoginPage } from './views/LoginPage.js';
import { renderAdminProductionTableView } from './views/admin/AdminProductionTableView.js';
import { renderAdminChannelsView } from './views/admin/AdminChannelsView.js';
import { renderAdminTitlesView } from './views/admin/AdminTitlesView.js';
import { renderAdminRolesView } from './views/admin/AdminRolesView.js';
import { renderAdminMembersView } from './views/admin/AdminMembersView.js';
import { renderAdminDatabaseView } from './views/admin/AdminDatabaseView.js';
import { renderAdminRealtimeView } from './views/admin/AdminRealtimeView.js';
import { renderTeamMemberView } from './views/team/TeamMemberView.js';

const appEl = document.getElementById('app');

function getNormalizedHash() {
  const hash = window.location.hash.trim();
  return hash || '';
}

function navigate(targetHash) {
  if (window.location.hash === targetHash) {
    handleRoute();
  } else {
    window.location.hash = targetHash;
  }
}

function handleRoute() {
  const state = store.getState();
  const user = state.currentUser;
  let hash = getNormalizedHash();

  // Redirect logic for unauthenticated users
  if (!user) {
    if (hash !== '#/login' && hash !== '#/landing' && hash !== '#/') {
      hash = '#/landing';
      window.location.hash = hash;
    }
  } else if (user.role === 'ADMIN') {
    // If admin is on landing/login/empty, redirect to production table
    if (!hash || hash === '#/' || hash === '#/landing' || hash === '#/login' || hash === '#/team') {
      hash = '#/admin/table';
      window.location.hash = hash;
    }
  } else if (user.role === 'TEAM_MEMBER') {
    // If team member tries to access admin route or landing/login, redirect to team view
    if (!hash || hash.startsWith('#/admin') || hash === '#/' || hash === '#/landing' || hash === '#/login') {
      hash = '#/team';
      window.location.hash = hash;
    }
  }

  // 1. Unauthenticated / Public Pages
  if (!user || hash === '#/landing' || hash === '#/' || hash === '#/login') {
    appEl.innerHTML = `
      <div id="header-mount"></div>
      <div id="view-mount"></div>
    `;

    const headerMount = document.getElementById('header-mount');
    const viewMount = document.getElementById('view-mount');

    renderHeader(headerMount, hash === '#/login' ? 'login' : 'landing', navigate);

    if (hash === '#/login') {
      renderLoginPage(viewMount, navigate);
    } else {
      renderLandingPage(viewMount, navigate);
    }
    return;
  }

  // 2. Admin Portal with Collapsible Sidebar
  if (user.role === 'ADMIN') {
    appEl.innerHTML = `
      <div id="header-mount"></div>
      <div class="admin-layout">
        <div id="sidebar-mount"></div>
        <main class="admin-main" id="admin-view-mount"></main>
      </div>
    `;

    const headerMount = document.getElementById('header-mount');
    const sidebarMount = document.getElementById('sidebar-mount');
    const adminViewMount = document.getElementById('admin-view-mount');

    renderHeader(headerMount, hash, navigate);
    renderAdminSidebar(sidebarMount, hash, navigate);

    switch (hash) {
      case '#/admin/table':
        renderAdminProductionTableView(adminViewMount, navigate);
        break;

      case '#/admin/channels':
        renderAdminChannelsView(adminViewMount, navigate);
        break;

      case '#/admin/titles':
        renderAdminTitlesView(adminViewMount, navigate);
        break;

      case '#/admin/roles':
        renderAdminRolesView(adminViewMount, navigate);
        break;

      case '#/admin/members':
        renderAdminMembersView(adminViewMount, navigate);
        break;

      case '#/admin/database':
        renderAdminDatabaseView(adminViewMount, navigate);
        break;

      case '#/admin/realtime':
        renderAdminRealtimeView(adminViewMount, navigate);
        break;

      default:
        renderAdminProductionTableView(adminViewMount, navigate);
        break;
    }
    return;
  }

  // 3. Team Member View
  if (user.role === 'TEAM_MEMBER') {
    appEl.innerHTML = `
      <div id="header-mount"></div>
      <div id="view-mount"></div>
    `;

    const headerMount = document.getElementById('header-mount');
    const viewMount = document.getElementById('view-mount');

    renderHeader(headerMount, 'team-member', navigate);
    renderTeamMemberView(viewMount, navigate);
  }
}

// Listen to Hash Changes
window.addEventListener('hashchange', handleRoute);

// Re-render in place on store updates
store.subscribe(() => {
  handleRoute();
});

// Service Worker Registration
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('ServiceWorker registered with scope: ', reg.scope);
      })
      .catch((err) => {
        console.warn('ServiceWorker registration failed: ', err);
      });
  });
}

// Initial Navigation
if (!window.location.hash) {
  const initialUser = store.getState().currentUser;
  if (initialUser) {
    window.location.hash = initialUser.role === 'ADMIN' ? '#/admin/table' : '#/team';
  } else {
    window.location.hash = '#/landing';
  }
} else {
  handleRoute();
}
