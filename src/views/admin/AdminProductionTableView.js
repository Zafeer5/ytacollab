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
 * Determine asset fulfillment stage for Kanban grouping and progress metrics:
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

export function renderAdminProductionTableView(container, navigate) {
  let selectedChannelId = localStorage.getItem('yta_selected_channel_id') || '';
  let currentView = localStorage.getItem('yta_pipeline_view') || 'master-detail';
  let activeVideoId = localStorage.getItem('yta_md_active_video') || '';
  let searchQuery = '';
  let selectedVideoIds = new Set();
  let expandedAccordionIds = new Set();
  let notificationBanner = '';
  let detailFeedback = null; // { type: 'success' | 'error', text: string }

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

    // Ensure active video is valid in current channel
    if (channelVideos.length > 0) {
      if (!activeVideoId || !channelVideos.some((v) => v.id === activeVideoId)) {
        activeVideoId = channelVideos[0].id;
        localStorage.setItem('yta_md_active_video', activeVideoId);
      }
    } else {
      activeVideoId = '';
    }

    const activeVideo = channelVideos.find((v) => v.id === activeVideoId) || null;

    // Filtered videos for list search
    const filteredVideos = channelVideos.filter((v) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        String(v.videoNumber).includes(q) ||
        (v.title && v.title.toLowerCase().includes(q))
      );
    });

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

    // 1. MASTER-DETAIL VIEW (Default Primary View)
    function renderMasterDetailView() {
      if (channelVideos.length === 0) return '';

      // Left sidebar video list items
      const listItemsHtml = filteredVideos
        .map((video) => {
          const isActive = video.id === activeVideoId;
          const isSelected = selectedVideoIds.has(video.id);

          const scriptStat = store.getCellStatus(video, 'script');
          const voStat = store.getCellStatus(video, 'voiceover');
          const thumbStat = store.getCellStatus(video, 'thumbnail');
          const metaStat = store.getCellStatus(video, 'metaInfo');

          return `
            <div class="md-video-item ${isActive ? 'active' : ''}" data-video-id="${video.id}">
              <input 
                type="checkbox" 
                class="video-select-check" 
                data-video-id="${video.id}" 
                ${isSelected ? 'checked' : ''} 
                title="Select for notification"
                style="cursor: pointer; width: 14px; height: 14px; flex-shrink: 0;"
              />
              <div class="md-video-meta" data-select-row="${video.id}">
                <div class="md-video-top-line">
                  <span class="md-video-num">Video ${video.videoNumber}</span>
                  ${
                    video.status
                      ? '<span style="color: var(--cta-orange); font-size: 11px; font-weight: 700;">✓ Done</span>'
                      : '<span style="color: var(--text-muted); font-size: 10.5px;">Pending</span>'
                  }
                </div>
                <div class="md-video-title" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</div>
                <div class="md-asset-dots">
                  <span class="md-asset-dot ${scriptStat.status === 'pending' ? 'pending' : 'fulfilled'}" title="Script: ${scriptStat.status}">SCR</span>
                  <span class="md-asset-dot ${voStat.status === 'pending' ? 'pending' : 'fulfilled'}" title="Voiceover: ${voStat.status}">VO</span>
                  <span class="md-asset-dot ${thumbStat.status === 'pending' ? 'pending' : 'fulfilled'}" title="Thumbnail: ${thumbStat.status}">THM</span>
                  <span class="md-asset-dot ${metaStat.status === 'pending' ? 'pending' : 'fulfilled'}" title="Meta Info: ${metaStat.status}">MET</span>
                </div>
              </div>
              <input 
                type="checkbox" 
                class="video-status-check" 
                data-video-id="${video.id}" 
                ${video.status ? 'checked' : ''} 
                title="Mark status complete"
                style="cursor: pointer; width: 15px; height: 15px; flex-shrink: 0;"
              />
            </div>
          `;
        })
        .join('');

      // Right detail panel for active video
      let detailContentHtml = '';

      if (!activeVideo) {
        detailContentHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); text-align: center; padding: 40px;">
            <div style="font-size: 36px; margin-bottom: 12px;">📑</div>
            <h3 style="color: var(--text-primary); margin-bottom: 6px;">Select a Video from the Left Sidebar</h3>
            <p style="font-size: 13px; max-width: 380px;">Choose any video entry to view its script, listen to voiceover audio, preview thumbnails, and edit metadata.</p>
          </div>
        `;
      } else {
        const titleStat = store.getCellStatus(activeVideo, 'title');
        const scriptStat = store.getCellStatus(activeVideo, 'script');
        const voStat = store.getCellStatus(activeVideo, 'voiceover');
        const thumbStat = store.getCellStatus(activeVideo, 'thumbnail');
        const metaStat = store.getCellStatus(activeVideo, 'metaInfo');

        const voHasValidUrl = Boolean(activeVideo.voiceover?.url && activeVideo.voiceover.url.startsWith('http'));
        const thumbHasValidUrl = Boolean(activeVideo.thumbnail?.url && activeVideo.thumbnail.url.startsWith('http'));

        detailContentHtml = `
          <!-- Active Video Header -->
          <div class="md-panel-header">
            <div class="md-panel-title-area">
              <span class="md-video-badge">VIDEO ${activeVideo.videoNumber}</span>
              <div>
                <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">
                  ${escapeHtml(activeVideo.title)}
                </h2>
                <div style="font-size: 11.5px; color: var(--text-muted); display: flex; gap: 12px;">
                  <span>Channel: <strong>${escapeHtml(currentChannel.name)}</strong></span>
                  <span>Stage: <strong style="color: ${activeVideo.status ? 'var(--cta-orange)' : 'var(--text-secondary)'};">${escapeHtml(getVideoStage(activeVideo).replace('-', ' ').toUpperCase())}</strong></span>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              <button 
                type="button" 
                class="btn ${activeVideo.status ? 'btn-primary' : 'btn-secondary'} btn-sm btn-toggle-active-status" 
                data-video-id="${activeVideo.id}"
                style="${activeVideo.status ? 'background: var(--cta-orange); color: #000; font-weight: 700;' : ''}"
              >
                ${activeVideo.status ? '✓ Completed' : '⏳ Mark as Completed'}
              </button>
            </div>
          </div>

          ${
            detailFeedback
              ? `
            <div class="feedback-alert ${detailFeedback.type === 'success' ? 'feedback-success' : 'feedback-error'}" style="margin: 0; padding: 10px 14px; font-size: 12.5px;">
              ${escapeHtml(detailFeedback.text)}
            </div>
          `
              : ''
          }

          <!-- 1. Title Field (Editable Input) -->
          <div class="md-detail-card">
            <div class="md-card-header">
              <span class="md-card-label">
                <span>🏷️</span> Video Title
              </span>
              <div class="md-card-actions">
                <button type="button" class="btn btn-secondary btn-sm btn-copy" data-copy-text="${encodeURIComponent(activeVideo.title)}">
                  Copy
                </button>
                <button type="button" class="btn btn-primary btn-sm btn-save-detail-title" data-video-id="${activeVideo.id}">
                  Save Title
                </button>
              </div>
            </div>
            <input 
              type="text" 
              id="md-input-title" 
              class="md-title-input" 
              value="${escapeHtml(activeVideo.title)}" 
              placeholder="Enter video title..." 
            />
          </div>

          <!-- 2. Script Box (Spacious Textarea with Copy) -->
          <div class="md-detail-card">
            <div class="md-card-header">
              <span class="md-card-label">
                <span>📝</span> Video Script
                ${
                  scriptStat.status === 'pending'
                    ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                    : '<span style="color: var(--success-text); font-size: 11px; margin-left: 6px;">✓ submitted</span>'
                }
              </span>
              <div class="md-card-actions">
                <button 
                  type="button" 
                  class="btn btn-secondary btn-sm btn-copy" 
                  data-copy-text="${encodeURIComponent(activeVideo.script || '')}"
                  ${!activeVideo.script ? 'disabled' : ''}
                >
                  Copy Script
                </button>
                <button type="button" class="btn btn-primary btn-sm btn-save-detail-script" data-video-id="${activeVideo.id}">
                  Save Script
                </button>
              </div>
            </div>
            <textarea 
              id="md-textarea-script" 
              class="md-textarea" 
              rows="7" 
              placeholder="${scriptStat.status === 'pending' ? 'No script submitted yet. You can paste or draft the script here...' : 'Edit video script...'}"
            >${escapeHtml(activeVideo.script || '')}</textarea>
          </div>

          <!-- 3. Voiceover Row (Custom Sleek Audio Player + Download) -->
          <div class="md-detail-card">
            <div class="md-card-header">
              <span class="md-card-label">
                <span>🎙️</span> Voiceover Audio Asset
                ${
                  voStat.status === 'pending'
                    ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                    : '<span style="color: var(--success-text); font-size: 11px; margin-left: 6px;">✓ submitted</span>'
                }
              </span>
              ${
                voHasValidUrl
                  ? `
                <button 
                  type="button" 
                  class="btn btn-secondary btn-sm btn-download-secure" 
                  data-url="${escapeHtml(activeVideo.voiceover.url)}" 
                  data-filename="${escapeHtml(activeVideo.voiceover.name)}" 
                  title="Download voiceover"
                >
                  📥 Download Audio
                </button>
              `
                  : ''
              }
            </div>

            ${
              activeVideo.voiceover && voHasValidUrl
                ? `
              <div class="sleek-audio-card">
                <div class="sleek-audio-info">
                  <div class="sleek-audio-icon">🎵</div>
                  <div style="min-width: 0;">
                    <div class="sleek-audio-name" title="${escapeHtml(activeVideo.voiceover.name)}">
                      ${escapeHtml(activeVideo.voiceover.name)}
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                      Audio format ready for production
                    </div>
                  </div>
                </div>
                <audio controls src="${escapeHtml(activeVideo.voiceover.url)}" preload="none" class="sleek-audio-player"></audio>
              </div>
            `
                : `
              <div style="padding: 18px; border: 1px dashed var(--border); border-radius: 8px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="badge-pending">pending</span>
                  <span style="font-size: 12.5px; color: var(--text-muted);">No voiceover file has been uploaded for Video ${activeVideo.videoNumber} yet.</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm btn-goto-submit" data-task="Voiceover">
                  Upload Voiceover
                </button>
              </div>
            `
            }
          </div>

          <!-- 4. Thumbnail Section (Image Preview or Pending Badge) -->
          <div class="md-detail-card">
            <div class="md-card-header">
              <span class="md-card-label">
                <span>🖼️</span> Thumbnail Preview & Asset
                ${
                  thumbStat.status === 'pending'
                    ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                    : '<span style="color: var(--success-text); font-size: 11px; margin-left: 6px;">✓ submitted</span>'
                }
              </span>
              ${
                thumbHasValidUrl
                  ? `
                <div class="md-card-actions">
                  <button 
                    type="button" 
                    class="btn btn-secondary btn-sm btn-preview-thumbnail" 
                    data-url="${escapeHtml(activeVideo.thumbnail.url)}" 
                    data-filename="${escapeHtml(activeVideo.thumbnail.name)}"
                  >
                    🔍 View Fullscreen
                  </button>
                  <button 
                    type="button" 
                    class="btn btn-secondary btn-sm btn-download-secure" 
                    data-url="${escapeHtml(activeVideo.thumbnail.url)}" 
                    data-filename="${escapeHtml(activeVideo.thumbnail.name)}"
                  >
                    📥 Download
                  </button>
                </div>
              `
                  : ''
              }
            </div>

            ${
              activeVideo.thumbnail && thumbHasValidUrl
                ? `
              <div class="thumbnail-preview-card">
                <div 
                  class="thumbnail-img-box btn-preview-thumbnail" 
                  data-url="${escapeHtml(activeVideo.thumbnail.url)}" 
                  data-filename="${escapeHtml(activeVideo.thumbnail.name)}"
                  title="Click to view full size"
                >
                  <img src="${escapeHtml(activeVideo.thumbnail.url)}" alt="thumbnail" loading="lazy" />
                  <div class="thumbnail-img-overlay">Click to Enlarge</div>
                </div>
                <div class="thumbnail-meta">
                  <div style="font-size: 13.5px; font-weight: 600; color: var(--text-primary); word-break: break-all;">
                    ${escapeHtml(activeVideo.thumbnail.name)}
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.5;">
                    High-resolution YouTube thumbnail image uploaded and ready for publication.
                  </div>
                  <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <button 
                      type="button" 
                      class="btn btn-secondary btn-sm btn-preview-thumbnail" 
                      data-url="${escapeHtml(activeVideo.thumbnail.url)}" 
                      data-filename="${escapeHtml(activeVideo.thumbnail.name)}"
                    >
                      Enlarge Preview
                    </button>
                  </div>
                </div>
              </div>
            `
                : `
              <div style="padding: 18px; border: 1px dashed var(--border); border-radius: 8px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="badge-pending">pending</span>
                  <span style="font-size: 12.5px; color: var(--text-muted);">Thumbnail asset is pending upload for this video.</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm btn-goto-submit" data-task="Thumbnail">
                  Upload Thumbnail
                </button>
              </div>
            `
            }
          </div>

          <!-- 5. Meta Info Field (Spacious Textarea for SEO Description) -->
          <div class="md-detail-card">
            <div class="md-card-header">
              <span class="md-card-label">
                <span>📋</span> Meta Info / SEO Description
                ${
                  metaStat.status === 'pending'
                    ? '<span class="badge-pending" style="margin-left: 6px;">pending</span>'
                    : '<span style="color: var(--success-text); font-size: 11px; margin-left: 6px;">✓ submitted</span>'
                }
              </span>
              <div class="md-card-actions">
                <button 
                  type="button" 
                  class="btn btn-secondary btn-sm btn-copy" 
                  data-copy-text="${encodeURIComponent(activeVideo.metaInfo || '')}"
                  ${!activeVideo.metaInfo ? 'disabled' : ''}
                >
                  Copy Description
                </button>
                <button type="button" class="btn btn-primary btn-sm btn-save-detail-meta" data-video-id="${activeVideo.id}">
                  Save Meta Info
                </button>
              </div>
            </div>
            <textarea 
              id="md-textarea-meta" 
              class="md-textarea" 
              rows="6" 
              placeholder="${metaStat.status === 'pending' ? 'No SEO description or tags submitted yet. Paste YouTube description, hashtags, and metadata here...' : 'Edit YouTube meta description and SEO copy...'}"
            >${escapeHtml(activeVideo.metaInfo || '')}</textarea>
          </div>

          <!-- 6. Status Section (Quick Status Controls & Stage Summary) -->
          <div class="md-detail-card">
            <div class="md-card-header">
              <span class="md-card-label">
                <span>⚡</span> Production Status & State
              </span>
            </div>
            <div class="status-action-box">
              <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                <div>
                  <div style="font-size: 13.5px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">
                    Current Status:
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted);">
                    Toggle completion to reflect in reports, notifications, and pipeline analytics.
                  </div>
                </div>
                ${
                  activeVideo.status
                    ? '<span class="status-pill-completed">✓ Completed</span>'
                    : '<span class="status-pill-pending">⏳ In Progress</span>'
                }
              </div>

              <div style="display: flex; gap: 10px;">
                <button 
                  type="button" 
                  class="btn ${activeVideo.status ? 'btn-secondary' : 'btn-primary'} btn-toggle-active-status" 
                  data-video-id="${activeVideo.id}"
                  style="${!activeVideo.status ? 'background: var(--cta-orange); color: #000; font-weight: 700;' : ''}"
                >
                  ${activeVideo.status ? 'Mark In Progress' : '✓ Mark as Completed'}
                </button>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="pipeline-master-detail">
          <!-- Left Sidebar (30%) -->
          <div class="md-left-sidebar">
            <div class="md-sidebar-header">
              <div class="md-search-box">
                <span class="md-search-icon">🔍</span>
                <input 
                  type="text" 
                  id="md-search-input" 
                  class="md-search-input" 
                  placeholder="Filter videos (e.g. 1 or title)..." 
                  value="${escapeHtml(searchQuery)}"
                />
              </div>
              <div class="md-sidebar-controls">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
                  <input 
                    type="checkbox" 
                    id="check-all-videos-md" 
                    ${areAllSelected ? 'checked' : ''} 
                    style="cursor: pointer; width: 14px; height: 14px;" 
                  />
                  <span>Select All (${channelVideos.length})</span>
                </label>
                <span>Showing ${filteredVideos.length}</span>
              </div>
            </div>
            <div class="md-video-list">
              ${
                filteredVideos.length > 0
                  ? listItemsHtml
                  : '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">No matching videos found</div>'
              }
            </div>
          </div>

          <!-- Right Detail Panel (70%) -->
          <div class="md-right-panel">
            ${detailContentHtml}
          </div>
        </div>
      `;
    }

    // 2. KANBAN PIPELINE VIEW
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

              const thumbUrl = video.thumbnail?.url && video.thumbnail.url.startsWith('http') ? video.thumbnail.url : null;

              return `
                <div class="kanban-card" draggable="true" data-video-id="${video.id}">
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
                      class="btn btn-secondary btn-sm btn-open-in-md" 
                      data-video-id="${video.id}" 
                      style="padding: 2px 7px; font-size: 10.5px;"
                    >
                      Edit Detail ➔
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

    // 3. COMPACT TABLE VIEW (With Accordion Expandable Rows)
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
                        ⚡ Quick Navigation
                      </span>
                      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
                        Open this video in the Master-Detail editor for complete audio, image, and text editing.
                      </p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm btn-open-in-md" data-video-id="${video.id}" style="align-self: flex-start;">
                      Edit in Master-Detail ➔
                    </button>
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
      if (currentView === 'kanban') {
        mainContentHtml = renderKanbanView();
      } else if (currentView === 'compact-table') {
        mainContentHtml = renderCompactTableView();
      } else {
        mainContentHtml = renderMasterDetailView();
      }
    }

    // Outer Container Render
    container.innerHTML = `
      <div class="main-content" style="max-width: 1500px;">
        ${notificationBanner ? `<div class="notification-banner">${escapeHtml(notificationBanner)}</div>` : ''}

        <!-- Top Control & View-Switcher Bar -->
        <div class="card" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 14px; padding: 16px 20px;">
          <div style="flex: 1; min-width: 240px;">
            <label for="select-prod-channel" class="section-label" style="margin-bottom: 6px;">Selected YouTube Channel</label>
            <select id="select-prod-channel" ${channels.length === 0 ? 'disabled' : ''}>
              ${channelOptions || '<option value="">No channels available</option>'}
            </select>
          </div>

          <!-- View Switching Control (Top Right) -->
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <div class="view-toggle-group" role="tablist" aria-label="Dashboard Views">
                <button 
                  type="button" 
                  class="view-toggle-btn ${currentView === 'master-detail' ? 'active' : ''}" 
                  data-view="master-detail" 
                  role="tab" 
                  aria-selected="${currentView === 'master-detail'}"
                  title="Split Master-Detail Workspace"
                >
                  <span class="view-icon">📑</span>
                  <span>Master-Detail View</span>
                </button>

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

        <!-- Active View Layout (Master-Detail, Kanban, or Compact Table) -->
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
        detailFeedback = null;
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
          detailFeedback = null;
          render();
        }
      });
    });

    // 3. Select All Videos Checkbox (Compact Table & Master-Detail)
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

    const checkAllMd = container.querySelector('#check-all-videos-md');
    if (checkAllMd) {
      checkAllMd.addEventListener('change', (e) => {
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

    // 6. Master-Detail Search Input
    const searchInp = container.querySelector('#md-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        const listEl = container.querySelector('.md-video-list');
        if (listEl) {
          // Re-render list section dynamically or trigger render
          render();
          const newInp = container.querySelector('#md-search-input');
          if (newInp) {
            newInp.focus();
            newInp.setSelectionRange(searchQuery.length, searchQuery.length);
          }
        }
      });
    }

    // 7. Master-Detail Row Selection
    container.querySelectorAll('[data-select-row]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const vidId = el.dataset.selectRow;
        if (vidId && vidId !== activeVideoId) {
          activeVideoId = vidId;
          localStorage.setItem('yta_md_active_video', activeVideoId);
          detailFeedback = null;
          render();
        }
      });
    });

    // 8. Video Status Checkbox (Universal)
    container.querySelectorAll('.video-status-check').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const vidId = e.target.dataset.videoId;
        await store.toggleVideoStatus(vidId);
        render();
      });
    });

    // 9. Master-Detail Active Video Status Toggle Button
    container.querySelectorAll('.btn-toggle-active-status').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const vidId = btn.dataset.videoId;
        if (vidId) {
          await store.toggleVideoStatus(vidId);
          render();
        }
      });
    });

    // 10. Master-Detail Title Save
    const saveTitleBtn = container.querySelector('.btn-save-detail-title');
    if (saveTitleBtn) {
      saveTitleBtn.addEventListener('click', async () => {
        const vidId = saveTitleBtn.dataset.videoId;
        const titleInp = container.querySelector('#md-input-title');
        const newTitle = titleInp ? titleInp.value.trim() : '';

        if (!newTitle) {
          detailFeedback = { type: 'error', text: 'Video title cannot be empty.' };
          render();
          return;
        }

        saveTitleBtn.disabled = true;
        saveTitleBtn.textContent = 'Saving...';
        const res = await store.updateVideoTitle(vidId, newTitle);
        if (res.success) {
          detailFeedback = { type: 'success', text: '✓ Title updated successfully.' };
        } else {
          detailFeedback = { type: 'error', text: `Failed to update title: ${res.error}` };
        }
        render();
      });
    }

    // 11. Master-Detail Script Save
    const saveScriptBtn = container.querySelector('.btn-save-detail-script');
    if (saveScriptBtn && activeVideo && currentChannel) {
      saveScriptBtn.addEventListener('click', async () => {
        const scriptArea = container.querySelector('#md-textarea-script');
        const newScript = scriptArea ? scriptArea.value.trim() : '';

        if (!newScript) {
          detailFeedback = { type: 'error', text: 'Script cannot be empty.' };
          render();
          return;
        }

        saveScriptBtn.disabled = true;
        saveScriptBtn.textContent = 'Saving...';
        const res = await store.submitContent({
          channelId: currentChannel.id,
          videoNumber: activeVideo.videoNumber,
          task: 'Script',
          textValue: newScript
        });

        if (res.success) {
          detailFeedback = { type: 'success', text: '✓ Script updated and saved to database.' };
        } else {
          detailFeedback = { type: 'error', text: `Failed to save script: ${res.error}` };
        }
        render();
      });
    }

    // 12. Master-Detail Meta Info Save
    const saveMetaBtn = container.querySelector('.btn-save-detail-meta');
    if (saveMetaBtn && activeVideo && currentChannel) {
      saveMetaBtn.addEventListener('click', async () => {
        const metaArea = container.querySelector('#md-textarea-meta');
        const newMeta = metaArea ? metaArea.value.trim() : '';

        if (!newMeta) {
          detailFeedback = { type: 'error', text: 'SEO Meta description cannot be empty.' };
          render();
          return;
        }

        saveMetaBtn.disabled = true;
        saveMetaBtn.textContent = 'Saving...';
        const res = await store.submitContent({
          channelId: currentChannel.id,
          videoNumber: activeVideo.videoNumber,
          task: 'Meta Info',
          textValue: newMeta
        });

        if (res.success) {
          detailFeedback = { type: 'success', text: '✓ SEO Meta Info updated and saved to database.' };
        } else {
          detailFeedback = { type: 'error', text: `Failed to save meta info: ${res.error}` };
        }
        render();
      });
    }

    // 13. Copy Buttons
    container.querySelectorAll('.btn-copy').forEach((btn) => {
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

    // 14. Thumbnail Preview Modal
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

    // 15. Secure File Download
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

    // 16. Compact Table Accordion Toggle
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

    // 17. Switch to Master-Detail with Selected Video (from Kanban or Compact Table)
    container.querySelectorAll('.btn-open-in-md').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vidId = btn.dataset.videoId;
        if (vidId) {
          activeVideoId = vidId;
          localStorage.setItem('yta_md_active_video', activeVideoId);
          currentView = 'master-detail';
          localStorage.setItem('yta_pipeline_view', currentView);
          render();
        }
      });
    });

    // 18. Quick Redirect to Submit View for Missing Assets
    container.querySelectorAll('.btn-goto-submit').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigate('#/admin/submit');
      });
    });

    // 19. Empty State Buttons
    const emptyGotoChan = container.querySelector('#empty-goto-channel');
    if (emptyGotoChan) {
      emptyGotoChan.addEventListener('click', () => navigate('#/admin/channels'));
    }

    const emptyGotoTitles = container.querySelector('#empty-goto-titles');
    if (emptyGotoTitles) {
      emptyGotoTitles.addEventListener('click', () => navigate('#/admin/titles'));
    }

    // 20. Kanban Drag and Drop Pipeline Handling
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
            // Dragged to a pending/in-progress lane
            await store.setVideoStatus(vidId, false);
          }
          render();
        }
      });
    });
  }

  // Subscribe to external store changes
  const unsubscribe = store.subscribe(() => {
    // Only re-render if container is still connected to document
    if (container.isConnected) {
      render();
    }
  });

  render();
}
