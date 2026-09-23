import { store } from '../../lib/store.js';

export function renderAdminChannelsView(container, navigate) {
  let editingChannelId = null;
  let feedbackMessage = '';

  function render() {
    const state = store.getState();
    const channels = state.channels || [];

    const channelListHtml = channels
      .map((chan) => {
        const isEditing = editingChannelId === chan.id;
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; border-bottom: 1px solid var(--border);">
            ${
              isEditing
                ? `
                  <input type="text" id="edit-channel-input-${chan.id}" value="${chan.name}" style="flex: 1; padding: 6px 10px;" />
                  <button class="btn btn-primary btn-sm save-edit-channel-btn" data-id="${chan.id}">Save</button>
                  <button class="btn btn-secondary btn-sm cancel-edit-channel-btn">Cancel</button>
                `
                : `
                  <span style="font-weight: 600; font-size: 14px;">${chan.name}</span>
                  <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-sm edit-channel-btn" data-id="${chan.id}">Edit Name</button>
                    <button class="btn btn-danger btn-sm delete-channel-btn" data-id="${chan.id}">Delete</button>
                  </div>
                `
            }
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary);">${feedbackMessage}</div>` : ''}

        <div class="card">
          <h2>Add New Channel</h2>
          <form id="add-channel-form" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
            <input type="text" id="new-channel-name" placeholder="Type new channel name" required style="flex: 1; min-width: 220px;" />
            <button type="submit" class="btn btn-primary" id="btn-add-channel-submit">Add Channel</button>
          </form>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <h3>Existing Channels (${channels.length})</h3>
          </div>

          <div class="scrollable-container" style="max-height: 480px;">
            ${channelListHtml || '<div style="padding: 24px; text-align: center;" class="helper-text">No channels added yet. Type a channel name above to add your first channel.</div>'}
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
        const submitBtn = container.querySelector('#btn-add-channel-submit');
        submitBtn.disabled = true;
        const created = await store.addChannel(nameInput.value);
        if (created) {
          feedbackMessage = `Channel "${created.name}" created successfully.`;
          nameInput.value = '';
        } else {
          feedbackMessage = 'Channel already exists or could not be created.';
        }
        submitBtn.disabled = false;
        render();
      });
    }

    container.querySelectorAll('.edit-channel-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        editingChannelId = e.target.dataset.id;
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
        const id = e.target.dataset.id;
        const input = container.querySelector(`#edit-channel-input-${id}`);
        if (input) {
          btn.disabled = true;
          await store.editChannel(id, input.value);
          editingChannelId = null;
          feedbackMessage = 'Channel renamed successfully.';
          render();
        }
      });
    });

    container.querySelectorAll('.delete-channel-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        btn.disabled = true;
        await store.deleteChannel(id);
        feedbackMessage = 'Channel deleted.';
        render();
      });
    });
  }

  render();
}
