import { store } from '../../lib/store.js';

export function renderAdminProductionTableView(container, navigate) {
  let selectedChannelId = localStorage.getItem('yta_selected_channel_id') || '';
  let selectedVideoIds = new Set();
  let notificationBanner = '';

  function render() {
    const state = store.getState();
    const channels = state.channels || [];

    // Ensure selected channel is valid
    if (channels.length > 0) {
      if (!selectedChannelId || !channels.some((c) => c.id === selectedChannelId)) {
        selectedChannelId = channels[0].id;
        localStorage.setItem('yta_selected_channel_id', selectedChannelId);
        selectedVideoIds.clear();
      }
    } else {
      selectedChannelId = '';
      selectedVideoIds.clear();
    }

    const currentChannel = channels.find((c) => c.id === selectedChannelId);
    const channelVideos = currentChannel
      ? state.videos.filter((v) => v.channelId === selectedChannelId).sort((a, b) => a.videoNumber - b.videoNumber)
      : [];

    const areAllSelected = channelVideos.length > 0 && channelVideos.every((v) => selectedVideoIds.has(v.id));

    // Compute stats
    let totalPendingCells = 0;
    let completedVideosCount = 0;

    channelVideos.forEach((vid) => {
      if (vid.status) completedVideosCount++;
      const s1 = store.getCellStatus(vid, 'script');
      const s2 = store.getCellStatus(vid, 'voiceover');
      const s3 = store.getCellStatus(vid, 'thumbnail');
      const s4 = store.getCellStatus(vid, 'metaInfo');
      if (s1.status === 'pending') totalPendingCells++;
      if (s2.status === 'pending') totalPendingCells++;
      if (s3.status === 'pending') totalPendingCells++;
      if (s4.status === 'pending') totalPendingCells++;
    });

    // Channel dropdown options
    const channelOptions = channels
      .map((c) => `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>${c.name}</option>`)
      .join('');

    // Table rows
    const tableRows = channelVideos
      .map((video) => {
        const isRowSelected = selectedVideoIds.has(video.id);
        const titleStat = store.getCellStatus(video, 'title');
        const scriptStat = store.getCellStatus(video, 'script');
        const voStat = store.getCellStatus(video, 'voiceover');
        const thumbStat = store.getCellStatus(video, 'thumbnail');
        const metaStat = store.getCellStatus(video, 'metaInfo');

        // Title
        const titleContent = titleStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : `
            <div class="cell-text-copy">
              <span class="truncate-text" title="${video.title}">${video.title}</span>
              <button class="btn-copy" data-copy-text="${encodeURIComponent(video.title)}">Copy</button>
            </div>
          `;

        // Script
        const scriptContent = scriptStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : video.script
            ? `
              <div class="cell-text-copy">
                <span class="truncate-text" title="${video.script}">${video.script}</span>
                <button class="btn-copy" data-copy-text="${encodeURIComponent(video.script)}">Copy</button>
              </div>
            `
            : '<span class="helper-text">—</span>';

        // Voiceover
        const voContent = voStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : video.voiceover
            ? `
              <a href="${video.voiceover.url}" download="${video.voiceover.name}" class="btn-download" title="Download voiceover">
                ${video.voiceover.name}
              </a>
            `
            : '<span class="helper-text">—</span>';

        // Thumbnail
        const thumbContent = thumbStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : video.thumbnail
            ? `
              <a href="${video.thumbnail.url}" download="${video.thumbnail.name}" class="btn-download" title="Download thumbnail">
                ${video.thumbnail.name}
              </a>
            `
            : '<span class="helper-text">—</span>';

        // Meta Info
        const metaContent = metaStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : video.metaInfo
            ? `
              <div class="cell-text-copy">
                <span class="truncate-text" title="${video.metaInfo}">${video.metaInfo}</span>
                <button class="btn-copy" data-copy-text="${encodeURIComponent(video.metaInfo)}">Copy</button>
              </div>
            `
            : '<span class="helper-text">—</span>';

        return `
          <tr class="${isRowSelected ? 'row-selected' : ''}">
            <td style="width: 36px; text-align: center; padding: 6px 2px;">
              <input type="checkbox" class="video-select-check" data-video-id="${video.id}" ${isRowSelected ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;" />
            </td>
            <td style="width: 68px; font-weight: 700; text-align: center; color: var(--text-primary); padding: 6px 4px;">Video ${video.videoNumber}</td>
            <td style="width: 22%;">${titleContent}</td>
            <td style="width: 21%;">${scriptContent}</td>
            <td style="width: 14%;">${voContent}</td>
            <td style="width: 14%;">${thumbContent}</td>
            <td style="width: 21%;">${metaContent}</td>
            <td style="width: 54px; text-align: center; padding: 6px 2px;">
              <input type="checkbox" class="video-status-check" data-video-id="${video.id}" ${video.status ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;" />
            </td>
          </tr>
        `;
      })
      .join('');

    let mainContentHtml = '';

    if (channels.length === 0) {
      mainContentHtml = `
        <div class="card empty-state-box">
          <h2>No Channels Found</h2>
          <p class="helper-text" style="margin-bottom: 16px;">
            The production table requires at least one channel. Create your channel to start adding video titles and managing assets.
          </p>
          <button id="empty-goto-channel" class="btn btn-primary">Add New Channel</button>
        </div>
      `;
    } else if (channelVideos.length === 0) {
      mainContentHtml = `
        <div class="card empty-state-box">
          <h2>No Video Titles for "${currentChannel.name}"</h2>
          <p class="helper-text" style="margin-bottom: 16px;">
            This channel currently has no video entries. Paste your video titles line-by-line to populate the production table.
          </p>
          <button id="empty-goto-titles" class="btn btn-primary">Add Titles to Channel</button>
        </div>
      `;
    } else {
      mainContentHtml = `
        <div class="card" style="padding: 0; overflow: hidden; border: 1px solid var(--border);">
          <div class="table-meta-bar">
            <div style="display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap;">
              <span style="font-weight: 600; color: var(--text-primary);">Channel: ${currentChannel.name}</span>
              <span class="helper-text">• Total Videos: <strong style="color: var(--text-primary);">${channelVideos.length}</strong></span>
              <span class="helper-text">• Selected: <strong style="color: var(--text-primary);">${selectedVideoIds.size}</strong></span>
              <span class="helper-text">• Pending Cells: <strong style="color: ${totalPendingCells > 0 ? 'var(--pending-text)' : 'var(--text-primary)'};">${totalPendingCells}</strong></span>
              <span class="helper-text">• Completed: <strong style="color: var(--success-text);">${completedVideosCount} / ${channelVideos.length}</strong></span>
            </div>
            <div class="helper-text">
              Rule: Select videos using the leftmost checkbox column to send targeted notifications.
            </div>
          </div>

          <div class="master-table-container">
            <table class="data-table master-table">
              <thead>
                <tr>
                  <th style="width: 36px; text-align: center; padding: 6px 2px;">
                    <input type="checkbox" id="check-all-videos" ${areAllSelected ? 'checked' : ''} title="Select / Deselect all" style="cursor: pointer; width: 15px; height: 15px;" />
                  </th>
                  <th style="width: 68px; text-align: center; padding: 6px 4px;">Video #</th>
                  <th style="width: 22%;">Titles (copyable)</th>
                  <th style="width: 21%;">Script (copyable)</th>
                  <th style="width: 14%;">voiceover (downloadable)</th>
                  <th style="width: 14%;">thumbnail (downloadable)</th>
                  <th style="width: 21%;">Meta Info (copyable)</th>
                  <th style="width: 54px; text-align: center; padding: 6px 2px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="main-content" style="max-width: 1400px;">
        ${notificationBanner ? `<div class="notification-banner">${notificationBanner}</div>` : ''}

        <!-- Top Control Bar -->
        <div class="card" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 14px;">
          <div style="flex: 1; min-width: 240px;">
            <label for="select-prod-channel" class="section-label">Selected YouTube Channel</label>
            <select id="select-prod-channel" ${channels.length === 0 ? 'disabled' : ''}>
              ${channelOptions || '<option value="">No channels available</option>'}
            </select>
          </div>

          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button id="btn-send-notifications" class="btn btn-primary" ${channelVideos.length === 0 ? 'disabled' : ''}>
              send notifications
            </button>
            <span id="select-videos-warning" class="animated-select-videos-alert" style="display: none;">
              select videos first
            </span>
          </div>
        </div>

        <!-- Master Production Table Area -->
        ${mainContentHtml}
      </div>
    `;

    // Handlers
    const chanSelect = container.querySelector('#select-prod-channel');
    if (chanSelect) {
      chanSelect.addEventListener('change', (e) => {
        selectedChannelId = e.target.value;
        localStorage.setItem('yta_selected_channel_id', selectedChannelId);
        selectedVideoIds.clear();
        notificationBanner = '';
        render();
      });
    }

    const checkAllCb = container.querySelector('#check-all-videos');
    if (checkAllCb) {
      checkAllCb.addEventListener('change', (e) => {
        if (e.target.checked) {
          channelVideos.forEach((v) => selectedVideoIds.add(v.id));
        } else {
          selectedVideoIds.clear();
        }
        const warn = container.querySelector('#select-videos-warning');
        if (warn) warn.style.display = 'none';
        render();
      });
    }

    container.querySelectorAll('.video-select-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const vidId = e.target.dataset.videoId;
        if (e.target.checked) {
          selectedVideoIds.add(vidId);
          const warn = container.querySelector('#select-videos-warning');
          if (warn) warn.style.display = 'none';
        } else {
          selectedVideoIds.delete(vidId);
        }
        render();
      });
    });

    const notifBtn = container.querySelector('#btn-send-notifications');
    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        if (!selectedChannelId) return;

        if (selectedVideoIds.size === 0) {
          const warn = container.querySelector('#select-videos-warning');
          if (warn) {
            warn.style.display = 'inline-flex';
            warn.classList.remove('shake-active');
            void warn.offsetWidth; // Trigger reflow for animation restart
            warn.classList.add('shake-active');
          }
          return;
        }

        const warn = container.querySelector('#select-videos-warning');
        if (warn) warn.style.display = 'none';

        notifBtn.disabled = true;
        notifBtn.textContent = 'Sending...';
        const result = await store.sendPendingNotifications(selectedChannelId, Array.from(selectedVideoIds));
        notificationBanner = result.message;
        notifBtn.disabled = false;
        notifBtn.textContent = 'send notifications';
        render();
      });
    }

    const emptyGotoChan = container.querySelector('#empty-goto-channel');
    if (emptyGotoChan) {
      emptyGotoChan.addEventListener('click', () => navigate('#/admin/channels'));
    }

    const emptyGotoTitles = container.querySelector('#empty-goto-titles');
    if (emptyGotoTitles) {
      emptyGotoTitles.addEventListener('click', () => navigate('#/admin/titles'));
    }

    container.querySelectorAll('.video-status-check').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const vidId = e.target.dataset.videoId;
        await store.toggleVideoStatus(vidId);
        render();
      });
    });

    container.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const raw = decodeURIComponent(e.target.dataset.copyText || '');
        try {
          await navigator.clipboard.writeText(raw);
          const original = e.target.textContent;
          e.target.textContent = 'Copied';
          setTimeout(() => {
            e.target.textContent = original;
          }, 1200);
        } catch (err) {
          console.error('Copy failed:', err);
        }
      });
    });
  }

  render();
}
