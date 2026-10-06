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

// Persistent session cache for admin direct submission view (scoped per-video)
const submitSession = {
  filesByVideo: {}, // { [videoNum]: { thumbnail: File, voiceover: File, ... } }
  previewUrlsByVideo: {}, // { [videoNum]: { thumbnail: url, voiceover: url, ... } }
  draftsByVideo: {}, // { [videoNum]: { script: '...', meta: '...', ... } }
  feedbackByVideo: {} // { [videoNum]: { type: 'success'|'error', text: '...' } }
};

function getStagedFile(vNum, key) {
  return submitSession.filesByVideo[vNum]?.[key] || null;
}

function setStagedFile(vNum, key, file) {
  if (!submitSession.filesByVideo[vNum]) submitSession.filesByVideo[vNum] = {};
  submitSession.filesByVideo[vNum][key] = file;
}

function clearStagedFile(vNum, key) {
  if (submitSession.filesByVideo[vNum]) {
    delete submitSession.filesByVideo[vNum][key];
  }
  if (submitSession.previewUrlsByVideo[vNum]?.[key]) {
    try {
      URL.revokeObjectURL(submitSession.previewUrlsByVideo[vNum][key]);
    } catch (e) {}
    delete submitSession.previewUrlsByVideo[vNum][key];
  }
}

function getPreviewUrl(vNum, key) {
  return submitSession.previewUrlsByVideo[vNum]?.[key] || null;
}

function setPreviewUrl(vNum, key, url) {
  if (!submitSession.previewUrlsByVideo[vNum]) submitSession.previewUrlsByVideo[vNum] = {};
  submitSession.previewUrlsByVideo[vNum][key] = url;
}

function getDraft(vNum, key, defaultVal = '') {
  if (submitSession.draftsByVideo[vNum]?.[key] !== undefined) {
    return submitSession.draftsByVideo[vNum][key];
  }
  return defaultVal;
}

function setDraft(vNum, key, text) {
  if (!submitSession.draftsByVideo[vNum]) submitSession.draftsByVideo[vNum] = {};
  submitSession.draftsByVideo[vNum][key] = text;
}

function getFeedback(vNum) {
  return submitSession.feedbackByVideo[vNum] || null;
}

function setFeedback(vNum, feedback) {
  if (feedback) {
    submitSession.feedbackByVideo[vNum] = feedback;
  } else {
    delete submitSession.feedbackByVideo[vNum];
  }
}

