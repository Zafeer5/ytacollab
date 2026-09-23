import { store } from '../../lib/store.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderAdminRolesView(container, navigate) {
  let editingRoleId = null;
  let feedbackMessage = '';

  // Persistent filter state across renders and tab switches
  let selectedChannelFilter = localStorage.getItem('yta_admin_prompt_filter_channel') || 'all';
  let selectedRoleFilter = localStorage.getItem('yta_admin_prompt_filter_role') || 'all';

  // Persistent prompt form selection state
  let selectedPromptChannel = localStorage.getItem('yta_admin_prompt_channel_id') || localStorage.getItem('yta_selected_channel_id') || '';
  let selectedPromptRole = localStorage.getItem('yta_admin_prompt_role_name') || '';

  // In-progress drafts saved in sessionStorage
  let draftLabel = sessionStorage.getItem('yta_admin_prompt_draft_label') || '';
  let draftText = sessionStorage.getItem('yta_admin_prompt_draft_text') || '';

  function render() {
    const state = store.getState();
    const roles = state.roles || [];
    const channels = state.channels || [];
    const prompts = state.prompts || [];

    // Ensure selected channel is valid
    if (selectedPromptChannel && selectedPromptChannel !== '__all__' && !channels.some((c) => c.id === selectedPromptChannel)) {
      selectedPromptChannel = channels.length > 0 ? channels[0].id : '';
      localStorage.setItem('yta_admin_prompt_channel_id', selectedPromptChannel);
    }

    // Ensure selected role is valid
    if (roles.length > 0 && (!selectedPromptRole || !roles.some((r) => r.name.toLowerCase() === selectedPromptRole.toLowerCase()))) {
      selectedPromptRole = roles[0].name;
      localStorage.setItem('yta_admin_prompt_role_name', selectedPromptRole);
    }

    // Roles list HTML
    const rolesListHtml = roles
      .map((role) => {
        const isEditing = editingRoleId === role.id;
        const rolePromptsCount = prompts.filter((p) => p.roleName.toLowerCase() === role.name.toLowerCase()).length;

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap;">
            ${
              isEditing
                ? `
                  <input type="text" id="edit-role-name-${role.id}" value="${escapeHtml(role.name)}" style="flex: 1; min-width: 140px; padding: 6px 10px;" />
                  <select id="edit-role-type-${role.id}" style="width: auto; padding: 6px 10px;">
                    <option value="Text" ${role.inputType === 'Text' ? 'selected' : ''}>Text</option>
                    <option value="Number" ${role.inputType === 'Number' ? 'selected' : ''}>Number</option>
                    <option value="Attach File" ${role.inputType === 'Attach File' ? 'selected' : ''}>Attach File</option>
                  </select>
                  <button class="btn btn-primary btn-sm save-edit-role-btn" data-id="${role.id}">Save</button>
                  <button class="btn btn-secondary btn-sm cancel-edit-role-btn">Cancel</button>
                `
                : `
                  <div>
                    <span style="font-weight: 600; font-size: 14px;">${escapeHtml(role.name)}</span>
                    <span class="helper-text" style="margin-left: 8px;">[Type: ${role.inputType}]</span>
                    <span class="sidebar-tag" style="margin-left: 8px;">${rolePromptsCount} prompt(s)</span>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-sm edit-role-btn" data-id="${role.id}">Edit</button>
                    <button class="btn btn-danger btn-sm delete-role-btn" data-id="${role.id}">Delete</button>
                  </div>
                `
            }
          </div>
        `;
      })
      .join('');

    // Filter prompts based on selectedChannelFilter and selectedRoleFilter
    const filteredPrompts = prompts.filter((p) => {
      if (selectedChannelFilter !== 'all') {
        if (selectedChannelFilter === '__all__') {
          if (p.channelId) return false;
        } else if (p.channelId !== selectedChannelFilter) {
          return false;
        }
      }
      if (selectedRoleFilter !== 'all') {
        if (p.roleName.toLowerCase() !== selectedRoleFilter.toLowerCase()) return false;
      }
      return true;
    });

    // Prompts list HTML
    const promptsListHtml = filteredPrompts
      .map((p) => `
        <div class="prompt-card" style="padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background-color: var(--bg); margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="sidebar-tag" style="background: rgba(99, 102, 241, 0.12); color: #818cf8; border-color: rgba(99, 102, 241, 0.3); font-weight: 500;">
                📺 ${escapeHtml(p.channelName || 'All Channels')}
              </span>
              <span class="sidebar-tag" style="color: var(--text-primary); border-color: var(--text-primary);">
                ${escapeHtml(p.roleName)}
              </span>
              <strong style="color: var(--text-primary); font-size: 13px;">${escapeHtml(p.label)}</strong>
            </div>
            <button class="btn btn-danger btn-sm delete-prompt-btn" data-id="${p.id}">Delete</button>
          </div>
          <div class="prompt-scrollable-content" style="max-height: 85px;">${escapeHtml(p.promptText)}</div>
        </div>
      `)
      .join('');

    // Channel options for prompt form
    const channelOptions = channels.length > 0
      ? [
          `<option value="" ${!selectedPromptChannel ? 'selected' : ''}>-- Select Target Channel --</option>`,
          ...channels.map((c) => `<option value="${c.id}" ${c.id === selectedPromptChannel ? 'selected' : ''}>${escapeHtml(c.name)}</option>`),
          `<option value="__all__" ${selectedPromptChannel === '__all__' ? 'selected' : ''}>🌐 All Channels (Global Prompt)</option>`
        ].join('')
      : `<option value="__all__">🌐 All Channels (No specific channels created yet)</option>`;

    // Role options for prompt form
    const roleOptions = roles
      .map((r) => `<option value="${r.name}" ${r.name.toLowerCase() === (selectedPromptRole || '').toLowerCase() ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
      .join('');

    // Filter dropdown options
    const channelFilterOptions = [
      `<option value="all" ${selectedChannelFilter === 'all' ? 'selected' : ''}>All Channels (${prompts.length})</option>`,
      ...channels.map((c) => {
        const count = prompts.filter((p) => p.channelId === c.id).length;
        return `<option value="${c.id}" ${selectedChannelFilter === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${count})</option>`;
      }),
      `<option value="__all__" ${selectedChannelFilter === '__all__' ? 'selected' : ''}>Global / Unassigned (${prompts.filter((p) => !p.channelId).length})</option>`
    ].join('');

    const roleFilterOptions = [
      `<option value="all" ${selectedRoleFilter === 'all' ? 'selected' : ''}>All Roles</option>`,
      ...roles.map((r) => `<option value="${r.name}" ${selectedRoleFilter.toLowerCase() === r.name.toLowerCase() ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
    ].join('');

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 16px;">${feedbackMessage}</div>` : ''}

        <!-- Section 1: Define Roles & Tasks -->
        <div class="card">
          <h2>Add New Roles / Pre Added Roles &amp; Tasks</h2>
          <form id="add-role-form" style="margin-bottom: 20px;">
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
              <div class="form-group" style="flex: 2; min-width: 180px; margin-bottom: 0;">
                <label for="new-role-name">Role / Task Name</label>
                <input type="text" id="new-role-name" placeholder="e.g. Subtitles, Audio Engineer" required />
              </div>

              <div class="form-group" style="flex: 1; min-width: 180px; margin-bottom: 0;">
                <label for="new-role-type">What file type required?</label>
                <select id="new-role-type">
                  <option value="Text">Text</option>
                  <option value="Number">Number</option>
                  <option value="Attach File">Attach File</option>
                </select>
              </div>

              <button type="submit" class="btn btn-primary" style="height: 38px;">Add Role</button>
            </div>
          </form>

          <h3>Roles &amp; Tasks List (${roles.length})</h3>
          <div class="scrollable-container" style="max-height: 300px;">
            ${rolesListHtml || '<div style="padding: 16px; text-align: center;" class="helper-text">No roles defined yet.</div>'}
          </div>
        </div>

        <!-- Section 2: Role Prompts Management -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <h2>Channel-Specific Prompts (Visible to Team Members)</h2>
            <span class="helper-text">Each channel has its own prompt set, displayed when that channel is selected</span>
          </div>

          <form id="add-prompt-form" style="margin-bottom: 20px; background-color: var(--bg); padding: 14px; border-radius: var(--radius); border: 1px solid var(--border);">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 10px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="prompt-channel-select">Target YouTube Channel</label>
                <select id="prompt-channel-select" required>
                  ${channelOptions}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="prompt-role-select">Target Role / Task</label>
                <select id="prompt-role-select" required>
                  ${roleOptions || '<option value="">No roles defined</option>'}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="prompt-label-input">Prompt Title / Label</label>
                <input type="text" id="prompt-label-input" value="${escapeHtml(draftLabel)}" placeholder="e.g. Channel Style Hook, Midjourney Style" required />
              </div>
            </div>

            <div class="form-group">
              <label for="prompt-text-input">Prompt Content</label>
              <textarea id="prompt-text-input" rows="3" placeholder="Enter prompt guidelines or AI prompt template for this channel..." required>${escapeHtml(draftText)}</textarea>
            </div>

            <div style="display: flex; justify-content: flex-start; align-items: center; gap: 12px; flex-wrap: wrap;">
              <button type="submit" class="btn btn-primary" id="btn-add-prompt-submit">Add Role Prompt</button>
            </div>
          </form>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
            <h3 style="margin-bottom: 0;">Active Prompts (${filteredPrompts.length})</h3>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="helper-text" style="font-size: 11px;">Filter:</span>
              <select id="filter-prompt-channel" style="padding: 4px 8px; font-size: 12px; width: auto;">
                ${channelFilterOptions}
              </select>
              <select id="filter-prompt-role" style="padding: 4px 8px; font-size: 12px; width: auto;">
                ${roleFilterOptions}
              </select>
            </div>
          </div>

          <div class="scrollable-container" style="max-height: 280px; padding: 4px;">
            ${promptsListHtml || '<div style="padding: 20px; text-align: center;" class="helper-text">No prompts found matching your filter. Add prompts above for team members to copy during content production.</div>'}
          </div>
        </div>
      </div>
    `;

    // Role Form Submit
    const addRoleForm = container.querySelector('#add-role-form');
    if (addRoleForm) {
      addRoleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = container.querySelector('#new-role-name');
        const typeSelect = container.querySelector('#new-role-type');
        const submitBtn = addRoleForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        const role = await store.addRole(nameInput.value, typeSelect.value);
        if (role) {
          feedbackMessage = `Role "${role.name}" [${role.inputType}] added.`;
          nameInput.value = '';
        } else {
          feedbackMessage = 'Role already exists or is invalid.';
        }
        submitBtn.disabled = false;
        render();
      });
    }

    // Role Edit & Delete
    container.querySelectorAll('.edit-role-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        editingRoleId = e.target.dataset.id;
        render();
      });
    });

    container.querySelectorAll('.cancel-edit-role-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingRoleId = null;
        render();
      });
    });

    container.querySelectorAll('.save-edit-role-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const nameInput = container.querySelector(`#edit-role-name-${id}`);
        const typeSelect = container.querySelector(`#edit-role-type-${id}`);
        if (nameInput && typeSelect) {
          btn.disabled = true;
          await store.editRole(id, nameInput.value, typeSelect.value);
          editingRoleId = null;
          feedbackMessage = 'Role updated.';
          render();
        }
      });
    });

    container.querySelectorAll('.delete-role-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        btn.disabled = true;
        await store.deleteRole(id);
        feedbackMessage = 'Role removed.';
        render();
      });
    });

    // Prompt Form Elements & Persistence Listeners
    const promptChanSelect = container.querySelector('#prompt-channel-select');
    if (promptChanSelect) {
      promptChanSelect.addEventListener('change', (e) => {
        selectedPromptChannel = e.target.value;
        localStorage.setItem('yta_admin_prompt_channel_id', selectedPromptChannel);
        // Also sync active prompts filter so admin sees prompts for the chosen channel
        if (selectedPromptChannel) {
          selectedChannelFilter = selectedPromptChannel;
          localStorage.setItem('yta_admin_prompt_filter_channel', selectedChannelFilter);
          render();
        }
      });
    }

    const promptRoleSelect = container.querySelector('#prompt-role-select');
    if (promptRoleSelect) {
      promptRoleSelect.addEventListener('change', (e) => {
        selectedPromptRole = e.target.value;
        localStorage.setItem('yta_admin_prompt_role_name', selectedPromptRole);
      });
    }

    const promptLabelInput = container.querySelector('#prompt-label-input');
    if (promptLabelInput) {
      promptLabelInput.addEventListener('input', (e) => {
        draftLabel = e.target.value;
        sessionStorage.setItem('yta_admin_prompt_draft_label', draftLabel);
      });
    }

    const promptTextInput = container.querySelector('#prompt-text-input');
    if (promptTextInput) {
      promptTextInput.addEventListener('input', (e) => {
        draftText = e.target.value;
        sessionStorage.setItem('yta_admin_prompt_draft_text', draftText);
      });
    }

    // Prompt Filters
    const channelFilterEl = container.querySelector('#filter-prompt-channel');
    if (channelFilterEl) {
      channelFilterEl.addEventListener('change', (e) => {
        selectedChannelFilter = e.target.value;
        localStorage.setItem('yta_admin_prompt_filter_channel', selectedChannelFilter);
        render();
      });
    }

    const roleFilterEl = container.querySelector('#filter-prompt-role');
    if (roleFilterEl) {
      roleFilterEl.addEventListener('change', (e) => {
        selectedRoleFilter = e.target.value;
        localStorage.setItem('yta_admin_prompt_filter_role', selectedRoleFilter);
        render();
      });
    }

    // Prompt Form Submit
    const addPromptForm = container.querySelector('#add-prompt-form');
    if (addPromptForm) {
      addPromptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cSelect = container.querySelector('#prompt-channel-select');
        const rSelect = container.querySelector('#prompt-role-select');
        const lInput = container.querySelector('#prompt-label-input');
        const tInput = container.querySelector('#prompt-text-input');

        if (!cSelect.value) {
          feedbackMessage = '⚠️ Please select a Target Channel for this prompt.';
          render();
          return;
        }

        const submitBtn = addPromptForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        const res = await store.addRolePrompt(cSelect.value, rSelect.value, lInput.value, tInput.value);
        if (res) {
          feedbackMessage = `Added prompt "${res.label}" for ${res.roleName} (${res.channelName}). Selected channel and role remain active for you to add another prompt.`;
          // Clear only draft title & prompt content
          draftLabel = '';
          draftText = '';
          sessionStorage.removeItem('yta_admin_prompt_draft_label');
          sessionStorage.removeItem('yta_admin_prompt_draft_text');

          // Keep selected channel & role intact
          selectedPromptChannel = cSelect.value;
          selectedPromptRole = rSelect.value;
          localStorage.setItem('yta_admin_prompt_channel_id', selectedPromptChannel);
          localStorage.setItem('yta_admin_prompt_role_name', selectedPromptRole);

          // Update active prompt list filter so the newly added prompt is visible
          selectedChannelFilter = selectedPromptChannel;
          localStorage.setItem('yta_admin_prompt_filter_channel', selectedChannelFilter);
        } else {
          feedbackMessage = 'Failed to add prompt. Please try again.';
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Role Prompt';
        render();
      });
    }

    // Prompt Delete
    container.querySelectorAll('.delete-prompt-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        btn.disabled = true;
        await store.deleteRolePrompt(id);
        feedbackMessage = 'Prompt deleted.';
        render();
      });
    });
  }

  render();
}

