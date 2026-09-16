export function renderLandingPage(container, navigate) {
  container.innerHTML = `
    <div class="main-content">
      <div class="landing-hero" style="max-width: 480px; margin: 30px auto; padding: 36px 28px; background-color: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); text-align: center; box-shadow: var(--shadow);">
        <div style="font-size: 44px; margin-bottom: 12px; line-height: 1;">⚡</div>
        <h1 style="font-size: 26px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.5px; color: var(--text-primary);">YTA - colabapp</h1>
        <div class="landing-intro" style="font-size: 14px; color: var(--text-muted); line-height: 1.6; margin-bottom: 28px;">
          Intro Content: Collaborative workflow application for managing YouTube channel content production. Coordinate channels, titles, scriptwriting, voiceover, thumbnails, and metadata across your creative team with an immutable ledger.
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button id="hero-login-btn" class="btn btn-primary btn-full" style="height: 46px; font-size: 15px; font-weight: 600;">
            Login
          </button>
          
          <button id="hero-install-btn" class="btn btn-secondary btn-full" style="height: 46px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Install App
          </button>
        </div>

        <div id="install-guide" style="display: none; margin-top: 18px; padding: 14px; background-color: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: var(--radius); text-align: left; font-size: 12px; color: var(--text-muted); line-height: 1.6;">
        </div>
      </div>
    </div>
  `;

  // Login button navigation
  container.querySelector('#hero-login-btn').addEventListener('click', () => {
    navigate('#/login');
  });

  // Install button interaction
  const installBtn = container.querySelector('#hero-install-btn');
  const guideEl = container.querySelector('#install-guide');

  installBtn.addEventListener('click', async () => {
    const promptEvent = window.deferredInstallPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        installBtn.innerHTML = '✓ App Installed';
        installBtn.disabled = true;
      }
      window.deferredInstallPrompt = null;
    } else {
      // Platform detection and helpful instructions
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isAndroid = /Android/.test(navigator.userAgent);

      guideEl.style.display = 'block';
      if (isIOS) {
        guideEl.innerHTML = `
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">📱 Install on iPhone / iPad:</div>
          <div>1. Tap the <strong>Share</strong> button (square icon with arrow pointing up) at the bottom of Safari.</div>
          <div>2. Scroll down and tap <strong>"Add to Home Screen"</strong>.</div>
        `;
      } else if (isAndroid) {
        guideEl.innerHTML = `
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">📱 Install on Android:</div>
          <div>1. Tap the <strong>three dots menu (⋮)</strong> in Chrome at top-right.</div>
          <div>2. Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>.</div>
        `;
      } else {
        guideEl.innerHTML = `
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">💻 Install on Desktop / Browser:</div>
          <div>Click the <strong>Install</strong> icon in the address bar (top right), or open browser menu <strong>(⋮) > "Install YTA - colabapp"</strong>.</div>
        `;
      }
    }
  });
}
