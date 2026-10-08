import {
  store,
  getChannelMemberDisplayName,
  getVideoDataSummary,
  downloadVideosDataBackup
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
 * Renders the Delete Confirmation & Data Warning Modal
 */
function openDeleteTitlesModal({
  channelName,
  targetVideos,
  allSubmissions,
  onDownloadAndDelete,
  onDeleteNoDownload,
  onCancel
}) {
  const prev = document.getElementById('yta-delete-titles-modal');
  if (prev) prev.remove();

  const analyzedVideos = targetVideos.map((v) => ({
    ...v,
    summary: getVideoDataSummary(v, allSubmissions)
  }));
  const videosWithData = analyzedVideos.filter((v) => v.summary.hasData);
  const hasAnyData = videosWithData.length > 0;

  const backdrop = document.createElement('div');
  backdrop.id = 'yta-delete-titles-modal';
  backdrop.className = 'delete-confirm-modal-backdrop';

  const closeModal = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKeyDown);
    if (onCancel) onCancel();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', onKeyDown);

  let bodyContent = '';
  let footerButtons = '';

  if (hasAnyData) {
    bodyContent = `
      <div class="delete-warning-banner">
        <div class="delete-warning-icon">⚠️</div>
        <div>
          <div class="delete-warning-title">
            Warning: Video contains data in database
          </div>
          <div class="delete-warning-desc">
            ${
              targetVideos.length === 1
                ? `The video <strong>"${escapeHtml(targetVideos[0].title)}"</strong> contains production data in the database. If you delete it, all associated data (such as <strong>voiceover</strong>, <strong>thumbnail</strong>, <strong>description / script</strong>) for this video will also be permanently deleted from the database!`
                : `<strong>${videosWithData.length}</strong> of the <strong>${targetVideos.length}</strong> selected video(s) contain production data in the database. If you delete them, all associated data (such as <strong>voiceover</strong>, <strong>thumbnail</strong>, <strong>description / script</strong>) will also be permanently deleted from the database!`
            }
          </div>
        </div>
      </div>

      <div class="delete-affected-box">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
          Associated Data Stored in Database (${videosWithData.length} video${videosWithData.length > 1 ? 's' : ''}):
        </div>
        <div class="delete-affected-list">
          ${videosWithData
            .map(
              (v) => `
            <div class="delete-affected-item">
              <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px;">
                <span class="title-number-badge" style="font-size: 11px; padding: 2px 6px;">Video ${v.videoNumber}</span>
                <span style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${escapeHtml(v.title)}</span>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                ${v.summary.items
                  .map(
                    (item) => `
                  <span class="title-data-badge ${
                    item.type === 'voiceover'
                      ? 'badge-voiceover'
                      : item.type === 'thumbnail'
                      ? 'badge-thumbnail'
                      : item.type === 'script'
                      ? 'badge-script'
                      : item.type === 'metaInfo'
                      ? 'badge-desc'
                      : 'badge-custom'
                  }">
                    ${
                      item.type === 'voiceover'
                        ? '🎙️'
                        : item.type === 'thumbnail'
                        ? '🖼️'
                        : item.type === 'script'
                        ? '📝'
                        : '📋'
                    } ${escapeHtml(item.label)}${item.filename ? `: ${escapeHtml(item.filename)}` : ''}
                  </span>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <p class="helper-text" style="font-size: 12.5px; margin-bottom: 0;">
        You can choose to download all existing data (voiceovers, thumbnails, scripts, metadata) before deleting from the database, or delete immediately without downloading.
      </p>
    `;

    footerButtons = `
      <div class="delete-actions-row">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-cancel">
          Cancel
        </button>
        <button type="button" class="btn btn-danger btn-sm" id="btn-modal-delete-no-dl" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4);">
          Don't download data and delete from the database
        </button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-modal-download-delete" style="background: var(--cta-orange); color: #000; font-weight: 700;">
          📥 Download data and delete from the database
        </button>
      </div>
    `;
  } else {
    bodyContent = `
      <div style="padding: 12px 0;">
        <p style="font-size: 14px; color: var(--text-primary); margin-bottom: 12px; line-height: 1.5;">
          ${
            targetVideos.length === 1
              ? `Are you sure you want to delete <strong>Video ${targetVideos[0].videoNumber}: "${escapeHtml(targetVideos[0].title)}"</strong> from <strong>${escapeHtml(channelName)}</strong>?`
              : `Are you sure you want to delete <strong>${targetVideos.length} video title(s)</strong> from <strong>${escapeHtml(channelName)}</strong>?`
          }
        </p>
        <p class="helper-text" style="font-size: 12px; margin-bottom: 0;">
          No submitted files (voiceover, thumbnail, script, or description) were found for ${targetVideos.length === 1 ? 'this video' : 'these videos'}. This deletion cannot be undone.
        </p>
      </div>
    `;

    footerButtons = `
      <div class="delete-actions-row">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-cancel">
          Cancel
        </button>
        <button type="button" class="btn btn-danger btn-sm" id="btn-modal-delete-no-dl">
          Delete from the database
        </button>
      </div>
    `;
  }

  backdrop.innerHTML = `
    <div class="delete-confirm-modal-dialog" role="dialog" aria-modal="true" aria-label="Confirm Title Deletion">
      <div class="delete-confirm-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">${hasAnyData ? '⚠️' : '🗑️'}</span>
          <span style="font-size: 14px; font-weight: 700; color: var(--text-primary);">
            ${hasAnyData ? 'Warning: Database Data Detected' : 'Confirm Title Deletion'}
          </span>
        </div>
        <button type="button" class="thumbnail-modal-close" id="btn-modal-close-x" title="Close (Esc)" style="width: 28px; height: 28px; font-size: 14px;">✕</button>
      </div>
      <div class="delete-confirm-modal-body">
        ${bodyContent}
      </div>
      <div class="delete-confirm-modal-footer">
        ${footerButtons}
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector('#btn-modal-close-x')?.addEventListener('click', closeModal);
  backdrop.querySelector('#btn-modal-cancel')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  const disableAllBtns = () => {
    backdrop.querySelectorAll('button').forEach((b) => (b.disabled = true));
  };

  const dlAndDelBtn = backdrop.querySelector('#btn-modal-download-delete');
  if (dlAndDelBtn) {
    dlAndDelBtn.addEventListener('click', async () => {
      disableAllBtns();
      dlAndDelBtn.textContent = '📥 Downloading & Deleting...';
      try {
        await onDownloadAndDelete(targetVideos);
      } finally {
        backdrop.remove();
        document.removeEventListener('keydown', onKeyDown);
      }
    });
  }

  const delNoDlBtn = backdrop.querySelector('#btn-modal-delete-no-dl');
  if (delNoDlBtn) {
    delNoDlBtn.addEventListener('click', async () => {
      disableAllBtns();
      delNoDlBtn.textContent = 'Deleting from database...';
      try {
        await onDeleteNoDownload(targetVideos);
      } finally {
        backdrop.remove();
        document.removeEventListener('keydown', onKeyDown);
      }
    });
  }
}

export function renderAdminTitlesView(container, navigate) {
  let selectedChanId = localStorage.getItem('yta_selected_titles_channel') || '';
  let draftTitlesText = sessionStorage.getItem('yta_titles_draft_text') || '';
  let feedbackMessage = '';
  let feedbackType = 'info'; // 'success' | 'error' | 'info'
  let selectedVideoIds = new Set();
  let editingVideoId = null;
  let editingTitleValue = '';
  let searchQuery = '';

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
      ? state.videos
          .filter((v) => v.channelId === selectedChanId)
          .sort((a, b) => a.videoNumber - b.videoNumber)
      : [];

    // Filter videos by search query if any
    const filteredVideos = existingVideos.filter((v) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (v.title || '').toLowerCase().includes(q) ||
        String(v.videoNumber).includes(q)
      );
    });

    const channelOptions = channels
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === selectedChanId ? 'selected' : ''}>${escapeHtml(
            c.name
          )} (${getChannelMemberDisplayName(c, channels)})</option>`
      )
      .join('');

    const allFilteredSelected =
      filteredVideos.length > 0 &&
      filteredVideos.every((v) => selectedVideoIds.has(v.id));

    // Render Titles List
    const titlesListHtml = filteredVideos
      .map((v) => {
        const isEditing = editingVideoId === v.id;
        const isChecked = selectedVideoIds.has(v.id);
        const dataSummary = getVideoDataSummary(v, state.submissions);

        if (isEditing) {
          return `
            <div class="title-row-item" style="background: rgba(255, 122, 0, 0.05); border-color: var(--accent);">
              <div class="title-inline-edit" style="width: 100%;">
                <span class="title-number-badge">#${v.videoNumber}</span>
                <input type="text" id="input-edit-title-${v.id}" value="${escapeHtml(
            editingTitleValue
          )}" placeholder="Enter video title..." autofocus style="flex: 1;" />
                <button type="button" class="btn btn-primary btn-sm btn-save-title-edit" data-id="${
                  v.id
                }">Save</button>
                <button type="button" class="btn btn-secondary btn-sm btn-cancel-title-edit" data-id="${
                  v.id
                }">Cancel</button>
              </div>
            </div>
          `;
        }

        // Data Badges
        const badgesHtml = dataSummary.hasData
          ? dataSummary.items
              .map((item) => {
                const cls =
                  item.type === 'voiceover'
                    ? 'badge-voiceover'
                    : item.type === 'thumbnail'
                    ? 'badge-thumbnail'
                    : item.type === 'script'
                    ? 'badge-script'
                    : item.type === 'metaInfo'
                    ? 'badge-desc'
                    : 'badge-custom';
                const icon =
                  item.type === 'voiceover'
                    ? '🎙️'
                    : item.type === 'thumbnail'
                    ? '🖼️'
                    : item.type === 'script'
                    ? '📝'
                    : '📋';
                const tip = item.filename
                  ? `File: ${escapeHtml(item.filename)}`
                  : item.content
                  ? 'Text content submitted'
                  : item.label;
                return `<span class="title-data-badge ${cls}" title="${tip}">${icon} ${escapeHtml(
                  item.label
                )}</span>`;
              })
              .join('')
          : '<span style="font-size: 11px; color: var(--text-muted); opacity: 0.7;">No data</span>';

        return `
          <div class="title-row-item ${isChecked ? 'title-row-selected' : ''}" data-video-id="${v.id}">
            <div class="title-row-left">
              <input type="checkbox" class="title-checkbox title-item-cb" data-id="${v.id}" ${
          isChecked ? 'checked' : ''
        } title="Select this title" />
              <span class="title-number-badge">#${v.videoNumber}</span>
              <div class="title-content-wrap">
                <span class="title-text-main" title="${escapeHtml(v.title)}">${escapeHtml(
          v.title
        )}</span>
                <div class="title-badges-wrap">
                  ${badgesHtml}
                </div>
              </div>
            </div>

            <div class="title-actions-wrap">
              <button type="button" class="btn btn-secondary btn-sm btn-edit-title" data-id="${
                v.id
              }" title="Edit title">
                ✏️ Edit
              </button>
              <button type="button" class="btn btn-danger btn-sm btn-delete-single-title" data-id="${
                v.id
              }" title="Delete title from database">
                🗑️ Delete
              </button>
            </div>
          </div>
        `;
      })
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
        <div class="card" style="margin-bottom: 24px;">
          <h2>Add Titles to Channel</h2>
          <form id="add-titles-form" style="margin-bottom: 12px;">
            <div class="form-group" style="margin-bottom: 14px;">
              <label for="titles-channel-select" style="font-size: 12px; font-weight: 600;">Select Channel</label>
              <select id="titles-channel-select" style="width: 100%;">
                ${channelOptions}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 14px;">
              <label for="titles-textarea" style="font-size: 12px; font-weight: 600;">Paste titles line-by-line</label>
              <textarea id="titles-textarea" rows="5" placeholder="Paste titles line-by-line here...&#10;First Video Title&#10;Second Video Title&#10;Third Video Title" required style="width: 100%; font-family: monospace; font-size: 13px;">${escapeHtml(
        draftTitlesText
      )}</textarea>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" class="btn btn-primary" id="btn-submit-titles">Save and Submit</button>
            </div>
          </form>
        </div>

        <div class="card">
          <!-- Section Header & Toolbar -->
          <div class="titles-control-bar">
            <div>
              <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 2px;">Existing Video Titles</h3>
              <span class="helper-text" style="font-size: 12px;">
                Channel: <strong>${escapeHtml(currentChannel?.name || 'Selected Channel')}</strong> • Total: <strong>${
        existingVideos.length
      }</strong> videos
              </span>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <!-- Search Filter -->
              <div class="titles-search-box">
                <span style="font-size: 13px; opacity: 0.6;">🔍</span>
                <input type="text" id="input-titles-search" class="titles-search-input" placeholder="Search titles..." value="${escapeHtml(
                  searchQuery
                )}" />
                ${
                  searchQuery
                    ? `<button type="button" id="btn-clear-search" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 12px;">✕</button>`
                    : ''
                }
              </div>

              <!-- Delete All Button -->
              <button type="button" class="btn btn-danger btn-sm" id="btn-delete-all-titles" ${
                existingVideos.length === 0 ? 'disabled' : ''
              } title="Delete all titles of this channel from database">
                🗑️ Delete All Titles (${existingVideos.length})
              </button>
            </div>
          </div>

          <!-- Bulk Selection Action Bar (appears when 1 or more are selected) -->
          ${
            selectedVideoIds.size > 0
              ? `
            <div class="titles-bulk-bar">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 13px; font-weight: 700; color: var(--accent);">
                  ✓ ${selectedVideoIds.size} title${
                  selectedVideoIds.size > 1 ? 's' : ''
                } selected
                </span>
                <span class="helper-text" style="font-size: 12px;">(out of ${
                  filteredVideos.length
                })</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <button type="button" class="btn btn-danger btn-sm" id="btn-delete-selected-titles" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4); font-weight: 600;">
                  🗑️ Delete Selected (${selectedVideoIds.size})
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-deselect-all-titles">
                  Deselect All
                </button>
              </div>
            </div>
          `
              : ''
          }

          <!-- Select All Header Row (when titles exist) -->
          ${
            filteredVideos.length > 0
              ? `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid var(--border); font-size: 11.5px; color: var(--text-muted); font-weight: 600;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="title-checkbox" id="cb-select-all-filtered" ${
                  allFilteredSelected ? 'checked' : ''
                } />
                <span>Select All (${filteredVideos.length})</span>
              </label>
              <span>Actions</span>
            </div>
          `
              : ''
          }

          <!-- Scrollable Titles Container -->
          <div class="scrollable-container" style="max-height: 500px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); overflow-y: auto;">
            ${
              titlesListHtml ||
              (existingVideos.length === 0
                ? `<div style="padding: 32px 20px; text-align: center;" class="helper-text">No titles added for this channel yet. Paste titles above to get started.</div>`
                : `<div style="padding: 24px 20px; text-align: center;" class="helper-text">No titles match "${escapeHtml(
                    searchQuery
                  )}".</div>`)
            }
          </div>
        </div>
      `;
    }

    // Feedback banner color styling
    let bannerStyle = 'background-color: var(--surface); border-color: var(--border); color: var(--text-primary);';
    if (feedbackType === 'success') {
      bannerStyle = 'background-color: var(--success-bg); border-color: var(--success-border); color: var(--success-text);';
    } else if (feedbackType === 'error') {
      bannerStyle = 'background-color: var(--pending-bg); border-color: var(--pending-border); color: var(--pending-text);';
    }

    container.innerHTML = `
      <div class="main-content">
        ${
          feedbackMessage
            ? `<div class="notification-banner" style="${bannerStyle} margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <span>${feedbackMessage}</span>
                <button type="button" id="btn-dismiss-feedback" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 14px; padding: 2px 6px;">✕</button>
               </div>`
            : ''
        }
        ${bodyHtml}
      </div>
    `;

    // ------------------------------------------------------------------------
    // Event Handlers
    // ------------------------------------------------------------------------

    // Dismiss feedback banner
    container.querySelector('#btn-dismiss-feedback')?.addEventListener('click', () => {
      feedbackMessage = '';
      render();
    });

    // Go to Channels button (Empty state)
    container.querySelector('#btn-goto-create-channel')?.addEventListener('click', () => {
      navigate('#/admin/channels');
    });

    // Channel selection change
    const chanSelect = container.querySelector('#titles-channel-select');
    if (chanSelect) {
      chanSelect.addEventListener('change', (e) => {
        selectedChanId = e.target.value;
        localStorage.setItem('yta_selected_titles_channel', selectedChanId);
        selectedVideoIds.clear();
        editingVideoId = null;
        feedbackMessage = '';
        render();
      });
    }

    // Draft textarea input
    const textarea = container.querySelector('#titles-textarea');
    if (textarea) {
      textarea.addEventListener('input', (e) => {
        draftTitlesText = e.target.value;
        sessionStorage.setItem('yta_titles_draft_text', draftTitlesText);
      });
    }

    // Add titles form submission
    const titlesForm = container.querySelector('#add-titles-form');
    if (titlesForm) {
      titlesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = titlesForm.querySelector('#btn-submit-titles');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }
        const rawText = textarea ? textarea.value : '';
        const res = await store.addTitlesToChannel(selectedChanId, rawText);
        if (res.success) {
          feedbackMessage = `✓ Successfully added ${res.videos.length} video title(s) to "${currentChannel?.name}".`;
          feedbackType = 'success';
          draftTitlesText = '';
          sessionStorage.removeItem('yta_titles_draft_text');
          if (textarea) textarea.value = '';
        } else {
          feedbackMessage = `✕ ${res.error || 'Failed to save titles.'}`;
          feedbackType = 'error';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save and Submit';
        }
        render();
      });
    }

    // Search filter input
    const searchInput = container.querySelector('#input-titles-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
        // Restore focus to search input after render
        const newSearchInput = container.querySelector('#input-titles-search');
        if (newSearchInput) {
          newSearchInput.focus();
          newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
        }
      });
    }

    const clearSearchBtn = container.querySelector('#btn-clear-search');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchQuery = '';
        render();
      });
    }

    // Select All filtered titles checkbox
    const selectAllCb = container.querySelector('#cb-select-all-filtered');
    if (selectAllCb) {
      selectAllCb.addEventListener('change', (e) => {
        if (e.target.checked) {
          filteredVideos.forEach((v) => selectedVideoIds.add(v.id));
        } else {
          filteredVideos.forEach((v) => selectedVideoIds.delete(v.id));
        }
        render();
      });
    }

    // Individual item checkbox
    container.querySelectorAll('.title-item-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const vidId = e.target.dataset.id;
        if (e.target.checked) {
          selectedVideoIds.add(vidId);
        } else {
          selectedVideoIds.delete(vidId);
        }
        render();
      });
    });

    // Deselect All bulk button
    container.querySelector('#btn-deselect-all-titles')?.addEventListener('click', () => {
      selectedVideoIds.clear();
      render();
    });

    // --- Inline Title Editing Handlers ---
    container.querySelectorAll('.btn-edit-title').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vidId = btn.dataset.id;
        const targetVid = existingVideos.find((v) => v.id === vidId);
        if (targetVid) {
          editingVideoId = vidId;
          editingTitleValue = targetVid.title || '';
          render();
          const inp = container.querySelector(`#input-edit-title-${vidId}`);
          if (inp) {
            inp.focus();
            inp.select();
          }
        }
      });
    });

    container.querySelectorAll('.btn-cancel-title-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingVideoId = null;
        editingTitleValue = '';
        render();
      });
    });

    // Keydown handlers on inline edit input (Enter to save, Esc to cancel)
    if (editingVideoId) {
      const editInput = container.querySelector(`#input-edit-title-${editingVideoId}`);
      if (editInput) {
        editInput.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            await saveInlineTitleEdit(editingVideoId, editInput.value);
          } else if (e.key === 'Escape') {
            editingVideoId = null;
            editingTitleValue = '';
            render();
          }
        });
      }
    }

    container.querySelectorAll('.btn-save-title-edit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const vidId = btn.dataset.id;
        const input = container.querySelector(`#input-edit-title-${vidId}`);
        const newTitle = input ? input.value : '';
        await saveInlineTitleEdit(vidId, newTitle);
      });
    });

    async function saveInlineTitleEdit(vidId, newTitle) {
      if (!newTitle.trim()) {
        alert('Title cannot be empty.');
        return;
      }
      const vid = existingVideos.find((v) => v.id === vidId);
      const res = await store.updateVideoTitle(vidId, newTitle.trim());
      if (res.success) {
        feedbackMessage = `✓ Successfully updated title for Video ${vid?.videoNumber || ''}.`;
        feedbackType = 'success';
        editingVideoId = null;
        editingTitleValue = '';
      } else {
        feedbackMessage = `✕ ${res.error || 'Failed to update title.'}`;
        feedbackType = 'error';
      }
      render();
    }

    // --- Deletion Handlers ---

    // 1. Delete single title
    container.querySelectorAll('.btn-delete-single-title').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vidId = btn.dataset.id;
        const targetVid = existingVideos.find((v) => v.id === vidId);
        if (targetVid) {
          triggerDeletion([targetVid]);
        }
      });
    });

    // 2. Delete selected titles (Bulk)
    container.querySelector('#btn-delete-selected-titles')?.addEventListener('click', () => {
      const targetVideos = existingVideos.filter((v) => selectedVideoIds.has(v.id));
      if (targetVideos.length === 0) return;
      triggerDeletion(targetVideos);
    });

    // 3. Delete all titles of channel
    container.querySelector('#btn-delete-all-titles')?.addEventListener('click', () => {
      if (existingVideos.length === 0) return;
      triggerDeletion(existingVideos);
    });

    // Central deletion launcher with warning and download options
    function triggerDeletion(videosToDelete) {
      if (!videosToDelete || videosToDelete.length === 0) return;

      const channelName = currentChannel?.name || 'Selected Channel';
      const videoIds = videosToDelete.map((v) => v.id);

      openDeleteTitlesModal({
        channelName,
        targetVideos: videosToDelete,
        allSubmissions: state.submissions,
        // Option 1: Download data and delete from database
        onDownloadAndDelete: async (vids) => {
          try {
            await downloadVideosDataBackup(channelName, vids, state.submissions);
            const delRes = await store.deleteVideos(videoIds, selectedChanId);
            if (delRes.success) {
              feedbackMessage = `✓ Successfully downloaded data backup and deleted ${videoIds.length} title(s) from "${channelName}".`;
              feedbackType = 'success';
              selectedVideoIds.clear();
            } else {
              feedbackMessage = `✕ ${delRes.error || 'Failed to delete titles.'}`;
              feedbackType = 'error';
            }
          } catch (err) {
            console.error('Download and delete error:', err);
            feedbackMessage = `✕ Error during download/delete: ${err.message}`;
            feedbackType = 'error';
          }
          render();
        },
        // Option 2: Don't download data and delete from database
        onDeleteNoDownload: async () => {
          try {
            const delRes = await store.deleteVideos(videoIds, selectedChanId);
            if (delRes.success) {
              feedbackMessage = `✓ Successfully deleted ${videoIds.length} title(s) from "${channelName}".`;
              feedbackType = 'success';
              selectedVideoIds.clear();
            } else {
              feedbackMessage = `✕ ${delRes.error || 'Failed to delete titles.'}`;
              feedbackType = 'error';
            }
          } catch (err) {
            console.error('Delete error:', err);
            feedbackMessage = `✕ Error deleting titles: ${err.message}`;
            feedbackType = 'error';
          }
          render();
        },
        // Option 3: Cancel
        onCancel: () => {
          // Do nothing, modal closed
        }
      });
    }
  }

  // Subscribe to store updates while this view is active
  const unsubscribe = store.subscribe(() => {
    if (container.isConnected) {
      render();
    }
  });

  render();
}
