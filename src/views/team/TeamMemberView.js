import { store } from '../../lib/store.js';

export function renderTeamMemberView(container, navigate) {
  let selectedChannelId = sessionStorage.getItem('yta_team_channel_id') || '';
  let selectedVideoNum = sessionStorage.getItem('yta_team_video_num') || '';

  // Track temporary file selections per task
  const localFiles = {};
  const submissionStatus = {}; // { [taskKey]: 'Submitted' }
  const taskFeedback = {}; // { [taskKey]: message }

  function renderPromptsBox(roleName) {
    const prompts = store.getPromptsForRole(roleName);
    if (!prompts || prompts.length === 0) return '';

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
          <span class="section-label" style="margin-bottom: 0;">Prompts (provided by admin):</span>
          <span class="helper-text" style="font-size: 11px;">Scroll or click Expand</span>
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
      ? '— (Please select a YouTube Channel)'
      : !selectedVideoNum
      ? '— (Please select a Video #)'
      : currentVideo
      ? (currentVideo.title || '— (No Title Found)')
      : '— (Video Not Found)';

    // Channel dropdown options (defaults to clean unselected prompt)
    const channelOptions = [
      `<option value="" ${!selectedChannelId ? 'selected' : ''}>-- Select Channel --</option>`,
      ...channels.map((c) => `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>${c.name}</option>`)
    ].join('');

    // Video # dropdown options (defaults to clean unselected prompt)
    const videoNumOptions = [
      `<option value="" ${!selectedVideoNum ? 'selected' : ''}>-- Select Video # --</option>`,
      ...channelVideos.map((v) => `<option value="${v.videoNumber}" ${String(v.videoNumber) === String(selectedVideoNum) ? 'selected' : ''}>Video ${v.videoNumber}</option>`)
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

    const standardRoles = ['thumbnail', 'meta info', 'meta', 'script', 'voiceover'];
    const genericRoles = assignedRoles.filter(
      (r) => !standardRoles.includes(r.toLowerCase())
    );

    let taskSectionsHtml = '';

    // If team member has not chosen channel and video, show clean guidance
    if (!currentVideo) {
      taskSectionsHtml = `
        <div class="card" style="padding: 36px 20px; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius); margin-top: 16px;">
          <div style="font-size: 32px; margin-bottom: 10px;">🎬</div>
          <h3 style="margin-bottom: 6px; font-size: 16px; color: var(--text-primary);">No Video Selected</h3>
          <p class="helper-text" style="max-width: 480px; margin: 0 auto;">
            Please select your YouTube Channel and Video # above to view task guidelines, prompts, and submit your content.
          </p>
        </div>
      `;
    } else {
      // 1. Thumbnail / Meta Section
      if (hasThumbnailRole || hasMetaRole) {
        let thumbHtml = '';
        if (hasThumbnailRole) {
          const hasExistingThumb = Boolean(currentVideo?.thumbnail && currentVideo.thumbnail.name);
          const existingThumbName = hasExistingThumb ? currentVideo.thumbnail.name : '';
          const selectedThumbFile = localFiles['thumbnail'];
          const isThumbSubmitted = submissionStatus['thumbnail'] || hasExistingThumb;

          // Overwrite warning appears ONLY when there is already an existing file in DB AND a replacement file is selected!
          const thumbOverwriteWarning = hasExistingThumb && selectedThumbFile
            ? `
              <div class="overwrite-warning-box">
                <span>⚠️ <strong>Warning:</strong> Thumbnail is already available in the database (<code>${existingThumbName}</code>). If you submit, that previous one will be replaced with new thumbnail (<code>${selectedThumbFile.name}</code>).</span>
              </div>
            `
            : '';

          const thumbFeedbackBanner = taskFeedback['thumbnail']
            ? `<div class="notification-banner" style="background-color: var(--success-bg); border-color: var(--success-border); color: var(--success-text); margin-bottom: 10px;">${taskFeedback['thumbnail']}</div>`
            : '';

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

              <!-- Overwrite warning if replacing existing DB file -->
              ${thumbOverwriteWarning}

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

              <div id="thumb-filename-display" class="helper-text" style="margin-top: 8px;">
                ${selectedThumbFile 
                  ? `Selected: <strong>${selectedThumbFile.name}</strong> ${hasExistingThumb ? `<em>(will replace ${existingThumbName})</em>` : ''}` 
                  : hasExistingThumb 
                  ? `Current file in DB: <strong>${existingThumbName}</strong>` 
                  : 'No image attached yet'}
              </div>
            </div>
          `;
        }

        let metaHtml = '';
        if (hasMetaRole) {
          const hasExistingMeta = Boolean(currentVideo?.metaInfo && currentVideo.metaInfo.trim());
          const isMetaSubmitted = submissionStatus['meta'] || hasExistingMeta;

          const metaOverwriteWarning = hasExistingMeta
            ? `
              <div class="overwrite-warning-box">
                <span>⚠️ <strong>Warning:</strong> Meta Info is already available in the database. If you submit, that previous one will be replaced with new Meta Info.</span>
              </div>
            `
            : '';

          const metaFeedbackBanner = taskFeedback['meta']
            ? `<div class="notification-banner" style="background-color: var(--success-bg); border-color: var(--success-border); color: var(--success-text); margin-bottom: 10px;">${taskFeedback['meta']}</div>`
            : '';

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

              <!-- Overwrite warning if meta already in DB -->
              ${metaOverwriteWarning}

              <textarea id="input-meta-info" rows="4" placeholder="Paste description and tags here...">${currentVideo?.metaInfo || ''}</textarea>
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
          const isScriptSubmitted = submissionStatus['script'] || hasExistingScript;

          const scriptOverwriteWarning = hasExistingScript
            ? `
              <div class="overwrite-warning-box">
                <span>⚠️ <strong>Warning:</strong> Script is already available in the database. If you submit, that previous one will be replaced with new Script.</span>
              </div>
            `
            : '';

          const scriptFeedbackBanner = taskFeedback['script']
            ? `<div class="notification-banner" style="background-color: var(--success-bg); border-color: var(--success-border); color: var(--success-text); margin-bottom: 10px;">${taskFeedback['script']}</div>`
            : '';

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

              <!-- Overwrite warning if script already in DB -->
              ${scriptOverwriteWarning}

              <textarea id="input-script-text" rows="5" placeholder="Type or paste your script here...">${currentVideo?.script || ''}</textarea>
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
          const selectedVoFile = localFiles['voiceover'];
          const isVoSubmitted = submissionStatus['voiceover'] || hasExistingVo;

          // Overwrite warning appears ONLY when voiceover already exists in DB AND user selects a replacement file!
          const voOverwriteWarning = hasExistingVo && selectedVoFile
            ? `
              <div class="overwrite-warning-box">
                <span>⚠️ <strong>Warning:</strong> Voiceover file is already available in the database (<code>${existingVoName}</code>). If you submit, that previous one will be replaced with new voiceover (<code>${selectedVoFile.name}</code>).</span>
              </div>
            `
            : '';

          const voFeedbackBanner = taskFeedback['voiceover']
            ? `<div class="notification-banner" style="background-color: var(--success-bg); border-color: var(--success-border); color: var(--success-text); margin-bottom: 10px;">${taskFeedback['voiceover']}</div>`
            : '';

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

              <!-- Overwrite warning if replacing existing DB file -->
              ${voOverwriteWarning}

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

              <div id="vo-filename-display" class="helper-text" style="margin-top: 8px;">
                ${selectedVoFile 
                  ? `Selected: <strong>${selectedVoFile.name}</strong> ${hasExistingVo ? `<em>(will replace ${existingVoName})</em>` : ''}` 
                  : hasExistingVo 
                  ? `Current file in DB: <strong>${existingVoName}</strong>` 
                  : 'No audio file attached yet'}
              </div>
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
            const isDone = submissionStatus[roleName] || hasExistingCustom;
            const selectedCustomFile = localFiles[roleName];

            const customOverwriteWarning = hasExistingCustom && (roleDef.inputType !== 'Attach File' || selectedCustomFile)
              ? `
                <div class="overwrite-warning-box">
                  <span>⚠️ <strong>Warning:</strong> ${roleName} is already available in the database. If you submit, that previous one will be replaced with new ${roleName}.</span>
                </div>
              `
              : '';

            const customFeedbackBanner = taskFeedback[roleName]
              ? `<div class="notification-banner" style="background-color: var(--success-bg); border-color: var(--success-border); color: var(--success-text); margin-bottom: 10px;">${taskFeedback[roleName]}</div>`
              : '';

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
                  <input type="number" id="input-val-${roleName}" value="${currentVideo?.customFields?.[roleName] || ''}" placeholder="Enter number..." />
                  <button type="button" class="btn btn-primary btn-sm btn-custom-submit-num" data-role="${roleName}">
                    ${hasExistingCustom ? 'Replace & Submit' : 'Submit'}
                  </button>
                  ${isDone ? '<span class="status-submitted">Submitted</span>' : ''}
                </div>
              `;
            } else {
              controlHtml = `
                <textarea id="input-val-${roleName}" rows="3" placeholder="Type or paste here...">${currentVideo?.customFields?.[roleName] || ''}</textarea>
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 10px;">
                  <button type="button" class="btn btn-primary btn-sm btn-custom-submit-text" data-role="${roleName}">
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

                <!-- Overwrite warning if already in DB -->
                ${customOverwriteWarning}

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
          <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px;">
            <div>
              <span class="section-label">Team_member_name</span>
              <div style="font-size: 16px; font-weight: 700;">${user.username}</div>
            </div>
            <button id="btn-member-logout" class="btn btn-danger btn-sm">Logout</button>
          </div>

          <!-- Channel & Video Selection (User selects manually) -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="member-channel-select">Select Channel</label>
              <select id="member-channel-select">
                ${channelOptions || '<option value="">No channels available</option>'}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label for="member-video-select">Select Video #</label>
              <select id="member-video-select" ${!selectedChannelId ? 'disabled' : ''}>
                ${videoNumOptions || '<option value="">No videos available</option>'}
              </select>
            </div>
          </div>

          <!-- Auto-fetched Title from DB -->
          <div>
            <span class="section-label">Title (auto-fetched from DB according to channel + video #)</span>
            <div style="font-size: 15px; font-weight: 600; padding: 10px 12px; background-color: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-primary);">
              ${autoFetchedTitle}
            </div>
          </div>
        </div>

        <!-- Notification Banner if any -->
        ${
          myNotifications.length > 0
            ? `
              <div class="notification-banner">
                <strong>Pending Task Notification:</strong>
                ${myNotifications.slice(0, 2).map((n) => `<div>${n.message}</div>`).join('')}
              </div>
            `
            : ''
        }

        <!-- Role Task Forms with Prompts and Overwrite Warnings -->
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

    // Handlers
    const logoutBtn = container.querySelector('#btn-member-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await store.logout();
        sessionStorage.removeItem('yta_team_channel_id');
        sessionStorage.removeItem('yta_team_video_num');
        navigate('#/landing');
      });
    }

    const chanSelect = container.querySelector('#member-channel-select');
    if (chanSelect) {
      chanSelect.addEventListener('change', (e) => {
        selectedChannelId = e.target.value;
        sessionStorage.setItem('yta_team_channel_id', selectedChannelId);
        selectedVideoNum = '';
        sessionStorage.setItem('yta_team_video_num', '');
        // Clear temp inputs
        Object.keys(localFiles).forEach((k) => delete localFiles[k]);
        Object.keys(submissionStatus).forEach((k) => delete submissionStatus[k]);
        Object.keys(taskFeedback).forEach((k) => delete taskFeedback[k]);
        render();
      });
    }

    const vidSelect = container.querySelector('#member-video-select');
    if (vidSelect) {
      vidSelect.addEventListener('change', (e) => {
        selectedVideoNum = e.target.value;
        sessionStorage.setItem('yta_team_video_num', selectedVideoNum);
        // Clear temp inputs
        Object.keys(localFiles).forEach((k) => delete localFiles[k]);
        Object.keys(submissionStatus).forEach((k) => delete submissionStatus[k]);
        Object.keys(taskFeedback).forEach((k) => delete taskFeedback[k]);
        render();
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
        delete localFiles['thumbnail'];
        render();
      });
    }
    if (thumbInput) {
      thumbInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          localFiles['thumbnail'] = e.target.files[0];
          render();
        }
      });
    }
    if (submitThumbBtn) {
      submitThumbBtn.addEventListener('click', async () => {
        if (!selectedThumbFile && !currentVideo?.thumbnail) return;
        const file = localFiles['thumbnail'];
        const hadPrevious = Boolean(currentVideo?.thumbnail && currentVideo.thumbnail.name);

        submitThumbBtn.disabled = true;
        submitThumbBtn.textContent = 'Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'thumbnail',
          file: file
        });

        submitThumbBtn.disabled = false;
        submitThumbBtn.textContent = hadPrevious ? 'Replace & Submit Image' : 'Submit Image';

        if (res.success) {
          delete localFiles['thumbnail'];
          submissionStatus['thumbnail'] = 'Submitted';
          taskFeedback['thumbnail'] = hadPrevious
            ? `✓ Previous thumbnail replaced with new file: "${file.name}" (Saved to database)`
            : `✓ Thumbnail "${file.name}" successfully submitted to database!`;
        } else {
          taskFeedback['thumbnail'] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    }

    // Meta Info Handlers
    const submitMetaBtn = container.querySelector('#btn-submit-meta');
    if (submitMetaBtn) {
      submitMetaBtn.addEventListener('click', async () => {
        const textVal = container.querySelector('#input-meta-info')?.value || '';
        const hadPrevious = Boolean(currentVideo?.metaInfo && currentVideo.metaInfo.trim());

        submitMetaBtn.disabled = true;
        submitMetaBtn.textContent = 'Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'Meta Info',
          textValue: textVal
        });

        submitMetaBtn.disabled = false;
        submitMetaBtn.textContent = hadPrevious ? 'Replace & Submit Meta Info' : 'Submit Meta Information';

        if (res.success) {
          submissionStatus['meta'] = 'Submitted';
          taskFeedback['meta'] = hadPrevious
            ? '✓ Previous Meta Info replaced with new submission (Saved in database)'
            : '✓ Meta Info successfully submitted to database!';
        } else {
          taskFeedback['meta'] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    }

    // Script Handlers
    const submitScriptBtn = container.querySelector('#btn-submit-script');
    if (submitScriptBtn) {
      submitScriptBtn.addEventListener('click', async () => {
        const scriptVal = container.querySelector('#input-script-text')?.value || '';
        const hadPrevious = Boolean(currentVideo?.script && currentVideo.script.trim());

        submitScriptBtn.disabled = true;
        submitScriptBtn.textContent = 'Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'Script',
          textValue: scriptVal
        });

        submitScriptBtn.disabled = false;
        submitScriptBtn.textContent = hadPrevious ? 'Replace & Submit Script' : 'Submit Script';

        if (res.success) {
          submissionStatus['script'] = 'Submitted';
          taskFeedback['script'] = hadPrevious
            ? '✓ Previous Script replaced with new submission (Saved in database)'
            : '✓ Script successfully submitted to database!';
        } else {
          taskFeedback['script'] = `Submission error: ${res.error || 'Failed to submit'}`;
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
        delete localFiles['voiceover'];
        render();
      });
    }
    if (voInput) {
      voInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          localFiles['voiceover'] = e.target.files[0];
          render();
        }
      });
    }
    if (submitVoBtn) {
      submitVoBtn.addEventListener('click', async () => {
        const file = localFiles['voiceover'];
        if (!file) return;
        const hadPrevious = Boolean(currentVideo?.voiceover && currentVideo.voiceover.name);

        submitVoBtn.disabled = true;
        submitVoBtn.textContent = 'Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'voiceover',
          file: file
        });

        submitVoBtn.disabled = false;
        submitVoBtn.textContent = hadPrevious ? 'Replace & Submit Voiceover' : 'Submit Voiceover';

        if (res.success) {
          delete localFiles['voiceover'];
          submissionStatus['voiceover'] = 'Submitted';
          taskFeedback['voiceover'] = hadPrevious
            ? `✓ Previous voiceover replaced with new file: "${file.name}" (Saved to database)`
            : `✓ Voiceover "${file.name}" successfully submitted to database!`;
        } else {
          taskFeedback['voiceover'] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    }

    // Generic Handlers
    container.querySelectorAll('.btn-custom-upload').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const role = e.target.dataset.role;
        const fi = container.querySelector(`#input-file-${role}`);
        if (fi) {
          fi.onchange = (ev) => {
            if (ev.target.files && ev.target.files[0]) {
              localFiles[role] = ev.target.files[0];
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
        const file = localFiles[role];
        if (!file) return;
        const hadPrevious = Boolean(currentVideo?.customFields?.[role]);

        btn.disabled = true;
        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          file: file
        });
        btn.disabled = false;

        if (res.success) {
          delete localFiles[role];
          submissionStatus[role] = 'Submitted';
          taskFeedback[role] = hadPrevious
            ? `✓ Previous ${role} replaced with new file: "${file.name}"`
            : `✓ ${role} "${file.name}" successfully submitted!`;
        } else {
          taskFeedback[role] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    });

    container.querySelectorAll('.btn-custom-submit-num').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const role = e.target.dataset.role;
        const val = container.querySelector(`#input-val-${role}`)?.value;
        const hadPrevious = Boolean(currentVideo?.customFields?.[role]);

        btn.disabled = true;
        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          textValue: val
        });
        btn.disabled = false;

        if (res.success) {
          submissionStatus[role] = 'Submitted';
          taskFeedback[role] = hadPrevious
            ? `✓ Previous ${role} replaced with new value`
            : `✓ ${role} successfully submitted!`;
        } else {
          taskFeedback[role] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    });

    container.querySelectorAll('.btn-custom-submit-text').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const role = e.target.dataset.role;
        const val = container.querySelector(`#input-val-${role}`)?.value;
        const hadPrevious = Boolean(currentVideo?.customFields?.[role]);

        btn.disabled = true;
        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: role,
          textValue: val
        });
        btn.disabled = false;

        if (res.success) {
          submissionStatus[role] = 'Submitted';
          taskFeedback[role] = hadPrevious
            ? `✓ Previous ${role} replaced with new value`
            : `✓ ${role} successfully submitted!`;
        } else {
          taskFeedback[role] = `Submission error: ${res.error || 'Failed to submit'}`;
        }
        render();
      });
    });
  }

  render();
}
