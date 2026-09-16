import { store } from '../../lib/store.js';

export function renderAdminMembersView(container, navigate) {
  let feedbackMessage = '';

  function render() {
    const state = store.getState();
    const members = state.teamMembers || [];
    const roles = state.roles || [];

    const membersListHtml = members
      .map((member) => {
        const assignedRoles = member.roles || [];

        return `
          <div style="padding: 14px 12px; border-bottom: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div>
                <span style="font-weight: 700; font-size: 15px; color: var(--text-primary);">${member.username}</span>
                ${member.isAdmin ? '<span class="sidebar-tag" style="margin-left: 8px; border-color: var(--accent); color: var(--text-primary);">ADMIN</span>' : '<span class="sidebar-tag" style="margin-left: 8px;">MEMBER</span>'}
              </div>
              <div>
                ${
                  !member.isAdmin
                    ? `<button class="btn btn-danger btn-sm delete-member-btn" data-id="${member.id}">Delete</button>`
                    : '<span class="helper-text">Primary System Admin</span>'
                }
              </div>
            </div>

            <div class="helper-text" style="margin-bottom: 6px;">Roles &amp; their Check boxes:</div>
            <div class="roles-grid">
              ${roles
                .map((r) => {
                  const checked = assignedRoles.includes(r.name);
                  return `
                    <label class="checkbox-label" style="font-size: 12px;">
                      <input type="checkbox" class="member-role-check" data-member-id="${member.id}" data-role-name="${r.name}" ${checked ? 'checked' : ''} />
                      ${r.name}
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary);">${feedbackMessage}</div>` : ''}

        <div class="card">
          <h2>Add New Team Member And Assign Role</h2>
          <form id="add-member-form" style="margin-bottom: 24px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 12px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="new-member-user">Assign username</label>
                <input type="text" id="new-member-user" placeholder="username" required autocomplete="off" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="new-member-pass">password</label>
                <input type="password" id="new-member-pass" placeholder="password" required autocomplete="new-password" />
              </div>
            </div>

            <div class="form-group">
              <label>Select Initial Roles:</label>
              <div class="roles-grid" id="new-member-roles-grid">
                ${roles
                  .map((r) => `
                    <label class="checkbox-label">
                      <input type="checkbox" value="${r.name}" class="new-member-role-input" />
                      ${r.name}
                    </label>
                  `)
                  .join('')}
              </div>
            </div>

            <button type="submit" class="btn btn-primary">Create Member</button>
          </form>

          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <h3>List of all members (${members.length})</h3>
            <span class="helper-text">Changes save immediately in real time</span>
          </div>

          <div class="scrollable-container" style="max-height: 480px;">
            ${membersListHtml}
          </div>
        </div>
      </div>
    `;

    // Handlers
    const memberForm = container.querySelector('#add-member-form');
    if (memberForm) {
      memberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uInput = container.querySelector('#new-member-user');
        const pInput = container.querySelector('#new-member-pass');
        const submitBtn = memberForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        const selected = [];
        container.querySelectorAll('.new-member-role-input:checked').forEach((cb) => {
          selected.push(cb.value);
        });

        const res = await store.addTeamMember(uInput.value, pInput.value, selected, false);
        if (res.success) {
          feedbackMessage = `Team member "${res.member.username}" created with assigned roles.`;
          uInput.value = '';
          pInput.value = '';
        } else {
          feedbackMessage = res.error;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Member';
        render();
      });
    }

    container.querySelectorAll('.member-role-check').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
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

        await store.updateMemberRoles(memberId, newRoles);
        feedbackMessage = `Updated roles for ${member.username}.`;
        render();
      });
    });

    container.querySelectorAll('.delete-member-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        btn.disabled = true;
        await store.deleteTeamMember(id);
        feedbackMessage = 'Team member deleted.';
        render();
      });
    });
  }

  render();
}
