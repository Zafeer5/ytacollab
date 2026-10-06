import { store, getChannelMemberDisplayName, getChannelInitials } from '../../lib/store.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderAdminChannelsView(container, navigate) {
  let editingChannelId = null;
  let feedbackMessage = '';

  function render() {
    const state = store.getState();
    const channels = state.channels || [];

    const channelListHtml = channels
      .map((chan) => {
        const isEditing = editingChannelId === chan.id;
        const memberDisplayName = getChannelMemberDisplayName(chan, channels);

        if (isEditing) {
          return `
            <div style="padding: 16px; border: 1px solid var(--accent); border-radius: var(--radius); background: rgba(255, 122, 0, 0.04); margin-bottom: 12px;">
              <div style="font-size: 12px; font-weight: 600; color: var(--accent); margin-bottom: 8px;">Editing Channel: ${escapeHtml(chan.name)}</div>
              
              <div class="form-group" style="margin-bottom: 10px;">
                <label for="edit-channel-input-${chan.id}" style="font-size: 11px; font-weight: 600;">Channel Name</label>
                <input type="text" id="edit-channel-input-${chan.id}" value="${escapeHtml(chan.name)}" style="width: 100%;" required />
              </div>

              <div class="form-group" style="margin-bottom: 12px;">
                <label for="edit-channel-desc-${chan.id}" style="font-size: 11px; font-weight: 600;">Channel Description &amp; Guidelines (Visible to Team Members via popup)</label>
                <textarea id="edit-channel-desc-${chan.id}" rows="4" style="width: 100%; min-height: 80px;" placeholder="Explain what this channel is about (topics, style, guidelines, target audience)...">${escapeHtml(chan.description || '')}</textarea>
              </div>

              <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary btn-sm cancel-edit-channel-btn">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm save-edit-channel-btn" data-id="${chan.id}">Save Changes</button>
              </div>
            </div>
          `;
        }

        return `
          <div style="padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); margin-bottom: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 700; font-size: 15px; color: var(--text-primary);">${escapeHtml(chan.name)}</span>
                <span class="sidebar-tag" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border-color: #818cf8; font-weight: 600; font-size: 11px;" title="This is what team members see on their profile">
                  Team Member: ${escapeHtml(memberDisplayName)}
                </span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn btn-secondary btn-sm edit-channel-btn" data-id="${chan.id}">Edit Details</button>
                <button type="button" class="btn btn-danger btn-sm delete-channel-btn" data-id="${chan.id}">Delete</button>
              </div>
            </div>

            <!-- About / Description Snippet -->
            <div style="margin-top: 10px;">
              <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">About / Instructions for Team Members:</span>
              ${
                chan.description
                  ? `<div style="font-size: 12px; color: var(--text-secondary); background: rgba(255, 255, 255, 0.02); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border); white-space: pre-wrap; line-height: 1.5;">${escapeHtml(chan.description)}</div>`
                  : `<div style="font-size: 11px; color: var(--text-muted); font-style: italic; padding: 4px 0;">No description added yet. Click "Edit Details" to add what this channel is about.</div>`
              }
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 14px;">${feedbackMessage}</div>` : ''}

        <div class="card" style="margin-bottom: 24px;">
          <h2>Add New Channel</h2>
          <p class="helper-text" style="margin-bottom: 14px;">
            Create a YouTube channel. Team members will only see its initials and number (e.g. <strong>English Meridian</strong> appears as <strong>Channel 1 - EM</strong>) and can click a link to read the channel details.
          </p>

          <form id="add-channel-form">
            <div class="form-group" style="margin-bottom: 12px;">
              <label for="new-channel-name" style="font-size: 12px; font-weight: 600;">Channel Name (Full name for Admin)</label>
              <input type="text" id="new-channel-name" placeholder="e.g. English Meridian" required style="width: 100%;" />
            </div>

            <div class="form-group" style="margin-bottom: 14px;">
              <label for="new-channel-description" style="font-size: 12px; font-weight: 600;">About this Channel (Guidelines &amp; instructions for team members)</label>
              <textarea id="new-channel-description" rows="3" placeholder="Explain what this channel is about (niche, pacing, audience, guidelines). Team members will read this in a popup modal." style="width: 100%; min-height: 70px;"></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" class="btn btn-primary" id="btn-add-channel-submit">Add Channel</button>
            </div>
          </form>
        </div>

        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <h2>Existing Channels (${channels.length})</h2>
          </div>

          <div>
            ${channelListHtml || '<div style="padding: 24px; text-align: center;" class="helper-text">No channels added yet. Fill out the form above to add your first channel.</div>'}
          </div>
        </div>
      </div>
    `;

    // Handlers
    const addChanForm = container.querySelector('#add-channel-form');
    if (addChanForm) {
      addChanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = container.querySelector('#new-channel-name');
        const descInput = container.querySelector('#new-channel-description');
        const submitBtn = container.querySelector('#btn-add-channel-submit');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        const created = await store.addChannel(nameInput.value, descInput ? descInput.value : '');
        if (created) {
          feedbackMessage = `✓ Channel "${created.name}" created successfully.`;
          nameInput.value = '';
          if (descInput) descInput.value = '';
        } else {
          feedbackMessage = 'Failed to create channel. Please try again.';
        }
        submitBtn.disabled = false;
        render();
      });
    }

    container.querySelectorAll('.edit-channel-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        editingChannelId = e.currentTarget.dataset.id;
        render();
      });
    });

    container.querySelectorAll('.cancel-edit-channel-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingChannelId = null;
        render();
      });
    });

    container.querySelectorAll('.save-edit-channel-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const nameInput = container.querySelector(`#edit-channel-input-${id}`);
        const descInput = container.querySelector(`#edit-channel-desc-${id}`);

        if (nameInput) {
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'Saving...';
          await store.editChannel(id, nameInput.value, descInput ? descInput.value : '');
          editingChannelId = null;
          feedbackMessage = '✓ Channel details updated successfully.';
          render();
        }
      });
    });

    container.querySelectorAll('.delete-channel-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const chan = channels.find((c) => c.id === id);
        if (confirm(`Are you sure you want to delete "${chan?.name || 'this channel'}"? All videos and submissions will be deleted.`)) {
          e.currentTarget.disabled = true;
          await store.deleteChannel(id);
          feedbackMessage = 'Channel deleted.';
          render();
        }
      });
    });
  }

  render();
}
