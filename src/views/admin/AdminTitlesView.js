import { store } from '../../lib/store.js';

export function renderAdminTitlesView(container, navigate) {
  let selectedChanId = localStorage.getItem('yta_selected_titles_channel') || '';
  let draftTitlesText = sessionStorage.getItem('yta_titles_draft_text') || '';
  let feedbackMessage = '';

  function render() {
    const state = store.getState();
    const channels = state.channels || [];

    if (channels.length > 0) {
      if (!selectedChanId || !channels.some((c) => c.id === selectedChanId)) {
        selectedChanId = channels[0].id;
        localStorage.setItem('yta_selected_titles_channel', selectedChanId);
      }
    } else {
      selectedChanId = '';
    }

    const currentChannel = channels.find((c) => c.id === selectedChanId);
    const existingVideos = currentChannel
      ? state.videos.filter((v) => v.channelId === selectedChanId).sort((a, b) => a.videoNumber - b.videoNumber)
      : [];

    const channelOptions = channels
      .map((c) => `<option value="${c.id}" ${c.id === selectedChanId ? 'selected' : ''}>${c.name}</option>`)
      .join('');

    const titlesListHtml = existingVideos
      .map((v) => `
        <div style="display: flex; align-items: baseline; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border);">
          <span style="font-weight: 700; color: var(--text-primary); width: 80px; flex-shrink: 0;">Video ${v.videoNumber}</span>
          <span style="font-weight: 500; color: var(--text-secondary);">${v.title}</span>
        </div>
      `)
      .join('');

    let bodyHtml = '';

    if (channels.length === 0) {
      bodyHtml = `
        <div class="card empty-state-box">
          <h2>No Channels Available</h2>
          <p class="helper-text" style="margin-bottom: 16px;">
            You need to create a YouTube channel before adding video titles.
          </p>
          <button id="btn-goto-create-channel" class="btn btn-primary">Go to Channels</button>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="card">
          <h2>Add Titles to Channel</h2>
          <form id="add-titles-form" style="margin-bottom: 24px;">
            <div class="form-group">
              <label for="titles-channel-select">Select Channel</label>
              <select id="titles-channel-select">
                ${channelOptions}
              </select>
            </div>

            <div class="form-group">
              <label for="titles-textarea">Paste titles line-by-line</label>
              <textarea id="titles-textarea" rows="6" placeholder="Paste titles line-by-line here...&#10;First Video Title&#10;Second Video Title&#10;Third Video Title" required>${draftTitlesText}</textarea>
            </div>

            <button type="submit" class="btn btn-primary">Save and Submit</button>
          </form>

          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <h3>Existing Video Titles</h3>
            <span class="helper-text">Total: ${existingVideos.length} videos</span>
          </div>

          <div class="scrollable-container" style="max-height: 400px;">
            ${titlesListHtml || '<div style="padding: 20px; text-align: center;" class="helper-text">No titles added for this channel yet.</div>'}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary);">${feedbackMessage}</div>` : ''}
        ${bodyHtml}
      </div>
    `;

    // Handlers
    const gotoChanBtn = container.querySelector('#btn-goto-create-channel');
    if (gotoChanBtn) {
      gotoChanBtn.addEventListener('click', () => navigate('#/admin/channels'));
    }

    const chanSelect = container.querySelector('#titles-channel-select');
    if (chanSelect) {
      chanSelect.addEventListener('change', (e) => {
        selectedChanId = e.target.value;
        localStorage.setItem('yta_selected_titles_channel', selectedChanId);
        feedbackMessage = '';
        render();
      });
    }

    const textarea = container.querySelector('#titles-textarea');
    if (textarea) {
      textarea.addEventListener('input', (e) => {
        draftTitlesText = e.target.value;
        sessionStorage.setItem('yta_titles_draft_text', draftTitlesText);
      });
    }

    const titlesForm = container.querySelector('#add-titles-form');
    if (titlesForm) {
      titlesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = titlesForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        const rawText = textarea ? textarea.value : '';
        const res = await store.addTitlesToChannel(selectedChanId, rawText);
        if (res.success) {
          feedbackMessage = `Successfully added ${res.videos.length} video title(s) to "${currentChannel.name}".`;
          draftTitlesText = '';
          sessionStorage.removeItem('yta_titles_draft_text');
          if (textarea) textarea.value = '';
        } else {
          feedbackMessage = res.error;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save and Submit';
        render();
      });
    }
  }

  render();
}
