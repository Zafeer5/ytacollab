import {
  store,
  downloadFileSecurely,
  openThumbnailModal,
  getChannelMemberDisplayName
} from '../../lib/store.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Determine asset fulfillment stage for Kanban grouping:
 * - 'pending-script': No script yet
 * - 'in-progress': Script submitted, but voiceover or thumbnail pending
 * - 'assets-ready': Script, voiceover, and thumbnail all present, but not marked completed
 * - 'completed': Video status marked complete
 */
function getVideoStage(video) {
  if (video.status) return 'completed';

  const hasScript = Boolean(video.script && video.script.trim());
  const hasVoiceover = Boolean(video.voiceover?.name || (video.voiceover?.url && video.voiceover.url.startsWith('http')));
  const hasThumbnail = Boolean(video.thumbnail?.name || (video.thumbnail?.url && video.thumbnail.url.startsWith('http')));

  if (hasScript && hasVoiceover && hasThumbnail) {
    return 'assets-ready';
  }
  if (hasScript) {
    return 'in-progress';
  }
  return 'pending-script';
}

/**
 * Opens a sleek, dedicated read-only video preview modal for viewing, copying, and downloading
 */
function openKanbanVideoPreviewModal(video, currentChannel, navigate) {
  const prevModal = document.getElementById('kanban-video-preview-modal');
  if (prevModal) prevModal.remove();

  const scriptStat = store.getCellStatus(video, 'script');
  const voStat = store.getCellStatus(video, 'voiceover');
  const thumbStat = store.getCellStatus(video, 'thumbnail');
  const metaStat = store.getCellStatus(video, 'metaInfo');

  const voHasValidUrl = Boolean(video.voiceover?.url && video.voiceover.url.startsWith('http'));
  const thumbHasValidUrl = Boolean(video.thumbnail?.url && video.thumbnail.url.startsWith('http'));
  const stage = getVideoStage(video);

  const backdrop = document.createElement('div');
  backdrop.id = 'kanban-video-preview-modal';
  backdrop.className = 'yta-modal-backdrop';

  const closeModal = () => {
    backdrop.classList.add('yta-modal-closing');
    backdrop.addEventListener('animationend', () => backdrop.remove(), { once: true });
    document.removeEventListener('keydown', handleKeydown);
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', handleKeydown);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  backdrop.innerHTML = `
    <div class="yta-modal-dialog kanban-preview-dialog" role="dialog" aria-modal="true" style="animation: modalPopIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
      <!-- Modal Header -->
      <div class="yta-modal-header" style="border-bottom: 1px solid var(--border); padding: 18px 22px;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
          <span class="md-video-badge" style="flex-shrink: 0;">VIDEO ${video.videoNumber}</span>
          <div style="min-width: 0;">
            <div class="yta-modal-title" style="font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(video.title)}">
              ${escapeHtml(video.title)}
            </div>
            <div class="yta-modal-subtitle" style="margin-top: 2px; font-size: 11.5px; display: flex; gap: 10px; align-items: center;">
              <span>Channel: <strong>${escapeHtml(currentChannel?.name || '')}</strong></span>
              <span>•</span>
              <span>Stage: <strong style="color: ${video.status ? 'var(--cta-orange)' : 'var(--text-secondary)'};">${escapeHtml(stage.replace('-', ' ').toUpperCase())}</strong></span>
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          ${
            video.status
              ? '<span class="status-pill-completed" style="font-size: 11px; padding: 4px 10px;">✓ Completed</span>'
              : '<span class="status-pill-pending" style="font-size: 11px; padding: 4px 10px;">⏳ In Progress</span>'
          }
          <button type="button" class="yta-modal-close" id="btn-close-preview-modal" title="Close (Esc)">✕</button>
        </div>
      </div>

      <!-- Modal Body (Scrollable Read-Only Preview) -->
      <div class="kanban-preview-body">
        <!-- 1. Title Section -->
        <div class="preview-asset-card">
          <div class="preview-asset-header">
            <span class="preview-asset-label">🏷️ Video Title</span>
            <button type="button" class="btn btn-secondary btn-sm btn-modal-copy" data-copy-text="${encodeURIComponent(video.title)}">
              Copy Title
            </button>
          </div>
          <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); line-height: 1.4; padding: 4px 0;">
            ${escapeHtml(video.title)}
          </div>
        </div>

        <!-- 2. Video Script -->
        <div class="preview-asset-card">
          <div class="preview-asset-header">
            <span class="preview-asset-label">
              📝 Video Script
              ${
                scriptStat.status === 'pending'
                  ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                  : '<span style="color: var(--success-text); font-size: 10.5px; margin-left: 6px;">✓ submitted</span>'
              }
            </span>
            <button 
              type="button" 
              class="btn btn-secondary btn-sm btn-modal-copy" 
              data-copy-text="${encodeURIComponent(video.script || '')}" 
              ${!video.script ? 'disabled' : ''}
            >
              Copy Script
            </button>
          </div>
          ${
            video.script && video.script.trim()
              ? `<div class="preview-text-box">${escapeHtml(video.script)}</div>`
              : `<div style="padding: 12px; border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                   <span class="badge-pending">pending</span> No script has been submitted for this video yet.
                 </div>`
          }
        </div>

        <!-- 3. Voiceover Audio -->
        <div class="preview-asset-card">
          <div class="preview-asset-header">
            <span class="preview-asset-label">
              🎙️ Voiceover Audio Asset
              ${
                voStat.status === 'pending'
                  ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                  : '<span style="color: var(--success-text); font-size: 10.5px; margin-left: 6px;">✓ submitted</span>'
              }
            </span>
            ${
              voHasValidUrl
                ? `
              <button 
                type="button" 
                class="btn btn-secondary btn-sm btn-modal-download-secure" 
                data-url="${escapeHtml(video.voiceover.url)}" 
                data-filename="${escapeHtml(video.voiceover.name)}"
              >
                📥 Download Audio
              </button>
            `
                : ''
            }
          </div>
          ${
            video.voiceover && voHasValidUrl
              ? `
            <div class="sleek-audio-card" style="padding: 10px 14px;">
              <div class="sleek-audio-info">
                <div class="sleek-audio-icon">🎵</div>
                <div style="min-width: 0;">
                  <div class="sleek-audio-name" title="${escapeHtml(video.voiceover.name)}">
                    ${escapeHtml(video.voiceover.name)}
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted);">Audio file ready for playback</div>
                </div>
              </div>
              <audio controls src="${escapeHtml(video.voiceover.url)}" preload="none" class="sleek-audio-player"></audio>
            </div>
          `
              : `
            <div style="padding: 12px; border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
              <span class="badge-pending">pending</span> No voiceover file has been uploaded for this video.
            </div>
          `
          }
        </div>

        <!-- 4. Thumbnail Asset -->
        <div class="preview-asset-card">
          <div class="preview-asset-header">
            <span class="preview-asset-label">
              🖼️ Thumbnail Asset
              ${
                thumbStat.status === 'pending'
                  ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                  : '<span style="color: var(--success-text); font-size: 10.5px; margin-left: 6px;">✓ submitted</span>'
              }
            </span>
            ${
              thumbHasValidUrl
                ? `
              <div style="display: flex; gap: 8px;">
                <button 
                  type="button" 
                  class="btn btn-secondary btn-sm btn-modal-preview-thumb" 
                  data-url="${escapeHtml(video.thumbnail.url)}" 
                  data-filename="${escapeHtml(video.thumbnail.name)}"
                >
                  🔍 View Fullscreen
                </button>
                <button 
                  type="button" 
                  class="btn btn-secondary btn-sm btn-modal-download-secure" 
                  data-url="${escapeHtml(video.thumbnail.url)}" 
                  data-filename="${escapeHtml(video.thumbnail.name)}"
                >
                  📥 Download
                </button>
              </div>
            `
                : ''
            }
          </div>
          ${
            video.thumbnail && thumbHasValidUrl
              ? `
            <div class="thumbnail-preview-card" style="padding: 12px;">
              <div 
                class="thumbnail-img-box btn-modal-preview-thumb" 
                data-url="${escapeHtml(video.thumbnail.url)}" 
                data-filename="${escapeHtml(video.thumbnail.name)}"
                style="width: 200px;"
                title="Click to enlarge"
              >
                <img src="${escapeHtml(video.thumbnail.url)}" alt="thumbnail" loading="lazy" />
                <div class="thumbnail-img-overlay">Enlarge</div>
              </div>
              <div class="thumbnail-meta">
                <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); word-break: break-all;">
                  ${escapeHtml(video.thumbnail.name)}
                </div>
                <div style="font-size: 11.5px; color: var(--text-muted);">
                  YouTube production thumbnail image uploaded.
                </div>
              </div>
            </div>
          `
              : `
            <div style="padding: 12px; border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
              <span class="badge-pending">pending</span> Thumbnail preview is pending upload.
            </div>
          `
          }
        </div>

        <!-- 5. SEO Meta Description -->
        <div class="preview-asset-card">
          <div class="preview-asset-header">
            <span class="preview-asset-label">
              📋 SEO Meta Info / Description
              ${
                metaStat.status === 'pending'
                  ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                  : '<span style="color: var(--success-text); font-size: 10.5px; margin-left: 6px;">✓ submitted</span>'
              }
            </span>
            <button 
              type="button" 
              class="btn btn-secondary btn-sm btn-modal-copy" 
              data-copy-text="${encodeURIComponent(video.metaInfo || '')}" 
              ${!video.metaInfo ? 'disabled' : ''}
            >
              Copy Meta
            </button>
          </div>
          ${
            video.metaInfo && video.metaInfo.trim()
              ? `<div class="preview-text-box">${escapeHtml(video.metaInfo)}</div>`
              : `
            <div style="padding: 12px; border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
              <span class="badge-pending">pending</span> No SEO meta description submitted yet.
            </div>
          `
          }
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="yta-modal-footer" style="padding: 14px 22px; justify-content: space-between;">
        <div style="font-size: 11.5px; color: var(--text-muted);">
          To upload or modify files for this video, use the Direct Submission page.
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-close-action">
            Close
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-modal-goto-submit" style="background: var(--cta-orange); color: #000; font-weight: 700;">
            Upload / Submit Assets ➔
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Wire events
  backdrop.querySelector('#btn-close-preview-modal').addEventListener('click', closeModal);
  backdrop.querySelector('#btn-modal-close-action').addEventListener('click', closeModal);

  // Goto submit page preselecting this video
  const gotoSubmitBtn = backdrop.querySelector('#btn-modal-goto-submit');
  if (gotoSubmitBtn && currentChannel) {
    gotoSubmitBtn.addEventListener('click', () => {
      sessionStorage.setItem('yta_admin_submit_video_num', String(video.videoNumber));
      localStorage.setItem('yta_admin_submit_channel_id', currentChannel.id);
      closeModal();
      navigate('#/admin/submit');
    });
  }

  // Copy buttons
  backdrop.querySelectorAll('.btn-modal-copy').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const raw = decodeURIComponent(e.target.dataset.copyText || '');
      if (!raw) return;
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

  // Secure download
  backdrop.querySelectorAll('.btn-modal-download-secure').forEach((btn) => {
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
        console.error('Download failed:', err);
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    });
  });

  // Thumbnail preview modal
  backdrop.querySelectorAll('.btn-modal-preview-thumb').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = btn.dataset.url;
      const filename = btn.dataset.filename || 'thumbnail.png';
      if (url) openThumbnailModal(url, filename);
    });
  });
}

