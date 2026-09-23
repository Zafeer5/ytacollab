import { store } from '../../lib/store.js';

let stagedRoles = {}; // memberId -> Array of role names

export function renderAdminRealtimeView(container, navigate) {
  let feedbackMessage = '';
  let isSaving = false;

  function hasPendingRoleEdits() {
    return Object.keys(stagedRoles).length > 0;
  }

  function render() {
    const state = store.getState();

    // Real-Time Updates feed
    const realtimeItems = (state.realTimeFeed || []).map((msg) => `
      <div class="realtime-msg" style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
        <span>${msg.message}</span>
        <span class="helper-text" style="white-space: nowrap;">${msg.time}</span>
      </div>
    `).join('');

    // Team Member and Their roles list (staged in memory)
    const teamRolesHtml = state.teamMembers
      .filter((m) => !m.isAdmin && !m.isOwner)
      .map((member) => {
        const activeRoles = stagedRoles[member.id] !== undefined
          ? stagedRoles[member.id]
          : (member.roles || []);

        const roleCheckboxes = state.roles
          .map((role) => {
            const isChecked = activeRoles.includes(role.name);
            return `
              <label class="checkbox-label" style="font-size: 12px;">
                <input type="checkbox" class="member-role-toggle" data-member-id="${member.id}" data-role-name="${role.name}" ${isChecked ? 'checked' : ''} />
                ${role.name}
              </label>
            `;
          })
          .join('');

        return `
          <div style="display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; font-size: 14px;">${member.username}</span>
              <span class="helper-text">Assigned: ${activeRoles.length} role(s)</span>
            </div>
            <div class="roles-grid" style="gap: 8px;">
              ${roleCheckboxes}
            </div>
          </div>
        `;
      })
      .join('');

    const hasPending = hasPendingRoleEdits();

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 16px;">${feedbackMessage}</div>` : ''}

        <!-- Real-Time Updates Section -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
            <h2>Live Production Feed</h2>
            <span class="helper-text" style="color: var(--success-text);">● Active</span>
          </div>
          <div class="scrollable-container" style="max-height: 340px;">
            <div class="realtime-list" style="padding: 10px;">
              ${realtimeItems || '<div style="padding: 16px; text-align: center;" class="helper-text">No real-time submissions recorded yet.</div>'}
            </div>
          </div>
        </div>

        <!-- Team Member Role Assignments Section -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
            <h2>Team Member Role Assignments</h2>
            <div style="display: flex; gap: 8px; align-items: center;">
              ${hasPending ? '<span class="sidebar-tag" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); font-weight: 700; padding: 4px 10px;">Unsaved Role Changes</span>' : ''}
              <button type="button" id="btn-save-realtime-roles" class="btn btn-primary btn-cta" ${!hasPending || isSaving ? 'disabled' : ''} style="height: 34px;">
                ${isSaving ? 'Saving...' : 'Save Role Changes'}
              </button>
            </div>
          </div>
          <div class="scrollable-container" style="max-height: 320px;">
            ${teamRolesHtml || '<div style="padding: 16px; text-align: center;" class="helper-text">No team members found.</div>'}
          </div>
        </div>
      </div>
    `;

    // Staged Role checkbox changes (No laggy auto-save)
    container.querySelectorAll('.member-role-toggle').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const memberId = e.target.dataset.memberId;
        const roleName = e.target.dataset.roleName;
        const member = state.teamMembers.find((m) => m.id === memberId);
        if (!member) return;

        const currentActive = stagedRoles[memberId] !== undefined
          ? [...stagedRoles[memberId]]
          : [...(member.roles || [])];

        let updatedRoles;
        if (e.target.checked) {
          updatedRoles = [...new Set([...currentActive, roleName])];
        } else {
          updatedRoles = currentActive.filter((r) => r !== roleName);
        }

        stagedRoles[memberId] = updatedRoles;
        render();
      });
    });

    // Save Role Changes button handler
    const saveRolesBtn = container.querySelector('#btn-save-realtime-roles');
    if (saveRolesBtn) {
      saveRolesBtn.addEventListener('click', async () => {
        if (!hasPendingRoleEdits() || isSaving) return;

        isSaving = true;
        saveRolesBtn.disabled = true;
        saveRolesBtn.textContent = 'Saving...';

        const res = await store.batchSaveRoles(stagedRoles);

        isSaving = false;
        if (res.success) {
          stagedRoles = {};
          feedbackMessage = `✓ Role changes successfully saved to database!`;
        } else {
          feedbackMessage = `Error saving roles: ${res.error || 'Failed to update'}`;
        }
        render();
      });
    }
  }

  render();
}
