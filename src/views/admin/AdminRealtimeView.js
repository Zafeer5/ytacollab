import { store } from '../../lib/store.js';

export function renderAdminRealtimeView(container, navigate) {
  function render() {
    const state = store.getState();

    // Real-Time Updates list
    const realtimeItems = (state.realTimeFeed || []).map((msg) => `
      <div class="realtime-msg" style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
        <span>${msg.message}</span>
        <span class="helper-text" style="white-space: nowrap;">${msg.time}</span>
      </div>
    `).join('');

    // Team Member and Their roles list
    const teamRolesHtml = state.teamMembers
      .filter((m) => !m.isAdmin)
      .map((member) => {
        const roleCheckboxes = state.roles
          .map((role) => {
            const isChecked = (member.roles || []).includes(role.name);
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
              <span class="helper-text">Assigned: ${(member.roles || []).length} role(s)</span>
            </div>
            <div class="roles-grid" style="gap: 8px;">
              ${roleCheckboxes}
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="main-content">
        <!-- Real-Time Updates Section -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
            <h2>Real-Time Updates</h2>
            <span class="helper-text" style="color: var(--success-text);">● Live feed active</span>
          </div>
          <div class="helper-text" style="margin-bottom: 12px;">
            Shows messages of the form: "Team_member has submitted/pasted {task} at {Time} on {Day,Date}"
          </div>
          <div class="scrollable-container" style="max-height: 380px;">
            <div class="realtime-list" style="padding: 10px;">
              ${realtimeItems || '<div style="padding: 16px; text-align: center;" class="helper-text">No real-time submissions recorded yet. Once team members submit tasks, updates will stream here.</div>'}
            </div>
          </div>
        </div>

        <!-- Team Member and Their roles list -->
        <div class="card">
          <h2>Team Member and Their roles list</h2>
          <div class="helper-text" style="margin-bottom: 10px;">
            Admin can check/uncheck roles and the change updates the database immediately in real time.
          </div>
          <div class="scrollable-container" style="max-height: 300px;">
            ${teamRolesHtml || '<div style="padding: 16px; text-align: center;" class="helper-text">No team members added yet. Use "Team Members" in the sidebar to add accounts.</div>'}
          </div>
        </div>
      </div>
    `;

    // Role checkbox changes
    container.querySelectorAll('.member-role-toggle').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const memberId = e.target.dataset.memberId;
        const member = state.teamMembers.find((m) => m.id === memberId);
        if (!member) return;

        const currentRoles = [...(member.roles || [])];
        const roleName = e.target.dataset.roleName;

        let newRoles;
        if (e.target.checked) {
          newRoles = [...new Set([...currentRoles, roleName])];
        } else {
          newRoles = currentRoles.filter((r) => r !== roleName);
        }

        store.updateMemberRoles(memberId, newRoles);
        render();
      });
    });
  }

  render();
}
