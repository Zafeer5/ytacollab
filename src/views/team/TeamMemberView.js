import { store } from '../../lib/store.js';

export function renderTeamMemberView(container, navigate) {
  let selectedChannelId = '';
  let selectedVideoNum = null;

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

    if (!selectedChannelId && channels.length > 0) {
      selectedChannelId = channels[0].id;
    }

    // Videos for selected channel
    const channelVideos = state.videos.filter((v) => v.channelId === selectedChannelId);
    channelVideos.sort((a, b) => a.videoNumber - b.videoNumber);

    if (channelVideos.length > 0 && selectedVideoNum === null) {
      selectedVideoNum = channelVideos[0].videoNumber;
    }

    // Auto-fetch title for selected channel + video #
    const currentVideo = channelVideos.find((v) => v.videoNumber === Number(selectedVideoNum));
    const autoFetchedTitle = currentVideo
      ? currentVideo.title
      : channels.length === 0
      ? '— (No Channels Created Yet)'
      : '— (No Videos Found for this Channel)';

    // Channel options
    const channelOptions = channels
      .map((c) => `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>${c.name}</option>`)
      .join('');

    // Video # options
    const videoNumOptions = channelVideos
      .map((v) => `<option value="${v.videoNumber}" ${v.videoNumber === Number(selectedVideoNum) ? 'selected' : ''}>Video ${v.videoNumber}</option>`)
      .join('');

    // User's active notifications
    const myNotifications = (state.notifications || []).filter(
      (n) => n.targetUsername === user.username
    );

    // Filter shared ledger for this member and channel
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

    // Roles matching
    const hasThumbnailRole = assignedRoles.some((r) => r.toLowerCase() === 'thumbnail');
    const hasMetaRole = assignedRoles.some((r) => r.toLowerCase() === 'meta info' || r.toLowerCase() === 'meta');
    const hasScriptRole = assignedRoles.some((r) => r.toLowerCase() === 'script');
    const hasVoiceoverRole = assignedRoles.some((r) => r.toLowerCase() === 'voiceover');

    const standardRoles = ['thumbnail', 'meta info', 'meta', 'script', 'voiceover'];
    const genericRoles = assignedRoles.filter(
      (r) => !standardRoles.includes(r.toLowerCase())
    );

    let taskSectionsHtml = '';

    // 1. Thumbnail / Meta Section
    if (hasThumbnailRole || hasMetaRole) {
      let thumbHtml = '';
      if (hasThumbnailRole) {
        const hasExistingThumb = Boolean(currentVideo?.thumbnail);
        const isThumbSubmitted = submissionStatus['thumbnail'] || hasExistingThumb;
        const selectedThumbFile = localFiles['thumbnail'];

        const thumbOverwriteWarning = hasExistingThumb
          ? `
            <div class="overwrite-warning-box">
              <span>⚠️ <strong>Warning:</strong> Thumbnail is already available in the database (<code>${currentVideo.thumbnail.name}</code>). If you still submit, that previous one will be replaced with new thumbnail.</span>
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

            <!-- Overwrite warning if file already in DB -->
            ${thumbOverwriteWarning}

            <div class="file-actions" style="margin-top: 10px;">
              <input type="file" id="input-thumb-file" accept="image/*" style="display: none;" />
              <button type="button" id="btn-attach-thumb" class="btn btn-secondary btn-sm">Attach Image</button>
              ${selectedThumbFile || hasExistingThumb ? `
                <button type="button" id="btn-replace-thumb" class="btn btn-secondary btn-sm">Replace Image</button>
                <button type="button" id="btn-remove-thumb" class="btn btn-danger btn-sm">Remove Image</button>
              ` : ''}
              <button type="button" id="btn-submit-thumb" class="btn btn-primary btn-sm" ${!selectedThumbFile && !hasExistingThumb ? 'disabled' : ''}>
                ${hasExistingThumb ? 'Replace & Submit Image' : 'Submit Image'}
              </button>
              ${isThumbSubmitted ? '<span class="status-submitted" style="margin-left: auto;">Submitted to Database</span>' : ''}
            </div>

            <div id="thumb-filename-display" class="helper-text" style="margin-top: 8px;">
              ${selectedThumbFile ? `Selected: <strong>${selectedThumbFile.name}</strong>` : hasExistingThumb ? `Current file in DB: <strong>${currentVideo.thumbnail.name}</strong>` : 'No image attached'}
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
              <span>⚠️ <strong>Warning:</strong> Meta Info is already available in the database. If you still submit, that previous one will be replaced with new Meta Info.</span>
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
              <button type="button" id="btn-submit-meta" class="btn btn-primary btn-sm" ${!currentVideo ? 'disabled' : ''}>
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
              <span>⚠️ <strong>Warning:</strong> Script is already available in the database. If you still submit, that previous one will be replaced with new Script.</span>
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

            <textarea id="input-script-text" rows="5" placeholder="Paste here...">${currentVideo?.script || ''}</textarea>
            <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
              <button type="button" id="btn-submit-script" class="btn btn-primary btn-sm" ${!currentVideo ? 'disabled' : ''}>
                ${hasExistingScript ? 'Replace & Submit Script' : 'Submit Script'}
              </button>
              ${isScriptSubmitted ? '<span class="status-submitted">Submitted to Database</span>' : ''}
            </div>
          </div>
        `;
      }

      let voHtml = '';
      if (hasVoiceoverRole) {
        const hasExistingVo = Boolean(currentVideo?.voiceover);
        const isVoSubmitted = submissionStatus['voiceover'] || hasExistingVo;
        const selectedVoFile = localFiles['voiceover'];

        const voOverwriteWarning = hasExistingVo
          ? `
            <div class="overwrite-warning-box">
              <span>⚠️ <strong>Warning:</strong> Voiceover file is already available in the database (<code>${currentVideo.voiceover.name}</code>). If you still submit, that previous one will be replaced with new voiceover.</span>
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
                <h3 style="margin-bottom: 0;">Upload Voiceover File</h3>
                ${isVoSubmitted ? '<span class="status-submitted">✓ Voiceover Submitted.</span>' : ''}
              </div>
            </div>

            ${voFeedbackBanner}

            <!-- Role Prompts -->
            ${renderPromptsBox('voiceover')}

            <!-- Overwrite warning if voiceover already in DB -->
            ${voOverwriteWarning}

            <div class="file-actions" style="margin-top: 10px;">
              <input type="file" id="input-vo-file" accept="audio/*" style="display: none;" />
              <button type="button" id="btn-upload-vo" class="btn btn-secondary btn-sm">Click Here to Upload</button>
              ${selectedVoFile || hasExistingVo ? `
                <button type="button" id="btn-replace-vo" class="btn btn-secondary btn-sm">Replace File</button>
                <button type="button" id="btn-remove-vo" class="btn btn-danger btn-sm">Remove File</button>
              ` : ''}
              <button type="button" id="btn-submit-vo" class="btn btn-primary btn-sm" ${!selectedVoFile && !hasExistingVo ? 'disabled' : ''}>
                ${hasExistingVo ? 'Replace & Submit File' : 'Submit'}
              </button>
              ${isVoSubmitted ? '<span class="status-submitted" style="margin-left: auto;">Submitted to Database</span>' : ''}
            </div>

            <div id="vo-filename-display" class="helper-text" style="margin-top: 8px;">
              ${selectedVoFile ? `Selected: <strong>${selectedVoFile.name}</strong>` : hasExistingVo ? `Current file in DB: <strong>${currentVideo.voiceover.name}</strong>` : 'No voiceover attached'}
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

          const customOverwriteWarning = hasExistingCustom
            ? `
              <div class="overwrite-warning-box">
                <span>⚠️ <strong>Warning:</strong> ${roleName} is already available in the database. If you still submit, that previous one will be replaced with new ${roleName}.</span>
              </div>
            `
            : '';

          const customFeedbackBanner = taskFeedback[roleName]
            ? `<div class="notification-banner" style="background-color: var(--success-bg); border-color: var(--success-border); color: var(--success-text); margin-bottom: 10px;">${taskFeedback[roleName]}</div>`
            : '';

          let controlHtml = '';
          if (roleDef.inputType === 'Attach File') {
            const selectedCustomFile = localFiles[roleName];
            controlHtml = `
              <div class="file-actions" style="margin-top: 8px;">
                <input type="file" id="input-file-${roleName}" style="display: none;" />
                <button type="button" class="btn btn-secondary btn-sm btn-custom-upload" data-role="${roleName}">Click Here to Upload</button>
                <button type="button" class="btn btn-primary btn-sm btn-custom-submit" data-role="${roleName}" ${!selectedCustomFile && !hasExistingCustom ? 'disabled' : ''}>
                  ${hasExistingCustom ? 'Replace & Submit' : 'Submit'}
                </button>
                ${isDone ? '<span class="status-submitted" style="margin-left: auto;">Submitted to Database</span>' : ''}
              </div>
              <div class="helper-text" style="margin-top: 6px;">
                ${selectedCustomFile ? `Selected: <strong>${selectedCustomFile.name}</strong>` : hasExistingCustom ? `Current file in DB: <strong>${currentVideo.customFields[roleName].name}</strong>` : 'No file selected'}
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
              <textarea id="input-val-${roleName}" rows="3" placeholder="Paste here...">${currentVideo?.customFields?.[roleName] || ''}</textarea>
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

          <!-- Channel & Video Selection -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="member-channel-select">Select Channel</label>
              <select id="member-channel-select">
                ${channelOptions || '<option value="">No channels available</option>'}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label for="member-video-select">Select Video #</label>
              <select id="member-video-select">
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
    container.querySelector('#btn-member-logout').addEventListener('click', () => {
      store.logout();
      navigate('#/landing');
    });

    const chanSelect = container.querySelector('#member-channel-select');
    if (chanSelect) {
      chanSelect.addEventListener('change', (e) => {
        selectedChannelId = e.target.value;
        selectedVideoNum = null;
        render();
      });
    }

    const vidSelect = container.querySelector('#member-video-select');
    if (vidSelect) {
      vidSelect.addEventListener('change', (e) => {
        selectedVideoNum = Number(e.target.value);
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
    const replaceThumbBtn = container.querySelector('#btn-replace-thumb');
    const removeThumbBtn = container.querySelector('#btn-remove-thumb');
    const submitThumbBtn = container.querySelector('#btn-submit-thumb');

    if (attachThumbBtn && thumbInput) {
      attachThumbBtn.addEventListener('click', () => thumbInput.click());
    }
    if (replaceThumbBtn && thumbInput) {
      replaceThumbBtn.addEventListener('click', () => thumbInput.click());
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
        const file = localFiles['thumbnail'] || { name: currentVideo?.thumbnail?.name || 'thumb.png' };
        const hadPrevious = Boolean(currentVideo?.thumbnail);

        submitThumbBtn.disabled = true;
        submitThumbBtn.textContent = 'Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'thumbnail',
          file: file
        });

        submitThumbBtn.disabled = false;
        submitThumbBtn.textContent = 'Submit';

        if (res.success) {
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
        const textVal = container.querySelector('#input-meta-info').value;
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
        submitMetaBtn.textContent = 'Submit';

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
        const scriptVal = container.querySelector('#input-script-text').value;
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
        submitScriptBtn.textContent = 'Submit';

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
    const replaceVoBtn = container.querySelector('#btn-replace-vo');
    const removeVoBtn = container.querySelector('#btn-remove-vo');
    const submitVoBtn = container.querySelector('#btn-submit-vo');

    if (uploadVoBtn && voInput) {
      uploadVoBtn.addEventListener('click', () => voInput.click());
    }
    if (replaceVoBtn && voInput) {
      replaceVoBtn.addEventListener('click', () => voInput.click());
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
        const file = localFiles['voiceover'] || { name: currentVideo?.voiceover?.name || 'vo.mp3' };
        const hadPrevious = Boolean(currentVideo?.voiceover);

        submitVoBtn.disabled = true;
        submitVoBtn.textContent = 'Submitting...';

        const res = await store.submitContent({
          channelId: selectedChannelId,
          videoNumber: selectedVideoNum,
          task: 'voiceover',
          file: file
        });

        submitVoBtn.disabled = false;
        submitVoBtn.textContent = 'Submit';

        if (res.success) {
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
        const file = localFiles[role] || { name: currentVideo?.customFields?.[role]?.name || `${role}.dat` };
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
