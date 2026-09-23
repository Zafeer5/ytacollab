import { store, downloadFileSecurely } from '../../lib/store.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Session-level persistent state for team member view across renders & store updates
const teamSession = {
  localFiles: {},
  submissionStatus: {},
  taskFeedback: {},
  inProgressDrafts: {},
  thumbPreviewUrl: null,
  voPreviewUrl: null
};

function clearTeamSession() {
  if (teamSession.thumbPreviewUrl) {
    try {
      URL.revokeObjectURL(teamSession.thumbPreviewUrl);
    } catch (e) {}
    teamSession.thumbPreviewUrl = null;
  }
  if (teamSession.voPreviewUrl) {
    try {
      URL.revokeObjectURL(teamSession.voPreviewUrl);
    } catch (e) {}
    teamSession.voPreviewUrl = null;
  }
  Object.keys(teamSession.localFiles).forEach((k) => delete teamSession.localFiles[k]);
  Object.keys(teamSession.submissionStatus).forEach((k) => delete teamSession.submissionStatus[k]);
  Object.keys(teamSession.taskFeedback).forEach((k) => delete teamSession.taskFeedback[k]);
  Object.keys(teamSession.inProgressDrafts).forEach((k) => delete teamSession.inProgressDrafts[k]);
}

export function renderTeamMemberView(container, navigate) {
  let selectedChannelId = sessionStorage.getItem('yta_team_channel_id') || '';
  let selectedVideoNum = sessionStorage.getItem('yta_team_video_num') || '';

  function renderPromptsBox(roleName) {
    const prompts = store.getPromptsForRole(roleName, selectedChannelId);
    const selectedChannel = store.getState().channels?.find((c) => c.id === selectedChannelId);
    const channelLabel = selectedChannel ? selectedChannel.name : 'Channel';

    if (!prompts || prompts.length === 0) {
      return `
        <div class="prompts-container" style="padding: 8px 12px; margin-bottom: 10px; border: 1px dashed var(--border); border-radius: var(--radius); background: rgba(255,255,255,0.01);">
          <div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            <span>No ${roleName} prompts configured for ${channelLabel} yet.</span>
          </div>
        </div>
      `;
    }

    const itemsHtml = prompts
      .map(
        (p) => `
        <div class="prompt-box-item" style="padding: 8px 10px; background-color: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${p.label}</span>
              <button type="button" class="btn-prompt-toggle" data-prompt-id="${p.id}">Expand</button>
            </div>
            <button type="button" class="btn btn-secondary btn-sm btn-copy-prompt" data-prompt-text="${encodeURIComponent(p.promptText)}">
              Copy Prompt
            </button>
          </div>
          <div class="prompt-scrollable-content" id="prompt-body-${p.id}">${p.promptText}</div>
        </div>
      `
      )
      .join('');

    return `
      <div class="prompts-container" style="max-height: 220px; overflow-y: auto;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span class="section-label" style="margin-bottom: 0;">Prompts for ${channelLabel}:</span>
        </div>
        ${itemsHtml}
      </div>
    `;
  }

  function render() {
    const state = store.getState();
    const user = state.currentUser;

    if (!user || user.role !== 'TEAM_MEMBER') {
      navigate('#/login');
      return;
    }

    const assignedRoles = user.assignedRoles || [];
    const channels = state.channels || [];

    // Filter videos only if a channel is selected
    const channelVideos = selectedChannelId
      ? state.videos.filter((v) => v.channelId === selectedChannelId).sort((a, b) => a.videoNumber - b.videoNumber)
      : [];

    // Validate selectedVideoNum exists within current channel
    if (selectedVideoNum && !channelVideos.some((v) => String(v.videoNumber) === String(selectedVideoNum))) {
      selectedVideoNum = '';
      sessionStorage.setItem('yta_team_video_num', '');
    }

    // Target video is populated ONLY when both channel and video # are explicitly selected
    const currentVideo = selectedChannelId && selectedVideoNum
      ? channelVideos.find((v) => String(v.videoNumber) === String(selectedVideoNum))
      : null;

    // Contextual title display
    const autoFetchedTitle = !selectedChannelId
      ? '— Select a Channel'
      : !selectedVideoNum
      ? '— Select a Video #'
      : currentVideo
      ? (currentVideo.title || '— (No Title Found)')
      : '— (Video Not Found)';

    // Channel dropdown options
    const channelOptions = [
      `<option value="" ${!selectedChannelId ? 'selected' : ''}>-- Select Channel --</option>`,
      ...channels.map((c) => `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
    ].join('');

    // Video # dropdown options (displays "(marked as done)" when checked by admin)
    const videoNumOptions = [
      `<option value="" ${!selectedVideoNum ? 'selected' : ''}>-- Select Video # --</option>`,
      ...channelVideos.map((v) => {
        const doneLabel = v.status ? ' (marked as done)' : '';
        return `<option value="${v.videoNumber}" ${String(v.videoNumber) === String(selectedVideoNum) ? 'selected' : ''}>Video ${v.videoNumber}${doneLabel}</option>`;
      })
    ].join('');

    // User notifications
    const myNotifications = (state.notifications || []).filter(
      (n) => n.targetUsername === user.username
    );

    // Shared ledger entries
    const ledgerEntries = (state.ledger || []).slice(0, 8);
    const ledgerHtml = ledgerEntries
      .map((e) => `
        <div class="ledger-item">
          <div class="ledger-item-header">
            <div>
              <span class="ledger-actor">${e.actor}</span>
              <span class="ledger-desc"> ${e.action}</span>
            </div>
            <span class="ledger-time">${e.timestamp}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Channel: ${e.channel} ${e.videoNumber ? `• Video ${e.videoNumber}` : ''} • Task: ${e.task}
          </div>
          ${e.fileReference ? `<div class="ledger-ref">${e.fileReference}</div>` : ''}
        </div>
      `)
      .join('');

    // Role detection
    const hasThumbnailRole = assignedRoles.some((r) => r.toLowerCase() === 'thumbnail');
    const hasMetaRole = assignedRoles.some((r) => r.toLowerCase() === 'meta info' || r.toLowerCase() === 'meta');
    const hasScriptRole = assignedRoles.some((r) => r.toLowerCase() === 'script');
    const hasVoiceoverRole = assignedRoles.some((r) => r.toLowerCase() === 'voiceover');
    const hasAvailableScript = Boolean(currentVideo?.script && currentVideo.script.trim());

    const standardRoles = ['thumbnail', 'meta info', 'meta', 'script', 'voiceover'];
    const genericRoles = assignedRoles.filter(
      (r) => !standardRoles.includes(r.toLowerCase())
    );

    let taskSectionsHtml = '';

    // If team member has not chosen channel and video, show clean guidance
    if (!currentVideo) {
      const selectedChannel = channels.find((c) => c.id === selectedChannelId);
      const channelName = selectedChannel ? selectedChannel.name : '';

      let channelPromptsPreview = '';
      if (selectedChannelId && assignedRoles.length > 0) {
        const assignedPrompts = assignedRoles.flatMap((r) => {
          const pList = store.getPromptsForRole(r, selectedChannelId);
          return pList.map((p) => ({ ...p, roleName: r }));
        });

        if (assignedPrompts.length > 0) {
          channelPromptsPreview = `
            <div style="margin-top: 20px; text-align: left;">
              <h4 style="margin-bottom: 10px; font-size: 13px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                Prompts for <strong>${channelName}</strong> (${assignedPrompts.length} prompt${assignedPrompts.length > 1 ? 's' : ''} for your roles):
              </h4>
              <div class="prompts-container" style="max-height: 240px; overflow-y: auto;">
                ${assignedPrompts.map((p) => `
                  <div class="prompt-box-item" style="padding: 8px 10px; background-color: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="sidebar-tag" style="color: var(--text-primary); border-color: var(--text-primary); font-size: 10px;">${p.roleName}</span>
                        <span style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${p.label}</span>
                        <button type="button" class="btn-prompt-toggle" data-prompt-id="${p.id}">Expand</button>
                      </div>
                      <button type="button" class="btn btn-secondary btn-sm btn-copy-prompt" data-prompt-text="${encodeURIComponent(p.promptText)}">
                        Copy Prompt
                      </button>
                    </div>
                    <div class="prompt-scrollable-content" id="prompt-body-${p.id}">${p.promptText}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        } else {
          channelPromptsPreview = `
            <div style="margin-top: 16px; padding: 10px 14px; border: 1px dashed var(--border); border-radius: var(--radius); background: rgba(255,255,255,0.01); text-align: center; font-size: 12px; color: var(--text-muted);">
              No prompts currently configured for <strong>${channelName}</strong> for your assigned roles.
            </div>
          `;
        }
      }

      taskSectionsHtml = `
        <div class="card" style="padding: 28px 20px; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius); margin-top: 16px;">
          <h3 style="margin-bottom: 6px; font-size: 15px; color: var(--text-primary);">
            ${!selectedChannelId ? 'Select Channel' : 'Select Video #'}
          </h3>
          <p class="helper-text" style="max-width: 440px; margin: 0 auto;">
            ${!selectedChannelId
              ? 'Choose a channel above to load videos and prompt templates.'
              : `Select a video from ${escapeHtml(channelName)} to submit content.`}
          </p>
          ${channelPromptsPreview}
        </div>
      `;
    } else {
      // 1. Thumbnail / Meta Section
      if (hasThumbnailRole || hasMetaRole) {
        let thumbHtml = '';
        if (hasThumbnailRole) {
          const hasExistingThumb = Boolean(currentVideo?.thumbnail && currentVideo.thumbnail.name);
          const existingThumbName = hasExistingThumb ? currentVideo.thumbnail.name : '';
          const selectedThumbFile = teamSession.localFiles['thumbnail'];
          const isThumbSubmitted = teamSession.submissionStatus['thumbnail'] || hasExistingThumb;

          const thumbFeedbackBanner = teamSession.taskFeedback['thumbnail']
            ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 10px;">${teamSession.taskFeedback['thumbnail']}</div>`
            : '';

          // Mini Thumbnail Preview Box (compact and responsive for mobile)
          let thumbPreviewHtml = '';
          if (selectedThumbFile && teamSession.thumbPreviewUrl) {
            thumbPreviewHtml = `
              <div class="thumb-mini-preview">
                <img src="${teamSession.thumbPreviewUrl}" alt="Attached preview" />
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${selectedThumbFile.name}</div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Attached preview (${Math.round(selectedThumbFile.size / 1024)} KB)</div>
                </div>
              </div>
            `;
          } else if (hasExistingThumb) {
            thumbPreviewHtml = `
              <div class="thumb-mini-preview">
                ${currentVideo.thumbnail.url && currentVideo.thumbnail.url !== '#'
                  ? `<img src="${currentVideo.thumbnail.url}" alt="Thumbnail in database" />`
                  : '<div style="width: 110px; height: 62px; display: flex; align-items: center; justify-content: center; background: #141416; border: 1px solid var(--border); border-radius: 4px; font-size: 11px; color: var(--text-muted);">No Preview</div>'
                }
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${existingThumbName}</div>
                  <div style="font-size: 11px; color: #10b981; margin-top: 2px;">✓ Thumbnail in database</div>
                </div>
              </div>
            `;
          }

          thumbHtml = `
            <div style="padding-bottom: 16px; border-bottom: 1px solid var(--border); margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <h3 style="margin-bottom: 0;">Upload Thumbnail</h3>
                  ${isThumbSubmitted ? '<span class="status-submitted">✓ Thumbnail Submitted.</span>' : ''}
                </div>
              </div>

              ${thumbFeedbackBanner}

              <!-- Role Prompts -->
              ${renderPromptsBox('thumbnail')}

              <div class="file-actions" style="margin-top: 10px;">
                <input type="file" id="input-thumb-file" accept="image/*" style="display: none;" />
                <button type="button" id="btn-attach-thumb" class="btn btn-secondary btn-sm">${hasExistingThumb ? 'Change Image' : 'Attach Image'}</button>
                ${selectedThumbFile ? `
                  <button type="button" id="btn-remove-thumb" class="btn btn-danger btn-sm">Clear Selection</button>
                ` : ''}
                <button type="button" id="btn-submit-thumb" class="btn btn-primary btn-sm" ${!selectedThumbFile ? 'disabled' : ''}>
                  ${hasExistingThumb ? 'Replace & Submit Image' : 'Submit Image'}
                </button>
                ${isThumbSubmitted ? '<span class="status-submitted" style="margin-left: auto;">Submitted to Database</span>' : ''}
              </div>

              ${thumbPreviewHtml}
            </div>
          `;
        }

        let metaHtml = '';
        if (hasMetaRole) {
          const hasExistingMeta = Boolean(currentVideo?.metaInfo && currentVideo.metaInfo.trim());
          const isMetaSubmitted = teamSession.submissionStatus['meta'] || hasExistingMeta;

          const metaFeedbackBanner = teamSession.taskFeedback['meta']
            ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 10px;">${teamSession.taskFeedback['meta']}</div>`
            : '';

          const metaTextValue = teamSession.inProgressDrafts['meta'] !== undefined
            ? teamSession.inProgressDrafts['meta']
            : (currentVideo?.metaInfo || '');

          metaHtml = `
            <div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <h3 style="margin-bottom: 0;">Paste Meta Info (Description &amp; tags)</h3>
                  ${isMetaSubmitted ? '<span class="status-submitted">✓ Meta Info Submitted.</span>' : ''}
                </div>
              </div>

              ${metaFeedbackBanner}

              <!-- Role Prompts -->
              ${renderPromptsBox('Meta Info')}

              <textarea id="input-meta-info" rows="4" placeholder="Paste description and tags here...">${metaTextValue}</textarea>
              <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                <button type="button" id="btn-submit-meta" class="btn btn-primary btn-sm">
                  ${hasExistingMeta ? 'Replace & Submit Meta Info' : 'Submit Meta Information'}
                </button>
                ${isMetaSubmitted ? '<span class="status-submitted">Submitted to Database</span>' : ''}
              </div>
            </div>
          `;
        }

        taskSectionsHtml += `
          <div class="card">
            <h2>Thumbnail / Meta page</h2>
            ${thumbHtml}
            ${metaHtml}
          </div>
        `;
      }

      // 2. Script / Voiceover Section
      if (hasScriptRole || hasVoiceoverRole) {
        let scriptHtml = '';
        if (hasScriptRole) {
          const hasExistingScript = Boolean(currentVideo?.script && currentVideo.script.trim());
          const isScriptSubmitted = teamSession.submissionStatus['script'] || hasExistingScript;

          const scriptFeedbackBanner = teamSession.taskFeedback['script']
            ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 10px;">${teamSession.taskFeedback['script']}</div>`
            : '';

          const scriptTextValue = teamSession.inProgressDrafts['script'] !== undefined
            ? teamSession.inProgressDrafts['script']
            : (currentVideo?.script || '');

          scriptHtml = `
            <div style="padding-bottom: 16px; border-bottom: 1px solid var(--border); margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <h3 style="margin-bottom: 0;">Submit Script</h3>
                  ${isScriptSubmitted ? '<span class="status-submitted">✓ Script Submitted.</span>' : ''}
                </div>
              </div>

              ${scriptFeedbackBanner}

              <!-- Role Prompts -->
              ${renderPromptsBox('Script')}

              <textarea id="input-script-text" rows="5" placeholder="Type or paste your script here...">${scriptTextValue}</textarea>
              <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                <button type="button" id="btn-submit-script" class="btn btn-primary btn-sm">
                  ${hasExistingScript ? 'Replace & Submit Script' : 'Submit Script'}
                </button>
                ${isScriptSubmitted ? '<span class="status-submitted">Submitted to Database</span>' : ''}
              </div>
            </div>
          `;
        }

        let voHtml = '';
        if (hasVoiceoverRole) {
          const hasExistingVo = Boolean(currentVideo?.voiceover && currentVideo.voiceover.name);
          const existingVoName = hasExistingVo ? currentVideo.voiceover.name : '';
          const selectedVoFile = teamSession.localFiles['voiceover'];
          const isVoSubmitted = teamSession.submissionStatus['voiceover'] || hasExistingVo;

          const voFeedbackBanner = teamSession.taskFeedback['voiceover']
            ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 10px;">${teamSession.taskFeedback['voiceover']}</div>`
            : '';

          // Audio file in-browser player & download
          let voPreviewHtml = '';
          if (selectedVoFile && teamSession.voPreviewUrl) {
            voPreviewHtml = `
              <div class="audio-player-container">
                <div class="audio-meta">
                  <div style="min-width: 0;">
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(selectedVoFile.name)}</div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">Ready to submit (${Math.round(selectedVoFile.size / 1024)} KB) • Play below to review in browser</div>
                  </div>
                </div>
                <audio controls src="${teamSession.voPreviewUrl}" preload="metadata" style="width: 100%; height: 36px;"></audio>
              </div>
            `;
          } else if (hasExistingVo) {
            const voUrlValid = Boolean(currentVideo?.voiceover?.url && currentVideo.voiceover.url.startsWith('http'));
            voPreviewHtml = `
              <div class="audio-player-container">
                <div class="audio-meta">
                  <div style="min-width: 0;">
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(existingVoName)}</div>
                    <div style="font-size: 11px; color: ${voUrlValid ? '#10b981' : '#f59e0b'}; font-weight: 600; margin-top: 1px;">
                      ${voUrlValid ? '✓ Available in database • Listen in browser or download below' : 'File missing from storage • Please re-upload below'}
                    </div>
                  </div>
                  ${voUrlValid ? `
                    <button type="button" class="btn btn-secondary btn-sm btn-download-vo" data-url="${escapeHtml(currentVideo.voiceover.url)}" data-filename="${escapeHtml(existingVoName)}" title="Download audio">
                      Download
                    </button>
                  ` : ''}
                </div>
                ${voUrlValid ? `<audio controls src="${currentVideo.voiceover.url}" preload="metadata" style="width: 100%; height: 36px;"></audio>` : ''}
              </div>
            `;
          }

          voHtml = `
            <div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <h3 style="margin-bottom: 0;">Upload voiceover file</h3>
                  ${isVoSubmitted ? '<span class="status-submitted">✓ Voiceover Submitted.</span>' : ''}
                </div>
              </div>

              ${voFeedbackBanner}

              <!-- Role Prompts -->
              ${renderPromptsBox('voiceover')}

              <div class="file-actions" style="margin-top: 10px;">
                <input type="file" id="input-vo-file" accept="audio/*" style="display: none;" />
                <button type="button" id="btn-upload-vo" class="btn btn-secondary btn-sm">${hasExistingVo ? 'Change Audio File' : 'Attach Voiceover'}</button>
                ${selectedVoFile ? `
                  <button type="button" id="btn-remove-vo" class="btn btn-danger btn-sm">Clear Selection</button>
                ` : ''}
                <button type="button" id="btn-submit-vo" class="btn btn-primary btn-sm" ${!selectedVoFile ? 'disabled' : ''}>
                  ${hasExistingVo ? 'Replace & Submit Voiceover' : 'Submit Voiceover'}
                </button>
                ${isVoSubmitted ? '<span class="status-submitted" style="margin-left: auto;">Submitted to Database</span>' : ''}
              </div>

              ${voPreviewHtml}
            </div>
          `;
        }

        taskSectionsHtml += `
          <div class="card">
            <h2>Script / Voiceover page</h2>
            ${scriptHtml}
            ${voHtml}
          </div>
        `;
      }

      // 3. Generic Task List View (for custom roles)
      if (genericRoles.length > 0) {
        const genericTasksHtml = genericRoles
          .map((roleName, index) => {
            const roleDef = state.roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase()) || { inputType: 'Text' };
            const hasExistingCustom = Boolean(currentVideo?.customFields?.[roleName]);
            const isDone = teamSession.submissionStatus[roleName] || hasExistingCustom;
            const selectedCustomFile = teamSession.localFiles[roleName];

            const customFeedbackBanner = teamSession.taskFeedback[roleName]
              ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 10px;">${teamSession.taskFeedback[roleName]}</div>`
              : '';

            const customVal = teamSession.inProgressDrafts[roleName] !== undefined
              ? teamSession.inProgressDrafts[roleName]
              : (currentVideo?.customFields?.[roleName] || '');

            let controlHtml = '';
            if (roleDef.inputType === 'Attach File') {
              controlHtml = `
                <div class="file-actions" style="margin-top: 8px;">
                  <input type="file" id="input-file-${roleName}" style="display: none;" />
                  <button type="button" class="btn btn-secondary btn-sm btn-custom-upload" data-role="${roleName}">${hasExistingCustom ? 'Change File' : 'Upload File'}</button>
                  <button type="button" class="btn btn-primary btn-sm btn-custom-submit" data-role="${roleName}" ${!selectedCustomFile ? 'disabled' : ''}>
                    ${hasExistingCustom ? 'Replace & Submit' : 'Submit'}
                  </button>
                  ${isDone ? '<span class="status-submitted" style="margin-left: auto;">Submitted to Database</span>' : ''}
                </div>
                <div class="helper-text" style="margin-top: 6px;">
                  ${selectedCustomFile ? `Selected: <strong>${selectedCustomFile.name}</strong>` : hasExistingCustom ? `Current file in DB: <strong>${currentVideo.customFields[roleName].name}</strong>` : 'No file selected yet'}
                </div>
              `;
            } else if (roleDef.inputType === 'Number') {
              controlHtml = `
                <div style="display: flex; gap: 8px; align-items: center; max-width: 320px; margin-top: 8px;">
                  <input type="number" id="input-val-${roleName}" value="${customVal}" placeholder="Enter number..." />
                  <button type="button" class="btn btn-primary btn-sm btn-custom-submit-num" data-role="${roleName}">
                    ${hasExistingCustom ? 'Replace & Submit' : 'Submit'}
                  </button>
                  ${isDone ? '<span class="status-submitted">Submitted</span>' : ''}
                </div>
              `;
            } else {
              controlHtml = `
                <textarea id="input-val-${roleName}" rows="3" placeholder="Type or paste here...">${customVal}</textarea>
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 10px;">
                  <button type="button" id="btn-custom-submit-${roleName}" class="btn btn-primary btn-sm btn-custom-submit-text" data-role="${roleName}">
                    ${hasExistingCustom ? 'Replace & Submit' : 'Submit'}
                  </button>
                  ${isDone ? '<span class="status-submitted">Submitted to Database</span>' : ''}
                </div>
              `;
            }

            return `
              <div style="padding: 14px 0; border-bottom: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                  <span style="font-weight: 600;">Task ${index + 1}: ${roleName}</span>
                  ${isDone ? '<span class="status-submitted">✓ Task Done.</span>' : ''}
                </div>

                ${customFeedbackBanner}

                <!-- Role Prompts -->
                ${renderPromptsBox(roleName)}

                ${controlHtml}
              </div>
            `;
          })
          .join('');

        taskSectionsHtml += `
          <div class="card">
            <h2>Task List view</h2>
            ${genericTasksHtml}
          </div>
        `;
      }

      if (!taskSectionsHtml) {
        taskSectionsHtml = `
          <div class="card">
            <div class="helper-text">No task roles have been assigned to your account yet. Please contact the administrator.</div>
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="main-content">
        <!-- Common Elements Bar -->
        <div class="card" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <span class="section-label">Team Member</span>
              <div style="font-size: 16px; font-weight: 700;">${escapeHtml(user.username)}</div>
            </div>
          </div>

          <!-- Channel & Video Selection -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="member-channel-select">Select Channel</label>
              <select id="member-channel-select">
                ${channelOptions || '<option value="">No channels available</option>'}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label for="member-video-select" style="margin-bottom: 0;">Select Video #</label>
                ${currentVideo?.status ? '<span class="badge-done">✓ (marked as done)</span>' : ''}
              </div>
              <select id="member-video-select" ${!selectedChannelId ? 'disabled' : ''}>
                ${videoNumOptions || '<option value="">No videos available</option>'}
              </select>
            </div>
          </div>

          <!-- Video Title -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="section-label" style="margin-bottom: 0;">Video Title</span>
                ${currentVideo?.status ? '<span class="badge-done">(marked as done)</span>' : ''}
              </div>
            </div>
            <div style="position: relative; font-size: 15px; font-weight: 600; padding: 10px 14px; padding-right: ${currentVideo && currentVideo.title ? '88px' : '14px'}; background-color: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-primary); min-height: 46px; display: flex; align-items: center; word-break: break-word;">
              <span>${escapeHtml(autoFetchedTitle)}</span>
              ${currentVideo && currentVideo.title ? `
                <button type="button" id="btn-copy-fetched-title" class="btn btn-secondary btn-sm" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 3px 10px; font-size: 11px; height: 26px; flex-shrink: 0;" title="Copy title to clipboard">
                  Copy
                </button>
              ` : ''}
            </div>

            <!-- Under Title Box: Meta Info Role Script Copy Action / Status -->
            ${hasMetaRole && currentVideo ? `
              <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 8px;">
                ${hasAvailableScript ? `
                  <button type="button" id="btn-copy-fetched-script" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 5px 12px;" title="Copy script for this video">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy Script</span>
                  </button>
                ` : `
                  <span style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 4px 8px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border); border-radius: var(--radius);">
                    no script available
                  </span>
                `}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Role Task Forms with Prompts -->
        ${taskSectionsHtml}

        <!-- Shared Stacked Ledger -->
        <div class="card">
          <h2>List of Added content (All transactions stacked recorded like a ledger)</h2>
          <div class="scrollable-container" style="max-height: 280px; margin-top: 10px;">
            <div class="ledger-list">
              ${ledgerHtml || '<div style="padding: 16px;" class="helper-text">No ledger entries recorded yet.</div>'}
            </div>
          </div>
        </div>
      </div>
    `;

    const copyTitleBtn = container.querySelector('#btn-copy-fetched-title');
    if (copyTitleBtn && currentVideo?.title) {
      copyTitleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(currentVideo.title);
          const original = copyTitleBtn.textContent;
          copyTitleBtn.textContent = 'Copied!';
          setTimeout(() => {
            if (copyTitleBtn) copyTitleBtn.textContent = original;
          }, 1500);
        } catch (err) {
          console.error('Failed to copy title:', err);
        }
      });
    }

    const copyScriptBtn = container.querySelector('#btn-copy-fetched-script');
    if (copyScriptBtn && currentVideo?.script) {
      copyScriptBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(currentVideo.script);
          const originalHtml = copyScriptBtn.innerHTML;
          copyScriptBtn.innerHTML = `<span>✓ Copied Script!</span>`;
          setTimeout(() => {
            if (copyScriptBtn) copyScriptBtn.innerHTML = originalHtml;
          }, 1500);
        } catch (err) {
          console.error('Failed to copy script:', err);
        }
      });
    }

    const chanSelect = container.querySelector('#member-channel-select');
    if (chanSelect) {
      chanSelect.addEventListener('change', (e) => {
        selectedChannelId = e.target.value;
        sessionStorage.setItem('yta_team_channel_id', selectedChannelId);
        selectedVideoNum = '';
        sessionStorage.setItem('yta_team_video_num', '');
        clearTeamSession();
        render();
      });
    }

    const vidSelect = container.querySelector('#member-video-select');
    if (vidSelect) {
      vidSelect.addEventListener('change', (e) => {
        selectedVideoNum = e.target.value;
        sessionStorage.setItem('yta_team_video_num', selectedVideoNum);
        clearTeamSession();
        render();
      });
    }

    // Input listeners to preserve typed drafts across renders
    const metaInput = container.querySelector('#input-meta-info');
    if (metaInput) {
      metaInput.addEventListener('input', (e) => {
        teamSession.inProgressDrafts['meta'] = e.target.value;
      });
    }

    const scriptInput = container.querySelector('#input-script-text');
    if (scriptInput) {
      scriptInput.addEventListener('input', (e) => {
        teamSession.inProgressDrafts['script'] = e.target.value;
      });
    }

    // Expand/Collapse Prompt Toggle Buttons
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

    // Copy Prompt Buttons
    container.querySelectorAll('.btn-copy-prompt').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const raw = decodeURIComponent(e.target.dataset.promptText || '');
        try {
          await navigator.clipboard.writeText(raw);
          const original = e.target.textContent;
          e.target.textContent = 'Copied!';
          setTimeout(() => {
            e.target.textContent = original;
          }, 1500);
        } catch (err) {
          console.error('Clipboard copy failed:', err);
        }
      });
    });

    // Thumbnail Event Handlers
    const thumbInput = container.querySelector('#input-thumb-file');
    const attachThumbBtn = container.querySelector('#btn-attach-thumb');
    const removeThumbBtn = container.querySelector('#btn-remove-thumb');
    const submitThumbBtn = container.querySelector('#btn-submit-thumb');

    if (attachThumbBtn && thumbInput) {
      attachThumbBtn.addEventListener('click', () => thumbInput.click());
    }
    if (removeThumbBtn) {
      removeThumbBtn.addEventListener('click', () => {
        delete teamSession.localFiles['thumbnail'];
        if (teamSession.thumbPreviewUrl) {
          try {
            URL.revokeObjectURL(teamSession.thumbPreviewUrl);
          } catch (err) {}
          teamSession.thumbPreviewUrl = null;
        }
        render();
      });
    }
    if (thumbInput) {
      thumbInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          teamSession.localFiles['thumbnail'] = file;
          try {
            if (teamSession.thumbPreviewUrl) {
              URL.revokeObjectURL(teamSession.thumbPreviewUrl);
            }
            teamSession.thumbPreviewUrl = URL.createObjectURL(file);
          } catch (err) {}
          delete teamSession.taskFeedback['thumbnail'];
          render();
        }
      });
    }
    if (submitThumbBtn) {
      submitThumbBtn.addEventListener('click', async () => {
        const file = teamSession.localFiles['thumbnail'];
        if (!file) {
          teamSession.taskFeedback['thumbnail'] = 'Please select or attach an image file first before submitting.';
          render();
          return;
        }

        const hadPrevious = Boolean(currentVideo?.thumbnail && currentVideo.thumbnail.name);

        submitThumbBtn.disabled = true;
        submitThumbBtn.textContent = 'Uploading & Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'thumbnail',
          file: file
        });

        submitThumbBtn.disabled = false;
        submitThumbBtn.textContent = hadPrevious ? 'Replace & Submit Image' : 'Submit Image';

        if (res.success) {
          delete teamSession.localFiles['thumbnail'];
          if (teamSession.thumbPreviewUrl) {
            try {
              URL.revokeObjectURL(teamSession.thumbPreviewUrl);
            } catch (err) {}
            teamSession.thumbPreviewUrl = null;
          }
          teamSession.submissionStatus['thumbnail'] = 'Submitted';
          teamSession.taskFeedback['thumbnail'] = `✓ Thumbnail "${file.name}" successfully saved to database!`;
        } else {
          teamSession.taskFeedback['thumbnail'] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    }

    // Meta Info Handlers
    const submitMetaBtn = container.querySelector('#btn-submit-meta');
    if (submitMetaBtn) {
      submitMetaBtn.addEventListener('click', async () => {
        const inputEl = container.querySelector('#input-meta-info');
        const textVal = (inputEl?.value || teamSession.inProgressDrafts['meta'] || '').trim();
        if (!textVal) {
          teamSession.taskFeedback['meta'] = 'Please enter Meta information (description & tags) before submitting.';
          render();
          return;
        }

        const hadPrevious = Boolean(currentVideo?.metaInfo && currentVideo.metaInfo.trim());

        submitMetaBtn.disabled = true;
        submitMetaBtn.textContent = 'Submitting to database...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'Meta Info',
          textValue: textVal
        });

        submitMetaBtn.disabled = false;
        submitMetaBtn.textContent = hadPrevious ? 'Replace & Submit Meta Info' : 'Submit Meta Information';

        if (res.success) {
          delete teamSession.inProgressDrafts['meta'];
          teamSession.submissionStatus['meta'] = 'Submitted';
          teamSession.taskFeedback['meta'] = '✓ Meta Info successfully saved to database!';
        } else {
          teamSession.taskFeedback['meta'] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    }

    // Script Handlers
    const submitScriptBtn = container.querySelector('#btn-submit-script');
    if (submitScriptBtn) {
      submitScriptBtn.addEventListener('click', async () => {
        const inputEl = container.querySelector('#input-script-text');
        const scriptVal = (inputEl?.value || teamSession.inProgressDrafts['script'] || '').trim();
        if (!scriptVal) {
          teamSession.taskFeedback['script'] = 'Please enter script content before submitting.';
          render();
          return;
        }

        const hadPrevious = Boolean(currentVideo?.script && currentVideo.script.trim());

        submitScriptBtn.disabled = true;
        submitScriptBtn.textContent = 'Submitting to database...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'Script',
          textValue: scriptVal
        });

        submitScriptBtn.disabled = false;
        submitScriptBtn.textContent = hadPrevious ? 'Replace & Submit Script' : 'Submit Script';

        if (res.success) {
          delete teamSession.inProgressDrafts['script'];
          teamSession.submissionStatus['script'] = 'Submitted';
          teamSession.taskFeedback['script'] = '✓ Script successfully saved to database!';
        } else {
          teamSession.taskFeedback['script'] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    }

    // Voiceover Handlers
    const voInput = container.querySelector('#input-vo-file');
    const uploadVoBtn = container.querySelector('#btn-upload-vo');
    const removeVoBtn = container.querySelector('#btn-remove-vo');
    const submitVoBtn = container.querySelector('#btn-submit-vo');

    if (uploadVoBtn && voInput) {
      uploadVoBtn.addEventListener('click', () => voInput.click());
    }
    if (removeVoBtn) {
      removeVoBtn.addEventListener('click', () => {
        delete teamSession.localFiles['voiceover'];
        if (teamSession.voPreviewUrl) {
          try { URL.revokeObjectURL(teamSession.voPreviewUrl); } catch (e) {}
          teamSession.voPreviewUrl = null;
        }
        render();
      });
    }
    if (voInput) {
      voInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const f = e.target.files[0];
          teamSession.localFiles['voiceover'] = f;
          if (teamSession.voPreviewUrl) {
            try { URL.revokeObjectURL(teamSession.voPreviewUrl); } catch (err) {}
          }
          teamSession.voPreviewUrl = URL.createObjectURL(f);
          delete teamSession.taskFeedback['voiceover'];
          render();
        }
      });
    }
    if (submitVoBtn) {
      submitVoBtn.addEventListener('click', async () => {
        const file = teamSession.localFiles['voiceover'];
        if (!file) {
          teamSession.taskFeedback['voiceover'] = 'Please select or attach an audio voiceover file first.';
          render();
          return;
        }

        const hadPrevious = Boolean(currentVideo?.voiceover && currentVideo.voiceover.name);

        submitVoBtn.disabled = true;
        submitVoBtn.textContent = 'Uploading & Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'voiceover',
          file: file
        });

        submitVoBtn.disabled = false;
        submitVoBtn.textContent = hadPrevious ? 'Replace & Submit Voiceover' : 'Submit Voiceover';

        if (res.success) {
          delete teamSession.localFiles['voiceover'];
          if (teamSession.voPreviewUrl) {
            try { URL.revokeObjectURL(teamSession.voPreviewUrl); } catch (err) {}
            teamSession.voPreviewUrl = null;
          }
          teamSession.submissionStatus['voiceover'] = 'Submitted';
          teamSession.taskFeedback['voiceover'] = `✓ Voiceover "${file.name}" successfully saved to database!`;
        } else {
          teamSession.taskFeedback['voiceover'] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    }

    // Voiceover In-Browser Download Handler
    container.querySelectorAll('.btn-download-vo').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = btn.dataset.url;
        const filename = btn.dataset.filename || 'voiceover.mp3';
        const origText = btn.innerHTML;
        btn.textContent = 'Downloading...';
        btn.disabled = true;
        try {
          await downloadFileSecurely(url, filename);
        } catch (dlErr) {
          console.error('Voiceover download error:', dlErr);
        } finally {
          btn.innerHTML = origText;
          btn.disabled = false;
        }
      });
    });

    // Generic Handlers
    container.querySelectorAll('.btn-custom-upload').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const role = e.target.dataset.role;
        const fi = container.querySelector(`#input-file-${role}`);
        if (fi) {
          fi.onchange = (ev) => {
            if (ev.target.files && ev.target.files[0]) {
              teamSession.localFiles[role] = ev.target.files[0];
              delete teamSession.taskFeedback[role];
              render();
            }
          };
          fi.click();
        }
      });
    });

    container.querySelectorAll('.btn-custom-submit').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const role = e.target.dataset.role;
        const file = teamSession.localFiles[role];
        if (!file) {
          teamSession.taskFeedback[role] = `Please attach a file for ${role} before submitting.`;
          render();
          return;
        }

        const hadPrevious = Boolean(currentVideo?.customFields?.[role]);

        btn.disabled = true;
        btn.textContent = 'Submitting...';
        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          file: file
        });
        btn.disabled = false;

        if (res.success) {
          delete teamSession.localFiles[role];
          teamSession.submissionStatus[role] = 'Submitted';
          teamSession.taskFeedback[role] = `✓ ${role} "${file.name}" successfully saved to database!`;
        } else {
          teamSession.taskFeedback[role] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    });

    container.querySelectorAll('.btn-custom-submit-num').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const role = e.target.dataset.role;
        const val = (container.querySelector(`#input-val-${role}`)?.value || '').trim();
        if (!val) {
          teamSession.taskFeedback[role] = `Please enter a number for ${role} before submitting.`;
          render();
          return;
        }

        const hadPrevious = Boolean(currentVideo?.customFields?.[role]);

        btn.disabled = true;
        btn.textContent = 'Submitting...';
        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          textValue: val
        });
        btn.disabled = false;

        if (res.success) {
          delete teamSession.inProgressDrafts[role];
          teamSession.submissionStatus[role] = 'Submitted';
          teamSession.taskFeedback[role] = `✓ ${role} successfully saved to database!`;
        } else {
          teamSession.taskFeedback[role] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    });

    container.querySelectorAll('.btn-custom-submit-text').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const role = e.target.dataset.role;
        const val = (container.querySelector(`#input-val-${role}`)?.value || '').trim();
        if (!val) {
          teamSession.taskFeedback[role] = `Please enter text for ${role} before submitting.`;
          render();
          return;
        }

        const hadPrevious = Boolean(currentVideo?.customFields?.[role]);

        btn.disabled = true;
        btn.textContent = 'Submitting...';
        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          textValue: val
        });
        btn.disabled = false;

        if (res.success) {
          delete teamSession.inProgressDrafts[role];
          teamSession.submissionStatus[role] = 'Submitted';
          teamSession.taskFeedback[role] = `✓ ${role} successfully saved to database!`;
        } else {
          teamSession.taskFeedback[role] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    });
  }

  render();
}