export function renderAdminProductionTableView(container, navigate) {
  let selectedChannelId = localStorage.getItem('yta_selected_channel_id') || '';
  // Default view is now Kanban Pipeline View!
  let currentView = localStorage.getItem('yta_pipeline_view') || 'kanban';
  if (currentView === 'master-detail') {
    currentView = 'kanban';
  }

  let selectedVideoIds = new Set();
  let expandedAccordionIds = new Set();
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

    const areAllSelected =
      channelVideos.length > 0 && channelVideos.every((v) => selectedVideoIds.has(v.id));

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
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>${escapeHtml(
            c.name
          )} (${getChannelMemberDisplayName(c, channels)})</option>`
      )
      .join('');

    // --- VIEW GENERATORS ---

    // 1. KANBAN PIPELINE VIEW (Default Primary View)
    function renderKanbanView() {
      if (channelVideos.length === 0) return '';

      const lanes = [
        { id: 'pending-script', title: 'Pending Script', icon: '📝' },
        { id: 'in-progress', title: 'In Progress', icon: '⏳' },
        { id: 'assets-ready', title: 'Assets Ready', icon: '📦' },
        { id: 'completed', title: 'Completed', icon: '✅' }
      ];

      const laneVideos = {
        'pending-script': [],
        'in-progress': [],
        'assets-ready': [],
        completed: []
      };

      channelVideos.forEach((v) => {
        const stage = getVideoStage(v);
        if (laneVideos[stage]) {
          laneVideos[stage].push(v);
        } else {
          laneVideos['in-progress'].push(v);
        }
      });

      const lanesHtml = lanes
        .map((lane) => {
          const vids = laneVideos[lane.id] || [];
          const cardsHtml = vids
            .map((video) => {
              const scriptStat = store.getCellStatus(video, 'script');
              const voStat = store.getCellStatus(video, 'voiceover');
              const thumbStat = store.getCellStatus(video, 'thumbnail');
              const metaStat = store.getCellStatus(video, 'metaInfo');

              const thumbUrl =
                video.thumbnail?.url && video.thumbnail.url.startsWith('http')
                  ? video.thumbnail.url
                  : null;

              return `
                <div class="kanban-card" draggable="true" data-video-id="${video.id}" title="Click to view details & assets">
                  <div class="kanban-card-top">
                    <span class="md-video-num">Video ${video.videoNumber}</span>
                    <input 
                      type="checkbox" 
                      class="video-status-check" 
                      data-video-id="${video.id}" 
                      ${video.status ? 'checked' : ''} 
                      title="Toggle completed status"
                      style="cursor: pointer; width: 14px; height: 14px;" 
                    />
                  </div>

                  <div class="kanban-card-title" title="${escapeHtml(video.title)}">
                    ${escapeHtml(video.title)}
                  </div>

                  ${
                    thumbUrl
                      ? `
                    <div class="kanban-card-thumb">
                      <img src="${escapeHtml(thumbUrl)}" alt="thumbnail" loading="lazy" />
                    </div>
                  `
                      : `
                    <div class="kanban-card-thumb" style="color: var(--text-muted); font-size: 11px;">
                      <span class="badge-pending">Thumbnail Pending</span>
                    </div>
                  `
                  }

                  <div class="md-asset-dots">
                    <span class="md-asset-dot ${scriptStat.status === 'pending' ? 'pending' : 'fulfilled'}">SCR</span>
                    <span class="md-asset-dot ${voStat.status === 'pending' ? 'pending' : 'fulfilled'}">VO</span>
                    <span class="md-asset-dot ${thumbStat.status === 'pending' ? 'pending' : 'fulfilled'}">THM</span>
                    <span class="md-asset-dot ${metaStat.status === 'pending' ? 'pending' : 'fulfilled'}">MET</span>
                  </div>

                  <div class="kanban-card-footer">
                    <span style="font-size: 10.5px; color: var(--text-muted);">
                      ${video.status ? '<strong style="color: var(--cta-orange);">Done</strong>' : 'In Pipeline'}
                    </span>
                    <button 
                      type="button" 
                      class="btn btn-secondary btn-sm btn-open-preview" 
                      data-video-id="${video.id}" 
                      style="padding: 2px 8px; font-size: 10.5px;"
                    >
                      🔍 View Assets
                    </button>
                  </div>
                </div>
              `;
            })
            .join('');

          return `
            <div class="kanban-col" data-lane-id="${lane.id}">
              <div class="kanban-col-header">
                <span class="kanban-col-title">
                  <span>${lane.icon}</span> ${lane.title}
                </span>
                <span class="kanban-col-count">${vids.length}</span>
              </div>
              <div class="kanban-col-cards">
                ${
                  vids.length > 0
                    ? cardsHtml
                    : '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 11.5px; border: 1px dashed var(--border); border-radius: 6px;">No videos in this stage</div>'
                }
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="kanban-board">
          ${lanesHtml}
        </div>
      `;
    }

    // 2. COMPACT TABLE VIEW (With Accordion Expandable Rows)
    function renderCompactTableView() {
      if (channelVideos.length === 0) return '';

      const tableRows = channelVideos
        .map((video) => {
          const isRowSelected = selectedVideoIds.has(video.id);
          const isExpanded = expandedAccordionIds.has(video.id);

          const titleStat = store.getCellStatus(video, 'title');
          const scriptStat = store.getCellStatus(video, 'script');
          const voStat = store.getCellStatus(video, 'voiceover');
          const thumbStat = store.getCellStatus(video, 'thumbnail');
          const metaStat = store.getCellStatus(video, 'metaInfo');

          // Title
          const titleContent =
            titleStat.status === 'pending'
              ? '<span class="badge-pending">pending</span>'
              : `
              <div class="cell-text-copy">
                <span class="truncate-text" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</span>
                <button class="btn-copy" data-copy-text="${encodeURIComponent(video.title)}">Copy</button>
              </div>
            `;

          // Script
          const scriptContent =
            scriptStat.status === 'pending'
              ? '<span class="badge-pending">pending</span>'
              : video.script
              ? `
                <div class="cell-text-copy">
                  <span class="truncate-text" title="${escapeHtml(video.script)}">${escapeHtml(video.script)}</span>
                  <button class="btn-copy" data-copy-text="${encodeURIComponent(video.script)}">Copy</button>
                </div>
              `
              : '<span class="helper-text">—</span>';

          // Voiceover
          const voHasValidUrl = Boolean(video.voiceover?.url && video.voiceover.url.startsWith('http'));
          const voContent =
            voStat.status === 'pending'
              ? '<span class="badge-pending">pending</span>'
              : video.voiceover
              ? `
                <div class="table-audio-cell">
                  <div class="table-file-row">
                    <span class="truncate-text" style="max-width: 90px; font-size: 11px;" title="${escapeHtml(video.voiceover.name)}">
                      ${escapeHtml(video.voiceover.name)}
                    </span>
                    ${
                      voHasValidUrl
                        ? `
                      <button type="button" class="btn btn-secondary btn-sm btn-download-secure" data-url="${escapeHtml(video.voiceover.url)}" data-filename="${escapeHtml(video.voiceover.name)}" title="Download audio" style="padding: 1px 6px; font-size: 10px; flex-shrink: 0;">
                        Download
                      </button>
                    `
                        : ''
                    }
                  </div>
                  ${
                    voHasValidUrl
                      ? `<audio controls src="${escapeHtml(video.voiceover.url)}" preload="none" class="table-audio-player"></audio>`
                      : '<span style="color: var(--text-muted); font-size: 10px;">(missing)</span>'
                  }
                </div>
              `
              : '<span class="helper-text">—</span>';

          // Thumbnail
          const thumbHasValidUrl = Boolean(video.thumbnail?.url && video.thumbnail.url.startsWith('http'));
          const thumbContent =
            thumbStat.status === 'pending'
              ? '<span class="badge-pending">pending</span>'
              : video.thumbnail
              ? thumbHasValidUrl
                ? `
                  <div style="display: flex; align-items: center; gap: 5px;">
                    <button type="button" class="thumb-preview-chip btn-preview-thumbnail" data-url="${escapeHtml(video.thumbnail.url)}" data-filename="${escapeHtml(video.thumbnail.name)}" title="Click to view">
                      <img src="${escapeHtml(video.thumbnail.url)}" alt="thumbnail" loading="lazy" />
                      <span class="thumb-chip-name">${escapeHtml(video.thumbnail.name)}</span>
                      <span class="thumb-chip-action">View</span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm btn-download-secure" data-url="${escapeHtml(video.thumbnail.url)}" data-filename="${escapeHtml(video.thumbnail.name)}" title="Download" style="padding: 2px 6px; font-size: 10px; flex-shrink: 0;">
                      Download
                    </button>
                  </div>
                `
                : `<span style="color: var(--text-muted); font-size: 11px;">${escapeHtml(video.thumbnail.name)}</span>`
              : '<span class="helper-text">—</span>';

          // Meta Info
          const metaContent =
            metaStat.status === 'pending'
              ? '<span class="badge-pending">pending</span>'
              : video.metaInfo
              ? `
                <div class="cell-text-copy">
                  <span class="truncate-text" title="${escapeHtml(video.metaInfo)}">${escapeHtml(video.metaInfo)}</span>
                  <button class="btn-copy" data-copy-text="${encodeURIComponent(video.metaInfo)}">Copy</button>
                </div>
              `
              : '<span class="helper-text">—</span>';

          // Accordion Drawer Content if expanded
          const drawerRowHtml = isExpanded
            ? `
            <tr class="accordion-drawer-row">
              <td colspan="9">
                <div class="accordion-drawer-content">
                  <!-- Full Script Section -->
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">
                        📝 Full Script
                      </span>
                      <button type="button" class="btn btn-secondary btn-sm btn-copy" data-copy-text="${encodeURIComponent(video.script || '')}" ${!video.script ? 'disabled' : ''} style="padding: 1px 6px; font-size: 10px;">
                        Copy Script
                      </button>
                    </div>
                    <div style="background: #09090b; border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 12px; line-height: 1.5; max-height: 140px; overflow-y: auto; white-space: pre-wrap; color: var(--text-primary);">
                      ${escapeHtml(video.script || 'No script text submitted yet.')}
                    </div>
                  </div>

                  <!-- Full Meta Description -->
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">
                        📋 SEO Meta Info
                      </span>
                      <button type="button" class="btn btn-secondary btn-sm btn-copy" data-copy-text="${encodeURIComponent(video.metaInfo || '')}" ${!video.metaInfo ? 'disabled' : ''} style="padding: 1px 6px; font-size: 10px;">
                        Copy Meta
                      </button>
                    </div>
                    <div style="background: #09090b; border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 12px; line-height: 1.5; max-height: 140px; overflow-y: auto; white-space: pre-wrap; color: var(--text-primary);">
                      ${escapeHtml(video.metaInfo || 'No meta info submitted yet.')}
                    </div>
                  </div>

                  <!-- Assets & Quick Actions -->
                  <div style="display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
                    <div>
                      <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; display: block; margin-bottom: 8px;">
                        ⚡ Quick Actions
                      </span>
                      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
                        Open full preview inspection or submit assets directly in Direct Submission.
                      </p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                      <button type="button" class="btn btn-secondary btn-sm btn-open-preview" data-video-id="${video.id}">
                        🔍 Open Preview
                      </button>
                      <button type="button" class="btn btn-primary btn-sm btn-goto-submit-for-vid" data-video-num="${video.videoNumber}">
                        Upload / Edit ➔
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          `
            : '';

          return `
            <tr class="accordion-parent-row ${isRowSelected ? 'row-selected' : ''} ${isExpanded ? 'is-expanded' : ''}">
              <td style="width: 28px; text-align: center; padding: 6px 2px;">
                <button type="button" class="btn-accordion-toggle" data-video-id="${video.id}" title="${isExpanded ? 'Collapse row details' : 'Expand row details'}">
                  ${isExpanded ? '▼' : '▶'}
                </button>
              </td>
              <td style="width: 34px; text-align: center; padding: 6px 2px;">
                <input type="checkbox" class="video-select-check" data-video-id="${video.id}" ${isRowSelected ? 'checked' : ''} style="cursor: pointer; width: 14px; height: 14px;" />
              </td>
              <td style="width: 64px; font-weight: 700; text-align: center; color: var(--text-primary); padding: 6px 4px;">Video ${video.videoNumber}</td>
              <td style="width: 22%;">${titleContent}</td>
              <td style="width: 21%;">${scriptContent}</td>
              <td style="width: 14%;">${voContent}</td>
              <td style="width: 14%;">${thumbContent}</td>
              <td style="width: 21%;">${metaContent}</td>
              <td style="width: 50px; text-align: center; padding: 6px 2px;">
                <input type="checkbox" class="video-status-check" data-video-id="${video.id}" ${video.status ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;" />
              </td>
            </tr>
            ${drawerRowHtml}
          `;
        })
        .join('');

      return `
        <div class="card" style="padding: 0; overflow: hidden; border: 1px solid var(--border);">
          <div class="master-table-container">
            <table class="data-table master-table compact-table">
              <thead>
                <tr>
                  <th style="width: 28px; text-align: center; padding: 6px 2px;"></th>
                  <th style="width: 34px; text-align: center; padding: 6px 2px;">
                    <input type="checkbox" id="check-all-videos" ${areAllSelected ? 'checked' : ''} title="Select all" style="cursor: pointer; width: 14px; height: 14px;" />
                  </th>
                  <th style="width: 64px; text-align: center; padding: 6px 4px;">Video #</th>
                  <th style="width: 22%;">Titles</th>
                  <th style="width: 21%;">Script</th>
                  <th style="width: 14%;">Voiceover</th>
                  <th style="width: 14%;">Thumbnail</th>
                  <th style="width: 21%;">Meta Info</th>
                  <th style="width: 50px; text-align: center; padding: 6px 2px;">Status</th>
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

    // Determine main view content based on empty state or active view
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
          <h2>No Video Titles for "${escapeHtml(currentChannel.name)}"</h2>
          <p class="helper-text" style="margin-bottom: 16px;">
            This channel currently has no video entries. Paste your video titles line-by-line to populate the production table.
          </p>
          <button id="empty-goto-titles" class="btn btn-primary">Add Titles to Channel</button>
        </div>
      `;
    } else {
      if (currentView === 'compact-table') {
        mainContentHtml = renderCompactTableView();
      } else {
        mainContentHtml = renderKanbanView();
      }
    }

    // Outer Container Render
    container.innerHTML = `
      <div class="main-content" style="max-width: 1500px;">
        ${notificationBanner ? `<div class="notification-banner">${escapeHtml(notificationBanner)}</div>` : ''}

        <!-- Top Control Bar with 2-State Segmented View Switcher -->
        <div class="card" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 14px; padding: 16px 20px;">
          <div style="flex: 1; min-width: 240px;">
            <label for="select-prod-channel" class="section-label" style="margin-bottom: 6px;">Selected YouTube Channel</label>
            <select id="select-prod-channel" ${channels.length === 0 ? 'disabled' : ''}>
              ${channelOptions || '<option value="">No channels available</option>'}
            </select>
          </div>

          <!-- View Switching Control: Kanban Pipeline (Default) & Compact Table -->
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <div class="view-toggle-group" role="tablist" aria-label="Dashboard Views">
                <button 
                  type="button" 
                  class="view-toggle-btn ${currentView === 'kanban' ? 'active' : ''}" 
                  data-view="kanban" 
                  role="tab" 
                  aria-selected="${currentView === 'kanban'}"
                  title="Kanban Fulfillment Pipeline Lanes"
                >
                  <span class="view-icon">📊</span>
                  <span>Kanban Pipeline View</span>
                </button>

                <button 
                  type="button" 
                  class="view-toggle-btn ${currentView === 'compact-table' ? 'active' : ''}" 
                  data-view="compact-table" 
                  role="tab" 
                  aria-selected="${currentView === 'compact-table'}"
                  title="Compact Table with Accordion Rows"
                >
                  <span class="view-icon">📋</span>
                  <span>Compact Table View</span>
                </button>
              </div>

              <button id="btn-send-notifications" class="btn btn-primary" ${channelVideos.length === 0 ? 'disabled' : ''}>
                send notifications
              </button>
            </div>

            <span id="select-videos-warning" class="animated-select-videos-alert" style="display: none;">
              select videos first
            </span>
          </div>
        </div>

        ${
          currentChannel && channelVideos.length > 0
            ? `
          <div class="table-meta-bar" style="margin-bottom: 14px; border-radius: 8px; border: 1px solid var(--border); background: #121216;">
            <div style="display: flex; gap: 18px; align-items: baseline; flex-wrap: wrap;">
              <span style="font-weight: 600; color: var(--text-primary);">Channel: ${escapeHtml(currentChannel.name)}</span>
              <span class="helper-text">• Total Videos: <strong style="color: var(--text-primary);">${channelVideos.length}</strong></span>
              <span class="helper-text">• Selected for Notification: <strong style="color: var(--text-primary);">${selectedVideoIds.size}</strong></span>
              <span class="helper-text">• Pending Cells: <strong style="color: ${totalPendingCells > 0 ? 'var(--pending-text)' : 'var(--text-primary)'};">${totalPendingCells}</strong></span>
              <span class="helper-text">• Completed: <strong style="color: var(--cta-orange);">${completedVideosCount} / ${channelVideos.length}</strong></span>
            </div>
          </div>
        `
            : ''
        }

        <!-- Active View Layout (Kanban or Compact Table) -->
        ${mainContentHtml}
      </div>
    `;

    // --- EVENT ATTACHMENTS ---

    // 1. Channel Selector
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

    // 2. View Toggle Segmented Control Handlers
    container.querySelectorAll('.view-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const viewMode = btn.dataset.view;
        if (viewMode && viewMode !== currentView) {
          currentView = viewMode;
          localStorage.setItem('yta_pipeline_view', currentView);
          render();
        }
      });
    });

    // 3. Select All Videos Checkbox
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

    // 4. Video Selection Checkboxes
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

    // 5. Send Notifications Action
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
        const result = await store.sendPendingNotifications(
          selectedChannelId,
          Array.from(selectedVideoIds)
        );
        notificationBanner = result.message;
        notifBtn.disabled = false;
        notifBtn.textContent = 'send notifications';
        render();
      });
    }

    // 6. Video Status Checkbox (Universal)
    container.querySelectorAll('.video-status-check').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        e.stopPropagation();
        const vidId = e.target.dataset.videoId;
        await store.toggleVideoStatus(vidId);
        render();
      });
    });

    // 7. Open Video Details Preview Modal (from Kanban Card or button)
    container.querySelectorAll('.kanban-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Prevent opening if clicking on the status checkbox directly
        if (e.target.closest('.video-status-check')) return;
        const vidId = card.dataset.videoId;
        const vid = channelVideos.find((v) => v.id === vidId);
        if (vid && currentChannel) {
          openKanbanVideoPreviewModal(vid, currentChannel, navigate);
        }
      });
    });

    container.querySelectorAll('.btn-open-preview').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vidId = btn.dataset.videoId;
        const vid = channelVideos.find((v) => v.id === vidId);
        if (vid && currentChannel) {
          openKanbanVideoPreviewModal(vid, currentChannel, navigate);
        }
      });
    });

    // 8. Copy Buttons in Table
    container.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const raw = decodeURIComponent(e.target.dataset.copyText || '');
        if (!raw) return;
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

    // 9. Thumbnail Preview Modal in Table
    container.querySelectorAll('.btn-preview-thumbnail').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = btn.dataset.url;
        const filename = btn.dataset.filename || 'thumbnail.png';
        if (url) {
          openThumbnailModal(url, filename);
        }
      });
    });

    // 10. Secure File Download in Table
    container.querySelectorAll('.btn-download-secure').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = btn.dataset.url;
        const filename = btn.dataset.filename || 'download';
        const origText = btn.innerHTML;
        btn.textContent = 'Downloading...';
        btn.disabled = true;
        try {
          await downloadFileSecurely(url, filename);
        } catch (dlErr) {
          console.error('File download error:', dlErr);
        } finally {
          btn.innerHTML = origText;
          btn.disabled = false;
        }
      });
    });

    // 11. Compact Table Accordion Toggle
    container.querySelectorAll('.btn-accordion-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vidId = btn.dataset.videoId;
        if (expandedAccordionIds.has(vidId)) {
          expandedAccordionIds.delete(vidId);
        } else {
          expandedAccordionIds.add(vidId);
        }
        render();
      });
    });

    // 12. Accordion Quick Link to Direct Submission
    container.querySelectorAll('.btn-goto-submit-for-vid').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vNum = btn.dataset.videoNum;
        if (vNum && currentChannel) {
          sessionStorage.setItem('yta_admin_submit_video_num', String(vNum));
          localStorage.setItem('yta_admin_submit_channel_id', currentChannel.id);
          navigate('#/admin/submit');
        }
      });
    });

    // 13. Empty State Buttons
    const emptyGotoChan = container.querySelector('#empty-goto-channel');
    if (emptyGotoChan) {
      emptyGotoChan.addEventListener('click', () => navigate('#/admin/channels'));
    }

    const emptyGotoTitles = container.querySelector('#empty-goto-titles');
    if (emptyGotoTitles) {
      emptyGotoTitles.addEventListener('click', () => navigate('#/admin/titles'));
    }

    // 14. Kanban Drag and Drop Pipeline Handling
    const kanbanCols = container.querySelectorAll('.kanban-col');
    const kanbanCards = container.querySelectorAll('.kanban-card');

    kanbanCards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        const vidId = card.dataset.videoId;
        e.dataTransfer.setData('text/plain', vidId);
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });

    kanbanCols.forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });

      col.addEventListener('dragleave', () => {
        col.classList.remove('drag-over');
      });

      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const vidId = e.dataTransfer.getData('text/plain');
        const targetLane = col.dataset.laneId;

        if (vidId && targetLane) {
          if (targetLane === 'completed') {
            await store.setVideoStatus(vidId, true);
          } else {
            await store.setVideoStatus(vidId, false);
          }
          render();
        }
      });
    });
  }

  // Subscribe to external store changes
  const unsubscribe = store.subscribe(() => {
    if (container.isConnected) {
      render();
    }
  });

  render();
}
