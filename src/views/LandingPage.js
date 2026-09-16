export function renderLandingPage(container, navigate) {
  container.innerHTML = `
    <div class="main-content">
      <div class="landing-hero">
        <h1 style="font-size: 24px;">YTA - colabapp</h1>
        <div class="landing-intro">
          Intro Content: Collaborative workflow application for managing YouTube channel content production. Coordinate channels, titles, scriptwriting, voiceover, thumbnails, and metadata across your creative team with an immutable ledger.
        </div>
        <div>
          <button id="hero-login-btn" class="btn btn-primary btn-full">Login</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#hero-login-btn').addEventListener('click', () => {
    navigate('#/login');
  });
}
