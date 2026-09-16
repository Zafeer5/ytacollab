import { store } from '../../lib/store.js';

export function renderAdminRolesView(container, navigate) {
  let editingRoleId = null;
  let feedbackMessage = '';

  function render() {
    const state = store.getState();
    const roles = state.roles || [];
    const prompts = state.prompts || [];

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
                  <input type="text" id="edit-role-name-${role.id}" value="${role.name}" style="flex: 1; min-width: 140px; padding: 6px 10px;" />
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
                    <span style="font-weight: 600; font-size: 14px;">${role.name}</span>
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

    // Prompts list HTML
    const promptsListHtml = prompts
      .map((p) => `
        <div class="prompt-card" style="padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background-color: var(--bg); margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="sidebar-tag" style="color: var(--text-primary); border-color: var(--text-primary);">${p.roleName}</span>
              <strong style="color: var(--text-primary); font-size: 13px;">${p.label}</strong>
            </div>
            <button class="btn btn-danger btn-sm delete-prompt-btn" data-id="${p.id}">Delete</button>
          </div>
          <div class="prompt-scrollable-content" style="max-height: 85px;">${p.promptText}</div>
        </div>
      `)
      .join('');

    // Role options for prompt form
    const roleOptions = roles
      .map((r) => `<option value="${r.name}">${r.name}</option>`)
      .join('');

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary);">${feedbackMessage}</div>` : ''}

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
            ${rolesListHtml}
          </div>
        </div>

        <!-- Section 2: Role Prompts Management -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <h2>Role Prompts (Visible to Team Members)</h2>
            <span class="helper-text">Prompts will appear directly above the submission box for that task</span>
          </div>

          <form id="add-prompt-form" style="margin-bottom: 20px; background-color: var(--bg); padding: 14px; border-radius: var(--radius); border: 1px solid var(--border);">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 10px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="prompt-role-select">Select Target Role</label>
                <select id="prompt-role-select">
                  ${roleOptions || '<option value="">No roles defined</option>'}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="prompt-label-input">Prompt Title / Label</label>
                <input type="text" id="prompt-label-input" placeholder="e.g. Viral Hook Generator, Midjourney Style" required />
              </div>
            </div>

            <div class="form-group">
              <label for="prompt-text-input">Prompt Content (Team member will copy this)</label>
              <textarea id="prompt-text-input" rows="3" placeholder="Enter prompt guidelines or AI prompt template..." required></textarea>
            </div>

            <button type="submit" class="btn btn-primary">Add Role Prompt</button>
          </form>

          <h3>Active Prompts (${prompts.length})</h3>
          <div class="scrollable-container" style="max-height: 280px; padding: 4px;">
            ${promptsListHtml || '<div style="padding: 20px; text-align: center;" class="helper-text">No prompts added yet. Add prompts above for team members to copy during content production.</div>'}
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

    // Prompt Form Submit
    const addPromptForm = container.querySelector('#add-prompt-form');
    if (addPromptForm) {
      addPromptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rSelect = container.querySelector('#prompt-role-select');
        const lInput = container.querySelector('#prompt-label-input');
        const tInput = container.querySelector('#prompt-text-input');
        const submitBtn = addPromptForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        const res = await store.addRolePrompt(rSelect.value, lInput.value, tInput.value);
        if (res) {
          feedbackMessage = `Added prompt "${res.label}" for ${res.roleName}.`;
          lInput.value = '';
          tInput.value = '';
        }
        submitBtn.disabled = false;
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