export function renderAdminSubmitView(container, navigate) {
  let selectedChannelId = localStorage.getItem('yta_admin_submit_channel_id') || localStorage.getItem('yta_selected_channel_id') || '';
  let selectedVideoNum = sessionStorage.getItem('yta_admin_submit_video_num') || '';
  let selectedElementKey = sessionStorage.getItem('yta_admin_submit_element') || 'thumbnail';

  function renderPromptsBox(roleName, channelId) {
    if (!channelId) return '';
    const prompts = store.getPromptsForRole(roleName, channelId);
    if (!prompts || prompts.length === 0) return '';

    const itemsHtml = prompts
      .map(
        (p) => `
        <div class="prompt-box-item" style="padding: 8px 10px; background-color: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${escapeHtml(p.label)}</span>
              <button type="button" class="btn-prompt-toggle" data-prompt-id="${p.id}">Expand</button>
            </div>
            <button type="button" class="btn btn-secondary btn-sm btn-copy-prompt" data-prompt-text="${encodeURIComponent(p.promptText)}">
              Copy Prompt
            </button>
          </div>
          <div class="prompt-scrollable-content" id="prompt-body-${p.id}">${escapeHtml(p.promptText)}</div>
        </div>
      `
      )
      .join('');

    return `
      <div style="margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span class="section-label" style="margin-bottom: 0;">Role Prompt Guidelines:</span>
        </div>
        <div class="prompts-container" style="max-height: 200px; overflow-y: auto;">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  function render() {
    const state = store.getState();
    const channels = state.channels || [];

    // Ensure selected channel exists
    if (channels.length > 0) {
      if (!selectedChannelId || !channels.some((c) => c.id === selectedChannelId)) {
        selectedChannelId = channels[0].id;
        localStorage.setItem('yta_admin_submit_channel_id', selectedChannelId);
      }
    } else {
      selectedChannelId = '';
    }

    const currentChannel = channels.find((c) => c.id === selectedChannelId);
    const channelVideos = currentChannel
      ? state.videos.filter((v) => v.channelId === selectedChannelId).sort((a, b) => a.videoNumber - b.videoNumber)
      : [];

    // Ensure selectedVideoNum exists for channel
    if (channelVideos.length > 0) {
      if (!selectedVideoNum || !channelVideos.some((v) => String(v.videoNumber) === String(selectedVideoNum))) {
        selectedVideoNum = String(channelVideos[0].videoNumber);
        sessionStorage.setItem('yta_admin_submit_video_num', selectedVideoNum);
      }
    } else {
      selectedVideoNum = '';
    }

    const currentVideo = channelVideos.find((v) => String(v.videoNumber) === String(selectedVideoNum)) || null;

    // Build channel dropdown options
    const channelOptions = channels
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(getChannelMemberDisplayName(c, channels))})</option>`
      )
      .join('');

    // Build video dropdown options
    const videoOptions = channelVideos.length
      ? channelVideos
          .map((v) => {
            const isSelected = String(v.videoNumber) === String(selectedVideoNum);
            const statusLabel = v.status ? ' [Done]' : '';
            const activeUploadsForVid = store.getVideoUploads(selectedChannelId, v.videoNumber);
            const isUploading = activeUploadsForVid.some((u) => u.status === 'uploading');
            const uploadLabel = isUploading ? ' [⟳ Uploading]' : '';
            return `<option value="${v.videoNumber}" ${isSelected ? 'selected' : ''}>Video ${v.videoNumber}${statusLabel}${uploadLabel}</option>`;
          })
          .join('')
      : '<option value="">No videos in this channel</option>';

    // Global Active Uploads Bar
    const allActiveUploads = store.getAllActiveUploads();
    let globalUploadsBarHtml = '';
    if (allActiveUploads.length > 0) {
      globalUploadsBarHtml = `
        <div class="active-uploads-bar">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="upload-spin-icon"></div>
            <div>
              <div style="font-weight: 700; font-size: 13px; color: var(--accent);">
                ${allActiveUploads.length} Background Upload${allActiveUploads.length > 1 ? 's' : ''} Active
              </div>
              <div style="font-size: 11.5px; color: var(--text-primary); margin-top: 1px;">
                ${allActiveUploads.map((u) => `Video <strong>#${u.videoNumber}</strong> (${escapeHtml(u.task)}: ${escapeHtml(u.fileName)})`).join(' • ')}
              </div>
            </div>
          </div>
          <div style="font-size: 11px; color: #10b981; font-weight: 600;">
            ✓ Shift between videos freely anytime
          </div>
        </div>
      `;
    }

    // Auto-fetched title text
    const autoFetchedTitle = !currentChannel
      ? '— Select a Channel'
      : !currentVideo
      ? '— No videos created for this channel yet'
      : (currentVideo.title || '— (No Title Set)');

    // Available elements list
    const coreElements = [
      {
        key: 'thumbnail',
        name: 'Thumbnail',
        typeLabel: 'Image File',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
        isSubmitted: Boolean(currentVideo?.thumbnail && currentVideo.thumbnail.name),
        summary: currentVideo?.thumbnail?.name || 'Not submitted yet'
      },
      {
        key: 'voiceover',
        name: 'Voiceover',
        typeLabel: 'Audio File',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
        isSubmitted: Boolean(currentVideo?.voiceover && currentVideo.voiceover.name),
        summary: currentVideo?.voiceover?.name || 'Not submitted yet'
      },
      {
        key: 'script',
        name: 'Script',
        typeLabel: 'Text Content',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
        isSubmitted: Boolean(currentVideo?.script && currentVideo.script.trim()),
        summary: currentVideo?.script ? `${currentVideo.script.slice(0, 35)}...` : 'Not submitted yet'
      },
      {
        key: 'meta',
        name: 'Meta Info',
        typeLabel: 'Description & Tags',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
        isSubmitted: Boolean(currentVideo?.metaInfo && currentVideo.metaInfo.trim()),
        summary: currentVideo?.metaInfo ? `${currentVideo.metaInfo.slice(0, 35)}...` : 'Not submitted yet'
      }
    ];

    // Additional custom roles from database
    const standardRoleNames = ['thumbnail', 'voiceover', 'script', 'meta info', 'meta'];
    const customRoles = (state.roles || [])
      .filter((r) => !standardRoleNames.includes(r.name.toLowerCase()))
      .map((r) => {
        const val = currentVideo?.customFields?.[r.name];
        const isSub = Boolean(val);
        const summ = typeof val === 'object' && val?.name ? val.name : val ? String(val).slice(0, 35) : 'Not submitted yet';
        return {
          key: `custom_${r.name}`,
          rawRoleName: r.name,
          name: r.name,
          typeLabel: r.inputType,
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`,
          isSubmitted: isSub,
          summary: summ,
          isCustom: true,
          inputType: r.inputType
        };
      });

    const allElements = [...coreElements, ...customRoles];

    // Ensure selectedElementKey is valid
    if (!allElements.some((el) => el.key === selectedElementKey)) {
      selectedElementKey = 'thumbnail';
      sessionStorage.setItem('yta_admin_submit_element', selectedElementKey);
    }

    const activeElement = allElements.find((el) => el.key === selectedElementKey) || allElements[0];

    // Generate HTML for Elements Grid (Left Side)
    const elementsGridHtml = allElements
      .map((el) => {
        const isActive = el.key === selectedElementKey;
        const activeUploadForEl = store.getBackgroundUpload(selectedChannelId, selectedVideoNum, el.key);
        const isElUploading = activeUploadForEl && activeUploadForEl.status === 'uploading';
        return `
          <button type="button" class="admin-element-card ${isActive ? 'active' : ''}" data-element-key="${el.key}">
            <div class="element-card-icon">${el.icon}</div>
            <div class="element-card-info">
              <div class="element-card-name-row">
                <span class="element-card-name">${escapeHtml(el.name)}</span>
                <span class="element-card-type">${escapeHtml(el.typeLabel)}</span>
              </div>
              <div class="element-card-summary">${isElUploading ? 'Uploading in background...' : escapeHtml(el.summary)}</div>
            </div>
            <div class="element-card-status">
              ${
                isElUploading
                  ? `<span class="badge-done" style="font-size: 10.5px; background: rgba(255, 122, 0, 0.15); color: var(--accent); border-color: var(--accent);">⟳ Uploading</span>`
                  : el.isSubmitted
                  ? `<span class="badge-done" style="font-size: 10.5px;">✓ Submitted</span>`
                  : `<span class="badge-pending" style="font-size: 10.5px; opacity: 0.7;">Pending</span>`
              }
            </div>
          </button>
        `;
      })
      .join('');

    // Generate Right Side Submission Workspace
    let workspaceHtml = '';

    if (!currentVideo) {
      workspaceHtml = `
        <div class="card empty-state-box" style="padding: 40px 20px; text-align: center;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; opacity: 0.4;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
          <h3 style="margin-bottom: 6px;">No Video Selected</h3>
          <p class="helper-text" style="max-width: 380px; margin: 0 auto 16px;">
            Choose a YouTube channel and video number above to submit elements directly to the database.
          </p>
          ${
            channelVideos.length === 0
              ? `<button type="button" class="btn btn-primary btn-sm" id="btn-goto-titles-quick">Go to Add Titles</button>`
              : ''
          }
        </div>
      `;
    } else {
      // 1. THUMBNAIL
      if (activeElement.key === 'thumbnail') {
        const hasExisting = Boolean(currentVideo?.thumbnail && currentVideo.thumbnail.name);
        const existingName = hasExisting ? currentVideo.thumbnail.name : '';
        const existingUrl = currentVideo?.thumbnail?.url || '';
        const hasValidUrl = Boolean(existingUrl && existingUrl.startsWith('http'));
        const stagedFile = getStagedFile(selectedVideoNum, 'thumbnail');
        const previewUrl = getPreviewUrl(selectedVideoNum, 'thumbnail');
        const activeUpload = store.getBackgroundUpload(selectedChannelId, selectedVideoNum, 'thumbnail');
        const isUploading = activeUpload && activeUpload.status === 'uploading';

        let existingBoxHtml = '';
        if (hasExisting) {
          existingBoxHtml = `
            <div class="existing-db-card">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="existing-db-tag">✓ Currently In Database</span>
                <div style="display: flex; gap: 6px;">
                  ${
                    hasValidUrl
                      ? `
                        <button type="button" class="btn btn-secondary btn-sm btn-preview-existing-thumb" data-url="${escapeHtml(existingUrl)}" data-filename="${escapeHtml(existingName)}" style="padding: 2px 8px; font-size: 11px;">View</button>
                        <button type="button" class="btn btn-secondary btn-sm btn-download-existing-thumb" data-url="${escapeHtml(existingUrl)}" data-filename="${escapeHtml(existingName)}" style="padding: 2px 8px; font-size: 11px;">Download</button>
                      `
                      : ''
                  }
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                ${
                  hasValidUrl
                    ? `<img src="${escapeHtml(existingUrl)}" alt="Current thumbnail" style="width: 100px; height: 56px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border);" />`
                    : `<div style="width: 100px; height: 56px; display: flex; align-items: center; justify-content: center; background: #000; border: 1px solid var(--border); border-radius: 4px; font-size: 10px; color: var(--text-muted);">No Preview</div>`
                }
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(existingName)}</div>
                  <div class="helper-text" style="font-size: 11px; margin-top: 2px;">Submitting a new thumbnail will replace this entry.</div>
                </div>
              </div>
            </div>
          `;
        }

        let stagedPreviewHtml = '';
        if (stagedFile && previewUrl) {
          stagedPreviewHtml = `
            <div class="staged-file-preview">
              <img src="${previewUrl}" alt="Selected thumbnail" />
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(stagedFile.name)}</div>
                <div class="helper-text" style="font-size: 11px; margin-top: 2px;">Ready to upload (${Math.round(stagedFile.size / 1024)} KB)</div>
              </div>
              <button type="button" class="btn btn-danger btn-sm btn-clear-staged" data-key="thumbnail">Clear</button>
            </div>
          `;
        }

        workspaceHtml = `
          <div class="card workspace-card">
            <div class="workspace-header">
              <div>
                <h3 style="margin-bottom: 2px;">Submit Thumbnail</h3>
                <span class="helper-text">Channel: <strong>${escapeHtml(currentChannel.name)}</strong> • Video <strong>#${currentVideo.videoNumber}</strong></span>
              </div>
              ${isUploading ? '<span class="status-submitted" style="color: var(--accent);">⟳ Uploading...</span>' : hasExisting ? '<span class="status-submitted">✓ In Database</span>' : '<span class="badge-pending">Pending</span>'}
            </div>

            ${
              isUploading
                ? `
                  <div class="active-upload-status-card" style="margin-bottom: 14px; padding: 10px 14px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div class="upload-spin-icon"></div>
                      <div>
                        <div style="font-weight: 600; font-size: 13px; color: var(--accent);">Uploading Thumbnail in background: ${escapeHtml(activeUpload.fileName)}</div>
                        <div class="helper-text" style="font-size: 11px;">You can shift between videos freely anytime.</div>
                      </div>
                    </div>
                  </div>
                `
                : ''
            }

            ${existingBoxHtml}
            ${renderPromptsBox('thumbnail', selectedChannelId)}

            <div class="file-dropzone" id="dropzone-thumb">
              <input type="file" id="input-thumb-file" accept="image/png,image/jpeg,image/webp,image/jpg" style="display: none;" />
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <div style="font-weight: 600; font-size: 13px;">Drop thumbnail image here or click to browse</div>
              <div class="helper-text" style="font-size: 11px;">Supports PNG, JPG, JPEG, WEBP</div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-browse-thumb" style="margin-top: 6px;">
                ${stagedFile ? 'Change Selected File' : 'Browse Computer'}
              </button>
            </div>

            ${stagedPreviewHtml}

            <div style="margin-top: 18px; display: flex; align-items: center; gap: 10px;">
              <button type="button" class="btn btn-primary" id="btn-submit-action-thumb" ${!stagedFile ? 'disabled' : ''}>
                ${hasExisting ? 'Replace & Save Thumbnail' : 'Save Thumbnail to Database'}
              </button>
              ${stagedFile ? `<span class="helper-text">1 file attached</span>` : ''}
            </div>
          </div>
        `;
      }

      // 2. VOICEOVER
      else if (activeElement.key === 'voiceover') {
        const hasExisting = Boolean(currentVideo?.voiceover && currentVideo.voiceover.name);
        const existingName = hasExisting ? currentVideo.voiceover.name : '';
        const existingUrl = currentVideo?.voiceover?.url || '';
        const hasValidUrl = Boolean(existingUrl && existingUrl.startsWith('http'));
        const stagedFile = getStagedFile(selectedVideoNum, 'voiceover');
        const previewUrl = getPreviewUrl(selectedVideoNum, 'voiceover');
        const activeUpload = store.getBackgroundUpload(selectedChannelId, selectedVideoNum, 'voiceover');
        const isUploading = activeUpload && activeUpload.status === 'uploading';

        let existingBoxHtml = '';
        if (hasExisting) {
          existingBoxHtml = `
            <div class="existing-db-card">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="existing-db-tag">✓ Currently In Database</span>
                ${
                  hasValidUrl
                    ? `<button type="button" class="btn btn-secondary btn-sm btn-download-existing-vo" data-url="${escapeHtml(existingUrl)}" data-filename="${escapeHtml(existingName)}" style="padding: 2px 8px; font-size: 11px;">Download</button>`
                    : ''
                }
              </div>
              <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); margin-bottom: 6px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${escapeHtml(existingName)}
              </div>
              ${
                hasValidUrl
                  ? `<audio controls src="${escapeHtml(existingUrl)}" preload="none" style="width: 100%; height: 36px;"></audio>`
                  : `<div class="helper-text" style="color: #f59e0b;">Audio file storage link needs re-upload</div>`
              }
            </div>
          `;
        }

        let stagedPreviewHtml = '';
        if (stagedFile && previewUrl) {
          stagedPreviewHtml = `
            <div class="staged-file-preview" style="flex-direction: column; align-items: stretch; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(stagedFile.name)}</div>
                  <div class="helper-text" style="font-size: 11px;">Ready to upload (${Math.round(stagedFile.size / 1024)} KB) • Play below to verify</div>
                </div>
                <button type="button" class="btn btn-danger btn-sm btn-clear-staged" data-key="voiceover">Clear</button>
              </div>
              <audio controls src="${previewUrl}" preload="metadata" style="width: 100%; height: 36px;"></audio>
            </div>
          `;
        }

        workspaceHtml = `
          <div class="card workspace-card">
            <div class="workspace-header">
              <div>
                <h3 style="margin-bottom: 2px;">Submit Voiceover</h3>
                <span class="helper-text">Channel: <strong>${escapeHtml(currentChannel.name)}</strong> • Video <strong>#${currentVideo.videoNumber}</strong></span>
              </div>
              ${isUploading ? '<span class="status-submitted" style="color: var(--accent);">⟳ Uploading...</span>' : hasExisting ? '<span class="status-submitted">✓ In Database</span>' : '<span class="badge-pending">Pending</span>'}
            </div>

            ${
              isUploading
                ? `
                  <div class="active-upload-status-card" style="margin-bottom: 14px; padding: 10px 14px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div class="upload-spin-icon"></div>
                      <div>
                        <div style="font-weight: 600; font-size: 13px; color: var(--accent);">Uploading Voiceover in background: ${escapeHtml(activeUpload.fileName)}</div>
                        <div class="helper-text" style="font-size: 11px;">You can shift between videos freely anytime.</div>
                      </div>
                    </div>
                  </div>
                `
                : ''
            }

            ${existingBoxHtml}
            ${renderPromptsBox('voiceover', selectedChannelId)}

            <div class="file-dropzone" id="dropzone-vo">
              <input type="file" id="input-vo-file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" style="display: none;" />
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
              <div style="font-weight: 600; font-size: 13px;">Drop audio voiceover here or click to browse</div>
              <div class="helper-text" style="font-size: 11px;">Supports MP3, WAV, M4A, AAC, OGG</div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-browse-vo" style="margin-top: 6px;">
                ${stagedFile ? 'Change Selected Audio' : 'Browse Computer'}
              </button>
            </div>

            ${stagedPreviewHtml}

            <div style="margin-top: 18px; display: flex; align-items: center; gap: 10px;">
              <button type="button" class="btn btn-primary" id="btn-submit-action-vo" ${!stagedFile ? 'disabled' : ''}>
                ${hasExisting ? 'Replace & Save Voiceover' : 'Save Voiceover to Database'}
              </button>
              ${stagedFile ? `<span class="helper-text">1 audio file ready</span>` : ''}
            </div>
          </div>
        `;
      }

      // 3. SCRIPT
      else if (activeElement.key === 'script') {
        const hasExisting = Boolean(currentVideo?.script && currentVideo.script.trim());
        const existingScript = hasExisting ? currentVideo.script : '';
        const currentDraft = getDraft(selectedVideoNum, 'script', existingScript);

        workspaceHtml = `
          <div class="card workspace-card">
            <div class="workspace-header">
              <div>
                <h3 style="margin-bottom: 2px;">Submit Script</h3>
                <span class="helper-text">Channel: <strong>${escapeHtml(currentChannel.name)}</strong> • Video <strong>#${currentVideo.videoNumber}</strong></span>
              </div>
              ${hasExisting ? '<span class="status-submitted">✓ In Database</span>' : '<span class="badge-pending">Pending</span>'}
            </div>

            ${renderPromptsBox('script', selectedChannelId)}

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label for="admin-submit-script-text" style="margin-bottom: 0; font-size: 12px; font-weight: 600;">Script Content:</label>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-paste-clipboard-script" style="font-size: 11px; padding: 2px 8px;">
                  Paste from Clipboard
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-script" style="font-size: 11px; padding: 2px 8px;">
                  Clear
                </button>
              </div>
            </div>

            <textarea id="admin-submit-script-text" rows="10" placeholder="Type or paste the complete video script here..." style="width: 100%; font-family: inherit; font-size: 13px; line-height: 1.6;">${escapeHtml(currentDraft)}</textarea>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
              <span class="helper-text" id="script-counter">
                ${currentDraft.length} characters • ${currentDraft.trim() ? currentDraft.trim().split(/\s+/).length : 0} words
              </span>
            </div>

            <div style="margin-top: 18px; display: flex; align-items: center; gap: 10px;">
              <button type="button" class="btn btn-primary" id="btn-submit-action-script">
                ${hasExisting ? 'Replace & Save Script' : 'Save Script to Database'}
              </button>
            </div>
          </div>
        `;
      }

      // 4. META INFO
      else if (activeElement.key === 'meta') {
        const hasExisting = Boolean(currentVideo?.metaInfo && currentVideo.metaInfo.trim());
        const existingMeta = hasExisting ? currentVideo.metaInfo : '';
        const currentDraft = getDraft(selectedVideoNum, 'meta', existingMeta);

        workspaceHtml = `
          <div class="card workspace-card">
            <div class="workspace-header">
              <div>
                <h3 style="margin-bottom: 2px;">Submit Meta Information</h3>
                <span class="helper-text">Channel: <strong>${escapeHtml(currentChannel.name)}</strong> • Video <strong>#${currentVideo.videoNumber}</strong></span>
              </div>
              ${hasExisting ? '<span class="status-submitted">✓ In Database</span>' : '<span class="badge-pending">Pending</span>'}
            </div>

            ${renderPromptsBox('meta info', selectedChannelId)}

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label for="admin-submit-meta-text" style="margin-bottom: 0; font-size: 12px; font-weight: 600;">Description, Tags &amp; Keywords:</label>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-paste-clipboard-meta" style="font-size: 11px; padding: 2px 8px;">
                  Paste from Clipboard
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-meta" style="font-size: 11px; padding: 2px 8px;">
                  Clear
                </button>
              </div>
            </div>

            <textarea id="admin-submit-meta-text" rows="8" placeholder="Paste YouTube video description, search tags, hashtags, and credits here..." style="width: 100%; font-family: inherit; font-size: 13px; line-height: 1.6;">${escapeHtml(currentDraft)}</textarea>

            <div style="margin-top: 18px; display: flex; align-items: center; gap: 10px;">
              <button type="button" class="btn btn-primary" id="btn-submit-action-meta">
                ${hasExisting ? 'Replace & Save Meta Info' : 'Save Meta Info to Database'}
              </button>
            </div>
          </div>
        `;
      }

      // 5. CUSTOM ROLES (Attach File, Number, or Text)
      else if (activeElement.isCustom) {
        const roleName = activeElement.rawRoleName;
        const hasExisting = Boolean(currentVideo?.customFields?.[roleName]);
        const existingVal = hasExisting ? currentVideo.customFields[roleName] : '';
        const inputType = activeElement.inputType || 'Text';
        const activeUpload = store.getBackgroundUpload(selectedChannelId, selectedVideoNum, activeElement.key);
        const isUploading = activeUpload && activeUpload.status === 'uploading';

        let customInputHtml = '';

        if (inputType === 'Attach File') {
          const stagedFile = getStagedFile(selectedVideoNum, activeElement.key);
          const hasExistingFile = hasExisting && typeof existingVal === 'object' && existingVal?.name;

          customInputHtml = `
            ${
              hasExistingFile
                ? `
                  <div class="existing-db-card" style="margin-bottom: 14px;">
                    <span class="existing-db-tag">✓ Current File in Database</span>
                    <div style="font-weight: 600; font-size: 13px; margin-top: 4px;">${escapeHtml(existingVal.name)}</div>
                  </div>
                `
                : ''
            }

            <div class="file-dropzone" id="dropzone-custom-${escapeHtml(roleName)}">
              <input type="file" id="input-custom-file-${escapeHtml(roleName)}" style="display: none;" />
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              <div style="font-weight: 600; font-size: 13px;">Drop file here or click to browse</div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-browse-custom-${escapeHtml(roleName)}" style="margin-top: 6px;">
                ${stagedFile ? 'Change File' : 'Browse File'}
              </button>
            </div>

            ${
              stagedFile
                ? `
                  <div class="staged-file-preview" style="margin-top: 10px;">
                    <div style="min-width: 0; flex: 1;">
                      <div style="font-weight: 600; font-size: 13px;">${escapeHtml(stagedFile.name)}</div>
                      <div class="helper-text" style="font-size: 11px;">Ready to upload (${Math.round(stagedFile.size / 1024)} KB)</div>
                    </div>
                    <button type="button" class="btn btn-danger btn-sm btn-clear-staged" data-key="${activeElement.key}">Clear</button>
                  </div>
                `
                : ''
            }

            <div style="margin-top: 18px;">
              <button type="button" class="btn btn-primary" id="btn-submit-action-custom-file" data-role="${escapeHtml(roleName)}" ${!stagedFile ? 'disabled' : ''}>
                ${hasExisting ? `Replace & Save ${escapeHtml(roleName)}` : `Save ${escapeHtml(roleName)} to Database`}
              </button>
            </div>
          `;
        } else if (inputType === 'Number') {
          const currentDraft = getDraft(selectedVideoNum, activeElement.key, existingVal);
          customInputHtml = `
            <div class="form-group" style="max-width: 320px;">
              <label for="admin-submit-custom-num">Enter number for ${escapeHtml(roleName)}:</label>
              <input type="number" id="admin-submit-custom-num" value="${escapeHtml(currentDraft)}" placeholder="Enter number..." />
            </div>
            <div style="margin-top: 18px;">
              <button type="button" class="btn btn-primary" id="btn-submit-action-custom-num" data-role="${escapeHtml(roleName)}">
                ${hasExisting ? `Replace & Save ${escapeHtml(roleName)}` : `Save ${escapeHtml(roleName)} to Database`}
              </button>
            </div>
          `;
        } else {
          const currentDraft = getDraft(selectedVideoNum, activeElement.key, existingVal);
          customInputHtml = `
            <div class="form-group">
              <label for="admin-submit-custom-text">Enter text for ${escapeHtml(roleName)}:</label>
              <textarea id="admin-submit-custom-text" rows="6" placeholder="Enter content...">${escapeHtml(currentDraft)}</textarea>
            </div>
            <div style="margin-top: 18px;">
              <button type="button" class="btn btn-primary" id="btn-submit-action-custom-text" data-role="${escapeHtml(roleName)}">
                ${hasExisting ? `Replace & Save ${escapeHtml(roleName)}` : `Save ${escapeHtml(roleName)} to Database`}
              </button>
            </div>
          `;
        }

        workspaceHtml = `
          <div class="card workspace-card">
            <div class="workspace-header">
              <div>
                <h3 style="margin-bottom: 2px;">Submit ${escapeHtml(roleName)}</h3>
                <span class="helper-text">Channel: <strong>${escapeHtml(currentChannel.name)}</strong> • Video <strong>#${currentVideo.videoNumber}</strong></span>
              </div>
              ${isUploading ? '<span class="status-submitted" style="color: var(--accent);">⟳ Uploading...</span>' : hasExisting ? '<span class="status-submitted">✓ In Database</span>' : '<span class="badge-pending">Pending</span>'}
            </div>

            ${
              isUploading
                ? `
                  <div class="active-upload-status-card" style="margin-bottom: 14px; padding: 10px 14px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div class="upload-spin-icon"></div>
                      <div>
                        <div style="font-weight: 600; font-size: 13px; color: var(--accent);">Uploading ${escapeHtml(roleName)} in background: ${escapeHtml(activeUpload.fileName)}</div>
                        <div class="helper-text" style="font-size: 11px;">You can shift between videos freely anytime.</div>
                      </div>
                    </div>
                  </div>
                `
                : ''
            }

            ${renderPromptsBox(roleName, selectedChannelId)}
            ${customInputHtml}
          </div>
        `;
      }
    }

    // Render Overall Layout
    container.innerHTML = `
      <div class="main-content">
        ${globalUploadsBarHtml}

        <!-- Notification Feedback Banner -->
        ${
          getFeedback(selectedVideoNum)
            ? `
              <div class="notification-banner ${getFeedback(selectedVideoNum).type === 'error' ? 'error' : ''}" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                <span>${escapeHtml(getFeedback(selectedVideoNum).text)}</span>
                <button type="button" id="btn-close-feedback" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 14px; padding: 2px 6px;">✕</button>
              </div>
            `
            : ''
        }

        <!-- Top Control Bar (Channel & Video Selection) -->
        <div class="card" style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;">
            <div>
              <h2 style="margin-bottom: 2px; font-size: 18px; font-weight: 700;">Direct Element Submission</h2>
              <span class="helper-text">Submit thumbnails, voiceovers, scripts, and meta tags directly as Admin without switching accounts.</span>
            </div>
            <button type="button" id="btn-goto-table" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
              <span>View Production Table</span>
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 14px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="admin-submit-channel-select" style="font-weight: 600; margin-bottom: 4px;">1. Select Channel</label>
              <select id="admin-submit-channel-select">
                ${channelOptions || '<option value="">No channels available</option>'}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label for="admin-submit-video-select" style="font-weight: 600; margin-bottom: 0;">2. Select Video #</label>
                ${currentVideo?.status ? '<span class="badge-done">✓ Marked Done</span>' : ''}
              </div>
              <select id="admin-submit-video-select" ${!channelVideos.length ? 'disabled' : ''}>
                ${videoOptions}
              </select>
            </div>
          </div>

          <!-- Auto-Fetched Video Title Display -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
              <span class="section-label" style="margin-bottom: 0; font-size: 11px;">Auto-Fetched Video Title:</span>
              ${
                currentVideo?.title
                  ? `<button type="button" id="btn-copy-fetched-title" class="btn-copy" style="font-size: 11px; padding: 2px 8px;">Copy Title</button>`
                  : ''
              }
            </div>
            <div class="admin-fetched-title-box">
              <span style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${escapeHtml(autoFetchedTitle)}</span>
            </div>
          </div>
        </div>

        <!-- Main Split Work Area: Left Grid (Elements) & Right Workspace (Submission) -->
        <div class="admin-submit-split">
          <!-- Left Column: Element Selection Grid -->
          <div class="card" style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
              <h3 style="margin-bottom: 0; font-size: 14px;">Elements to Submit</h3>
              <span class="helper-text" style="font-size: 11px;">Click to select</span>
            </div>
            <div class="admin-elements-grid">
              ${elementsGridHtml}
            </div>
          </div>

          <!-- Right Column: Dedicated Input & File Asking Workspace -->
          <div id="admin-workspace-mount">
            ${workspaceHtml}
          </div>
        </div>
      </div>
    `;

    // Event Listeners:
    // Dismiss feedback banner
    const closeFeedbackBtn = container.querySelector('#btn-close-feedback');
    if (closeFeedbackBtn) {
      closeFeedbackBtn.addEventListener('click', () => {
        setFeedback(selectedVideoNum, null);
        render();
      });
    }

    // Go to Production Table
    const gotoTableBtn = container.querySelector('#btn-goto-table');
    if (gotoTableBtn) {
      gotoTableBtn.addEventListener('click', () => navigate('#/admin/table'));
    }

    const gotoTitlesQuickBtn = container.querySelector('#btn-goto-titles-quick');
    if (gotoTitlesQuickBtn) {
      gotoTitlesQuickBtn.addEventListener('click', () => navigate('#/admin/titles'));
    }

    // Copy auto-fetched title
    const copyTitleBtn = container.querySelector('#btn-copy-fetched-title');
    if (copyTitleBtn && currentVideo?.title) {
      copyTitleBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(currentVideo.title);
          const orig = copyTitleBtn.textContent;
          copyTitleBtn.textContent = 'Copied!';
          setTimeout(() => {
            if (copyTitleBtn) copyTitleBtn.textContent = orig;
          }, 1500);
        } catch (err) {
          console.error('Failed to copy title:', err);
        }
      });
    }

    // Channel Selection Change
    const chanSelect = container.querySelector('#admin-submit-channel-select');
    if (chanSelect) {
      chanSelect.addEventListener('change', (e) => {
        selectedChannelId = e.target.value;
        localStorage.setItem('yta_admin_submit_channel_id', selectedChannelId);
        selectedVideoNum = '';
        sessionStorage.setItem('yta_admin_submit_video_num', '');
        render();
      });
    }

    // Video Selection Change
    const vidSelect = container.querySelector('#admin-submit-video-select');
    if (vidSelect) {
      vidSelect.addEventListener('change', (e) => {
        selectedVideoNum = e.target.value;
        sessionStorage.setItem('yta_admin_submit_video_num', selectedVideoNum);
        render();
      });
    }

    // Element Card Click (Left Side Grid)
    container.querySelectorAll('.admin-element-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.elementKey;
        selectedElementKey = key;
        sessionStorage.setItem('yta_admin_submit_element', selectedElementKey);
        render();
      });
    });

    // Expand/Collapse Role Prompts
    container.querySelectorAll('.btn-prompt-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const promptId = e.target.dataset.promptId;
        const bodyEl = container.querySelector(`#prompt-body-${promptId}`);
        if (bodyEl) {
          const isExpanded = bodyEl.classList.toggle('expanded');
          e.target.textContent = isExpanded ? 'Collapse' : 'Expand';
        }
      });
    });

    // Copy Role Prompt
    container.querySelectorAll('.btn-copy-prompt').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const raw = decodeURIComponent(e.target.dataset.promptText || '');
        try {
          await navigator.clipboard.writeText(raw);
          const original = e.target.textContent;
          e.target.textContent = 'Copied!';
          setTimeout(() => {
            if (e.target) e.target.textContent = original;
          }, 1500);
        } catch (err) {
          console.error('Copy prompt failed:', err);
        }
      });
    });

    // Clear Staged File Button
    container.querySelectorAll('.btn-clear-staged').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        clearStagedFile(selectedVideoNum, key);
        render();
      });
    });

    // Existing Thumbnail Modal / Download
    const prevThumbBtn = container.querySelector('.btn-preview-existing-thumb');
    if (prevThumbBtn) {
      prevThumbBtn.addEventListener('click', () => {
        openThumbnailModal(prevThumbBtn.dataset.url, prevThumbBtn.dataset.filename);
      });
    }

    const dlThumbBtn = container.querySelector('.btn-download-existing-thumb');
    if (dlThumbBtn) {
      dlThumbBtn.addEventListener('click', async () => {
        await downloadFileSecurely(dlThumbBtn.dataset.url, dlThumbBtn.dataset.filename);
      });
    }

    // Existing Voiceover Download
    const dlVoBtn = container.querySelector('.btn-download-existing-vo');
    if (dlVoBtn) {
      dlVoBtn.addEventListener('click', async () => {
        await downloadFileSecurely(dlVoBtn.dataset.url, dlVoBtn.dataset.filename);
      });
    }

    // --- THUMBNAIL DROPZONE & SUBMIT ---
    const thumbDropzone = container.querySelector('#dropzone-thumb');
    const thumbInput = container.querySelector('#input-thumb-file');
    const browseThumbBtn = container.querySelector('#btn-browse-thumb');
    const submitThumbBtn = container.querySelector('#btn-submit-action-thumb');

    if (browseThumbBtn && thumbInput) {
      browseThumbBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        thumbInput.click();
      });
    }

    if (thumbDropzone && thumbInput) {
      thumbDropzone.addEventListener('click', () => thumbInput.click());

      thumbDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        thumbDropzone.classList.add('drag-over');
      });

      thumbDropzone.addEventListener('dragleave', () => {
        thumbDropzone.classList.remove('drag-over');
      });

      thumbDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        thumbDropzone.classList.remove('drag-over');
        if (e.dataTransfer?.files?.[0]) {
          handleThumbFile(e.dataTransfer.files[0]);
        }
      });

      thumbInput.addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
          handleThumbFile(e.target.files[0]);
        }
      });
    }

    function handleThumbFile(file) {
      setStagedFile(selectedVideoNum, 'thumbnail', file);
      try {
        setPreviewUrl(selectedVideoNum, 'thumbnail', URL.createObjectURL(file));
      } catch (e) {}
      setFeedback(selectedVideoNum, null);
      render();
    }

    if (submitThumbBtn) {
      submitThumbBtn.addEventListener('click', () => {
        const file = getStagedFile(selectedVideoNum, 'thumbnail');
        if (!file) return;

        const vNum = selectedVideoNum;
        const fName = file.name;

        store.startBackgroundUpload({
          channelId: selectedChannelId,
          videoNumber: vNum,
          task: 'Thumbnail',
          file: file
        });

        clearStagedFile(vNum, 'thumbnail');
        setFeedback(vNum, {
          type: 'success',
          text: `⟳ Thumbnail "${fName}" is uploading in the background. You can shift to other videos now!`
        });
        render();
      });
    }

    // --- VOICEOVER DROPZONE & SUBMIT ---
    const voDropzone = container.querySelector('#dropzone-vo');
    const voInput = container.querySelector('#input-vo-file');
    const browseVoBtn = container.querySelector('#btn-browse-vo');
    const submitVoBtn = container.querySelector('#btn-submit-action-vo');

    if (browseVoBtn && voInput) {
      browseVoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        voInput.click();
      });
    }

    if (voDropzone && voInput) {
      voDropzone.addEventListener('click', () => voInput.click());

      voDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        voDropzone.classList.add('drag-over');
      });

      voDropzone.addEventListener('dragleave', () => {
        voDropzone.classList.remove('drag-over');
      });

      voDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        voDropzone.classList.remove('drag-over');
        if (e.dataTransfer?.files?.[0]) {
          handleVoFile(e.dataTransfer.files[0]);
        }
      });

      voInput.addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
          handleVoFile(e.target.files[0]);
        }
      });
    }

    function handleVoFile(file) {
      setStagedFile(selectedVideoNum, 'voiceover', file);
      try {
        setPreviewUrl(selectedVideoNum, 'voiceover', URL.createObjectURL(file));
      } catch (e) {}
      setFeedback(selectedVideoNum, null);
      render();
    }

    if (submitVoBtn) {
      submitVoBtn.addEventListener('click', () => {
        const file = getStagedFile(selectedVideoNum, 'voiceover');
        if (!file) return;

        const vNum = selectedVideoNum;
        const fName = file.name;

        store.startBackgroundUpload({
          channelId: selectedChannelId,
          videoNumber: vNum,
          task: 'Voiceover',
          file: file
        });

        clearStagedFile(vNum, 'voiceover');
        setFeedback(vNum, {
          type: 'success',
          text: `⟳ Voiceover "${fName}" is uploading in the background. You can shift to other videos now!`
        });
        render();
      });
    }

    // --- SCRIPT WORKSPACE ---
    const scriptTextarea = container.querySelector('#admin-submit-script-text');
    const pasteScriptBtn = container.querySelector('#btn-paste-clipboard-script');
    const clearScriptBtn = container.querySelector('#btn-clear-script');
    const submitScriptBtn = container.querySelector('#btn-submit-action-script');
    const scriptCounter = container.querySelector('#script-counter');

    if (scriptTextarea) {
      scriptTextarea.addEventListener('input', (e) => {
        const val = e.target.value;
        setDraft(selectedVideoNum, 'script', val);
        if (scriptCounter) {
          scriptCounter.textContent = `${val.length} characters • ${val.trim() ? val.trim().split(/\s+/).length : 0} words`;
        }
      });
    }

    if (pasteScriptBtn && scriptTextarea) {
      pasteScriptBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            scriptTextarea.value = text;
            setDraft(selectedVideoNum, 'script', text);
            if (scriptCounter) {
              scriptCounter.textContent = `${text.length} characters • ${text.trim().split(/\s+/).length} words`;
            }
          }
        } catch (err) {
          console.warn('Clipboard read failed:', err);
        }
      });
    }

    if (clearScriptBtn && scriptTextarea) {
      clearScriptBtn.addEventListener('click', () => {
        scriptTextarea.value = '';
        setDraft(selectedVideoNum, 'script', '');
        if (scriptCounter) {
          scriptCounter.textContent = '0 characters • 0 words';
        }
      });
    }

    if (submitScriptBtn) {
      submitScriptBtn.addEventListener('click', async () => {
        const textVal = (scriptTextarea?.value || getDraft(selectedVideoNum, 'script') || '').trim();
        if (!textVal) {
          setFeedback(selectedVideoNum, {
            type: 'error',
            text: 'Please enter script content before submitting.'
          });
          render();
          return;
        }

        submitScriptBtn.disabled = true;
        submitScriptBtn.textContent = 'Saving Script...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'Script',
          textValue: textVal
        });

        submitScriptBtn.disabled = false;
        if (res.success) {
          setDraft(selectedVideoNum, 'script', '');
          setFeedback(selectedVideoNum, {
            type: 'success',
            text: `✓ Script successfully saved for Video #${selectedVideoNum}!`
          });
        } else {
          setFeedback(selectedVideoNum, {
            type: 'error',
            text: `Failed to save script: ${res.error || 'Unknown error'}`
          });
        }
        render();
      });
    }

    // --- META INFO WORKSPACE ---
    const metaTextarea = container.querySelector('#admin-submit-meta-text');
    const pasteMetaBtn = container.querySelector('#btn-paste-clipboard-meta');
    const clearMetaBtn = container.querySelector('#btn-clear-meta');
    const submitMetaBtn = container.querySelector('#btn-submit-action-meta');

    if (metaTextarea) {
      metaTextarea.addEventListener('input', (e) => {
        setDraft(selectedVideoNum, 'meta', e.target.value);
      });
    }

    if (pasteMetaBtn && metaTextarea) {
      pasteMetaBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            metaTextarea.value = text;
            setDraft(selectedVideoNum, 'meta', text);
          }
        } catch (err) {
          console.warn('Clipboard read failed:', err);
        }
      });
    }

    if (clearMetaBtn && metaTextarea) {
      clearMetaBtn.addEventListener('click', () => {
        metaTextarea.value = '';
        setDraft(selectedVideoNum, 'meta', '');
      });
    }

    if (submitMetaBtn) {
      submitMetaBtn.addEventListener('click', async () => {
        const textVal = (metaTextarea?.value || getDraft(selectedVideoNum, 'meta') || '').trim();
        if (!textVal) {
          setFeedback(selectedVideoNum, {
            type: 'error',
            text: 'Please enter Meta Information (description & tags) before submitting.'
          });
          render();
          return;
        }

        submitMetaBtn.disabled = true;
        submitMetaBtn.textContent = 'Saving Meta Info...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'Meta Info',
          textValue: textVal
        });

        submitMetaBtn.disabled = false;
        if (res.success) {
          setDraft(selectedVideoNum, 'meta', '');
          setFeedback(selectedVideoNum, {
            type: 'success',
            text: `✓ Meta Information successfully saved for Video #${selectedVideoNum}!`
          });
        } else {
          setFeedback(selectedVideoNum, {
            type: 'error',
            text: `Failed to save meta info: ${res.error || 'Unknown error'}`
          });
        }
        render();
      });
    }

    // --- CUSTOM ROLES WORKSPACE ---
    const customFileInput = container.querySelector(`[id^="input-custom-file-"]`);
    const customBrowseBtn = container.querySelector(`[id^="btn-browse-custom-"]`);
    const customDropzone = container.querySelector(`[id^="dropzone-custom-"]`);
    const submitCustomFileBtn = container.querySelector('#btn-submit-action-custom-file');

    if (customBrowseBtn && customFileInput) {
      customBrowseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        customFileInput.click();
      });
    }

    if (customDropzone && customFileInput) {
      customDropzone.addEventListener('click', () => customFileInput.click());
      customFileInput.addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
          setStagedFile(selectedVideoNum, activeElement.key, e.target.files[0]);
          render();
        }
      });
    }

    if (submitCustomFileBtn) {
      submitCustomFileBtn.addEventListener('click', () => {
        const role = submitCustomFileBtn.dataset.role;
        const file = getStagedFile(selectedVideoNum, activeElement.key);
        if (!file) return;

        const vNum = selectedVideoNum;
        const fName = file.name;

        store.startBackgroundUpload({
          channelId: selectedChannelId,
          videoNumber: vNum,
          task: role,
          file: file
        });

        clearStagedFile(vNum, activeElement.key);
        setFeedback(vNum, {
          type: 'success',
          text: `⟳ "${fName}" for ${role} is uploading in the background!`
        });
        render();
      });
    }

    const customNumInput = container.querySelector('#admin-submit-custom-num');
    if (customNumInput) {
      customNumInput.addEventListener('input', (e) => {
        setDraft(selectedVideoNum, activeElement.key, e.target.value);
      });
    }

    const submitCustomNumBtn = container.querySelector('#btn-submit-action-custom-num');
    if (submitCustomNumBtn) {
      submitCustomNumBtn.addEventListener('click', async () => {
        const role = submitCustomNumBtn.dataset.role;
        const numVal = container.querySelector('#admin-submit-custom-num')?.value || '';
        if (!numVal) return;

        submitCustomNumBtn.disabled = true;
        submitCustomNumBtn.textContent = 'Saving...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          textValue: numVal
        });

        submitCustomNumBtn.disabled = false;
        if (res.success) {
          setDraft(selectedVideoNum, activeElement.key, '');
          setFeedback(selectedVideoNum, {
            type: 'success',
            text: `✓ ${role} successfully saved for Video #${selectedVideoNum}!`
          });
        } else {
          setFeedback(selectedVideoNum, {
            type: 'error',
            text: `Failed to save ${role}: ${res.error || 'Unknown error'}`
          });
        }
        render();
      });
    }

    const customTextInput = container.querySelector('#admin-submit-custom-text');
    if (customTextInput) {
      customTextInput.addEventListener('input', (e) => {
        setDraft(selectedVideoNum, activeElement.key, e.target.value);
      });
    }

    const submitCustomTextBtn = container.querySelector('#btn-submit-action-custom-text');
    if (submitCustomTextBtn) {
      submitCustomTextBtn.addEventListener('click', async () => {
        const role = submitCustomTextBtn.dataset.role;
        const textVal = (container.querySelector('#admin-submit-custom-text')?.value || '').trim();
        if (!textVal) return;

        submitCustomTextBtn.disabled = true;
        submitCustomTextBtn.textContent = 'Saving...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          textValue: textVal
        });

        submitCustomTextBtn.disabled = false;
        if (res.success) {
          setDraft(selectedVideoNum, activeElement.key, '');
          setFeedback(selectedVideoNum, {
            type: 'success',
            text: `✓ ${role} successfully saved for Video #${selectedVideoNum}!`
          });
        } else {
          setFeedback(selectedVideoNum, {
            type: 'error',
            text: `Failed to save ${role}: ${res.error || 'Unknown error'}`
          });
        }
        render();
      });
    }
  }

  render();
}
