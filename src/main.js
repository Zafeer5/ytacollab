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

let currentLayoutMode = null; // 'auth-loading', 'public', 'admin', 'team'
let currentViewHash = null;

function renderAdminViewForHash(hash, mountEl, navigate) {
  switch (hash) {
    case '#/admin/table':
      renderAdminProductionTableView(mountEl, navigate);
      break;

    case '#/admin/channels':
      renderAdminChannelsView(mountEl, navigate);
      break;

    case '#/admin/titles':
      renderAdminTitlesView(mountEl, navigate);
      break;

    case '#/admin/roles':
      renderAdminRolesView(mountEl, navigate);
      break;

    case '#/admin/members':
      renderAdminMembersView(mountEl, navigate);
      break;

    case '#/admin/database':
      renderAdminDatabaseView(mountEl, navigate);
      break;

    case '#/admin/realtime':
      renderAdminRealtimeView(mountEl, navigate);
      break;

    default:
      renderAdminProductionTableView(mountEl, navigate);
      break;
  }
}

function handleRoute() {
  const state = store.getState();
  const user = state.currentUser;
  const isAuthReady = state.isAuthInitialized;
  let hash = getNormalizedHash();

  // If user is not yet known AND auth session check is still initializing,
  // do NOT redirect to landing or pollute browser history!
  if (!user && !isAuthReady) {
    if (currentLayoutMode !== 'auth-loading') {
      appEl.innerHTML = `
        <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background-color: var(--bg); color: var(--text-primary);">
          <div style="width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div style="font-size: 13px; color: var(--text-secondary); font-weight: 500;">Restoring session...</div>
        </div>
      `;
      currentLayoutMode = 'auth-loading';
    }
    return;
  }

  // Redirect logic for confirmed unauthenticated users
  if (!user) {
    if (hash !== '#/login' && hash !== '#/landing' && hash !== '#/') {
      if (hash && hash.length > 2) {
        sessionStorage.setItem('yta_post_login_redirect', hash);
      }
      hash = '#/landing';
      window.location.hash = hash;
    }
  } else if (user.role === 'ADMIN' || user.role === 'OWNER' || user.isAdmin) {
    // If admin or owner lands on public or team routes, redirect to production table
    if (!hash || hash === '#/' || hash === '#/landing' || hash === '#/login' || hash === '#/team') {
      hash = '#/admin/table';
      window.location.hash = hash;
    }
    // Deep-links (e.g. #/admin/roles, #/admin/channels) are preserved exactly!
  } else if (user.role === 'TEAM_MEMBER') {
    // If team member is on admin or landing/login routes, redirect to team view
    if (!hash || hash.startsWith('#/admin') || hash === '#/' || hash === '#/landing' || hash === '#/login') {
      hash = '#/team';
      window.location.hash = hash;
    }
  }

  // 1. Unauthenticated / Public Pages
  if (!user || hash === '#/landing' || hash === '#/' || hash === '#/login') {
    const isPublicAlreadyMounted = currentLayoutMode === 'public' &&
      document.getElementById('header-mount') &&
      document.getElementById('view-mount');

    if (!isPublicAlreadyMounted) {
      appEl.innerHTML = `
        <div id="header-mount"></div>
        <div id="view-mount"></div>
      `;
      currentLayoutMode = 'public';
    }

    const headerMount = document.getElementById('header-mount');
    const viewMount = document.getElementById('view-mount');

    renderHeader(headerMount, hash === '#/login' ? 'login' : 'landing', navigate);

    if (hash === '#/login') {
      renderLoginPage(viewMount, navigate);
    } else {
      renderLandingPage(viewMount, navigate);
    }
    currentViewHash = hash;
    return;
  }

  // 2. Admin Portal with Collapsible Sidebar
  if (user.role === 'ADMIN' || user.role === 'OWNER' || user.isAdmin) {
    const isAdminAlreadyMounted = currentLayoutMode === 'admin' &&
      document.getElementById('header-mount') &&
      document.getElementById('sidebar-mount') &&
      document.getElementById('admin-view-mount');

    if (!isAdminAlreadyMounted) {
      appEl.innerHTML = `
        <div id="header-mount"></div>
        <div class="admin-layout">
          <div id="sidebar-mount"></div>
          <main class="admin-main" id="admin-view-mount"></main>
        </div>
      `;
      currentLayoutMode = 'admin';
    }

    const headerMount = document.getElementById('header-mount');
    const sidebarMount = document.getElementById('sidebar-mount');
    const adminViewMount = document.getElementById('admin-view-mount');

    renderHeader(headerMount, hash, navigate);
    renderAdminSidebar(sidebarMount, hash, navigate);

    renderAdminViewForHash(hash, adminViewMount, navigate);
    currentViewHash = hash;
    return;
  }

  // 3. Team Member View
  if (user.role === 'TEAM_MEMBER') {
    const isTeamAlreadyMounted = currentLayoutMode === 'team' &&
      document.getElementById('header-mount') &&
      document.getElementById('view-mount');

    if (!isTeamAlreadyMounted) {
      appEl.innerHTML = `
        <div id="header-mount"></div>
        <div id="view-mount"></div>
      `;
      currentLayoutMode = 'team';
    }

    const headerMount = document.getElementById('header-mount');
    const viewMount = document.getElementById('view-mount');

    renderHeader(headerMount, 'team-member', navigate);
    renderTeamMemberView(viewMount, navigate);
    currentViewHash = hash;
  }
}

// Listen to Hash Changes
window.addEventListener('hashchange', handleRoute);

// Re-render in place on store updates (debounced & interaction-guarded)
let storeUpdateDebounceTimer = null;
store.subscribe(() => {
  if (storeUpdateDebounceTimer) {
    clearTimeout(storeUpdateDebounceTimer);
  }
  storeUpdateDebounceTimer = setTimeout(() => {
    const activeEl = document.activeElement;
    // Guard against interrupting active typing or selection in ANY form control
    if (activeEl && (activeEl.tagName === 'SELECT' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const onInteractionDone = () => {
        activeEl.removeEventListener('blur', onInteractionDone);
        activeEl.removeEventListener('change', onInteractionDone);
        handleRoute();
      };
      activeEl.addEventListener('blur', onInteractionDone, { once: true });
      activeEl.addEventListener('change', onInteractionDone, { once: true });
      return;
    }
    handleRoute();
  }, 50);
});

// PWA Installation Handling
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
});

window.addEventListener('appinstalled', () => {
  window.deferredInstallPrompt = null;
  console.log('YTA colabapp PWA installed successfully');
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
