import { store, downloadFileSecurely } from '../../lib/store.js';

export function renderAdminHomeView(container, navigate) {
  let selectedChannelId = '';
  let selectedVideoIds = new Set();
  let notificationBanner = '';

  function render() {
    const state = store.getState();
    const channels = state.channels;

    if (!selectedChannelId && channels.length > 0) {
      selectedChannelId = channels[0].id;
      selectedVideoIds.clear();
    }

    const currentChannel = channels.find((c) => c.id === selectedChannelId);
    const channelVideos = state.videos.filter((v) => v.channelId === selectedChannelId);

    // Sort videos by videoNumber
    channelVideos.sort((a, b) => a.videoNumber - b.videoNumber);

    const areAllSelected = channelVideos.length > 0 && channelVideos.every((v) => selectedVideoIds.has(v.id));

    // Build channel options
    const channelOptions = channels
      .map((c) => `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>${c.name}</option>`)
      .join('');

    // Build real-time updates list (last 5 messages)
    const realtimeItems = (state.realTimeFeed || []).slice(0, 5)
      .map((msg) => `<div class="realtime-msg">${msg.message}</div>`)
      .join('') || '<div class="helper-text">No recent updates recorded.</div>';

    // Build Team Member and Their roles list
    const teamRolesHtml = state.teamMembers
      .filter((m) => !m.isAdmin)
      .map((member) => {
        const roleCheckboxes = state.roles
          .map((role) => {
            const isChecked = (member.roles || []).includes(role.name);
            return `
              <label class="checkbox-label" style="font-size: 12px;">
                <input type="checkbox" class="member-role-toggle" data-member-id="${member.id}" data-role-name="${role.name}" ${isChecked ? 'checked' : ''} />
                ${role.name}
              </label>
            `;
          })
          .join('');

        return `
          <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-bottom: 1px solid var(--border);">
            <div style="font-weight: 600; font-size: 13px;">${member.username}</div>
            <div class="roles-grid" style="gap: 8px;">
              ${roleCheckboxes}
            </div>
          </div>
        `;
      })
      .join('');

    // Build Production Table Rows
    const tableRows = channelVideos
      .map((video) => {
        const isRowSelected = selectedVideoIds.has(video.id);

        // Pending logic checks
        const titleStat = store.getCellStatus(video, 'title');
        const scriptStat = store.getCellStatus(video, 'script');
        const voStat = store.getCellStatus(video, 'voiceover');
        const thumbStat = store.getCellStatus(video, 'thumbnail');
        const metaStat = store.getCellStatus(video, 'metaInfo');

        // Render Title cell (copyable as text)
        const titleContent = titleStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : `
            <div class="cell-text-copy">
              <span class="truncate-text" title="${video.title}">${video.title}</span>
              <button class="btn-copy" data-copy-text="${encodeURIComponent(video.title)}">Copy</button>
            </div>
          `;

        // Render Script cell (copyable as text)
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

        // Render Voiceover cell (downloadable file)
        const voContent = voStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : video.voiceover
            ? `
              <button type="button" class="btn-download btn-download-secure" data-url="${video.voiceover.url}" data-filename="${video.voiceover.name}" title="Download voiceover" style="border: none; background: transparent; cursor: pointer; text-align: left; padding: 0;">
                ${video.voiceover.name}
              </button>
            `
            : '<span class="helper-text">—</span>';

        // Render Thumbnail cell (downloadable file)
        const thumbContent = thumbStat.status === 'pending'
          ? '<span class="badge-pending">pending</span>'
          : video.thumbnail
            ? `
              <button type="button" class="btn-download btn-download-secure" data-url="${video.thumbnail.url}" data-filename="${video.thumbnail.name}" title="Download thumbnail" style="border: none; background: transparent; cursor: pointer; text-align: left; padding: 0;">
                ${video.thumbnail.name}
              </button>
            `
            : '<span class="helper-text">—</span>';

        // Render Meta Info cell (copyable as text)
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
            <td style="width: 44px; text-align: center;">
              <input type="checkbox" class="video-select-check" data-video-id="${video.id}" ${isRowSelected ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
            </td>
            <td style="font-weight: 600; white-space: nowrap;">Video ${video.videoNumber}</td>
            <td>${titleContent}</td>
            <td>${scriptContent}</td>
            <td>${voContent}</td>
            <td>${thumbContent}</td>
            <td>${metaContent}</td>
            <td style="text-align: center;">
              <input type="checkbox" class="video-status-check" data-video-id="${video.id}" ${video.status ? 'checked' : ''} />
            </td>
          </tr>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="main-content">
        ${notificationBanner ? `<div class="notification-banner">${notificationBanner}</div>` : ''}

        <!-- Channel Selector & Main Table Header -->
        <div class="card" style="display: flex; flex-direction: column; gap: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="flex: 1; min-width: 200px;">
              <label for="select-admin-channel">Select Channel</label>
              <select id="select-admin-channel">
                ${channelOptions || '<option value="">No channels available</option>'}
              </select>
            </div>
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 18px;">
              <button id="btn-send-notifications" class="btn btn-primary" ${channelVideos.length === 0 ? 'disabled' : ''}>
                send notifications
              </button>
              <span id="select-videos-warning" class="animated-select-videos-alert" style="display: none;">
                select videos first
              </span>
            </div>
          </div>

          <div style="font-size: 12px; color: var(--text-muted);">
            Rule: Select videos using the leftmost checkbox column to send targeted notifications to team members.
          </div>

          <!-- Central Working Table -->
          <div class="scrollable-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 44px; text-align: center;">
                    <input type="checkbox" id="check-all-videos" ${areAllSelected ? 'checked' : ''} title="Select / Deselect all" style="cursor: pointer; width: 16px; height: 16px;" />
                  </th>
                  <th>Video #</th>
                  <th>Titles</th>
                  <th>Script</th>
                  <th>voiceover</th>
                  <th>thumbnail</th>
                  <th>Meta Info</th>
                  <th style="text-align: center;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows || '<tr><td colspan="8" style="text-align: center; padding: 24px;" class="helper-text">No videos found for this channel. Use Add &gt; Add Titles to Channel to add videos.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Real-Time Updates Section -->
        <div class="card">
          <h2>Real-Time Updates</h2>
          <div class="realtime-list">
            ${realtimeItems}
          </div>
        </div>

        <!-- Team Member and Their roles list -->
        <div class="card">
          <h2>Team Member and Their roles list</h2>
          <div class="helper-text" style="margin-bottom: 10px;">
            Admin can check/uncheck roles; changes update the database immediately in real time.
          </div>
          <div class="scrollable-container" style="padding: 12px; max-height: 260px;">
            ${teamRolesHtml}
          </div>
        </div>
      </div>
    `;

    // Channel dropdown change
    const channelSelect = container.querySelector('#select-admin-channel');
    if (channelSelect) {
      channelSelect.addEventListener('change', (e) => {
        selectedChannelId = e.target.value;
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

    // Send notifications button
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

    // Video status checkboxes
    container.querySelectorAll('.video-status-check').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const vidId = e.target.dataset.videoId;
        await store.toggleVideoStatus(vidId);
        render();
      });
    });

    // Copy text buttons
    container.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const raw = decodeURIComponent(e.target.dataset.copyText || '');
        try {
          await navigator.clipboard.writeText(raw);
          const originalText = e.target.textContent;
          e.target.textContent = 'Copied';
          setTimeout(() => {
            e.target.textContent = originalText;
          }, 1500);
        } catch (err) {
          console.error('Clipboard copy failed:', err);
        }
      });
    });

    // Member role checkbox updates
    container.querySelectorAll('.member-role-toggle').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const memberId = e.target.dataset.memberId;
        const member = state.teamMembers.find((m) => m.id === memberId);
        if (!member) return;

        const currentRoles = [...(member.roles || [])];
        const roleName = e.target.dataset.roleName;

        let newRoles;
        if (e.target.checked) {
          newRoles = [...new Set([...currentRoles, roleName])];
        } else {
          newRoles = currentRoles.filter((r) => r !== roleName);
        }

        await store.updateMemberRoles(memberId, newRoles);
        render();
      });
    });

    // Secure in-browser file download handler
    container.querySelectorAll('.btn-download-secure').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = btn.dataset.url;
        const filename = btn.dataset.filename || 'download';
        const origText = btn.innerHTML;
        btn.textContent = 'Downloading...';
        btn.disabled = true;
        try {
          await downloadFileSecurely(url, filename);
        } catch (err) {
          console.error('Download error:', err);
        } finally {
          btn.innerHTML = origText;
          btn.disabled = false;
        }
      });
    });
  }

  render();
}
