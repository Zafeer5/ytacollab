import { store } from '../../lib/store.js';

// Module-level staged edits so store updates/refreshes do not erase in-progress changes
let stagedEdits = {}; // id -> { username, password, roles, isDeleted }

export function renderAdminMembersView(container, navigate) {
  let feedbackMessage = '';
  let newUserType = 'member'; // 'member' or 'admin'
  let isSaving = false;

  function hasPendingEdits() {
    return Object.values(stagedEdits).some(
      (s) => s.isDeleted || s.username !== undefined || s.password !== undefined || s.roles !== undefined
    );
  }

  function render() {
    const state = store.getState();
    const members = state.teamMembers || [];
    const roles = state.roles || [];
    const currentUser = state.currentUser;

    const isCurrentUserOwner = Boolean(
      currentUser?.isOwner ||
      currentUser?.role === 'OWNER' ||
      currentUser?.username?.toLowerCase() === 'owner' ||
      currentUser?.username?.toLowerCase() === 'admin'
    );
    const isCurrentUserAdmin = Boolean(
      currentUser?.isAdmin ||
      currentUser?.role === 'ADMIN' ||
      isCurrentUserOwner
    );

    // Merge staged edits into member data
    function getMergedMember(member) {
      const staged = stagedEdits[member.id] || {};
      return {
        ...member,
        username: staged.username !== undefined ? staged.username : member.username,
        password: staged.password !== undefined ? staged.password : (member.password || ''),
        roles: staged.roles !== undefined ? staged.roles : (member.roles || []),
        isDeleted: Boolean(staged.isDeleted)
      };
    }

    const mergedMembers = members.map(getMergedMember);
    const activeMembersCount = mergedMembers.filter((m) => !m.isDeleted).length;

    // Generate HTML for each member card
    const membersListHtml = mergedMembers
      .map((member) => {
        const isThisOwner = Boolean(
          member.isOwner ||
          member.roleType === 'OWNER' ||
          member.username?.toLowerCase() === 'owner' ||
          member.username?.toLowerCase() === 'admin'
        );
        const isThisAdmin = !isThisOwner && Boolean(member.isAdmin || member.roleType === 'ADMIN');
        const isSelf = currentUser?.id === member.id || currentUser?.username?.toLowerCase() === member.username?.toLowerCase();

        // Permission: Can current user edit this member's credentials?
        // Owner can edit ANY member. Admin can ONLY edit own account.
        const canEditCredentials = isCurrentUserOwner || isSelf;

        // Permission: Can current user delete this member?
        // Owner can NEVER be deleted.
        // Admin can be deleted by Owner, but NOT by other Admins.
        // Team member can be deleted by Owner or Admin.
        let actionButtonHtml = '';
        if (isThisOwner) {
          actionButtonHtml = '<span class="helper-text" style="color: #f87171; font-weight: 600; font-size: 11px;">👑 Protected Owner Account</span>';
        } else if (isThisAdmin) {
          if (isCurrentUserOwner) {
            actionButtonHtml = member.isDeleted
              ? `<button type="button" class="btn btn-secondary btn-sm btn-undo-delete" data-id="${member.id}">Undo Delete</button>`
              : `<button type="button" class="btn btn-danger btn-sm btn-delete-member" data-id="${member.id}">Delete Admin</button>`;
          } else {
            actionButtonHtml = '<span class="helper-text" style="font-size: 11px;">Admin Account</span>';
          }
        } else {
          // Normal team member
          if (isCurrentUserOwner || isCurrentUserAdmin) {
            actionButtonHtml = member.isDeleted
              ? `<button type="button" class="btn btn-secondary btn-sm btn-undo-delete" data-id="${member.id}">Undo Delete</button>`
              : `<button type="button" class="btn btn-danger btn-sm btn-delete-member" data-id="${member.id}">Delete</button>`;
          }
        }

        // Role Badge
        let badgeHtml = '';
        if (isThisOwner) {
          badgeHtml = '<span class="sidebar-tag" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: #f87171; font-weight: 600;">OWNER</span>';
        } else if (isThisAdmin) {
          badgeHtml = '<span class="sidebar-tag" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border-color: #818cf8; font-weight: 600;">ADMIN</span>';
        } else {
          badgeHtml = '<span class="sidebar-tag" style="border-color: var(--border); color: var(--text-secondary);">MEMBER</span>';
        }

        return `
          <div class="member-card" style="padding: 16px; border: 1px solid ${member.isDeleted ? '#ef4444' : 'var(--border)'}; border-radius: var(--radius); background: ${member.isDeleted ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg)'}; margin-bottom: 14px; transition: border-color 0.2s ease;">
            <!-- Header Row: Name, Badge, Action Button -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 700; font-size: 15px; color: ${member.isDeleted ? '#f87171' : 'var(--text-primary)'}; text-decoration: ${member.isDeleted ? 'line-through' : 'none'};">
                  ${member.username}
                </span>
                ${badgeHtml}
                ${isSelf ? '<span class="sidebar-tag" style="border-color: #10b981; color: #10b981; font-size: 10px; font-weight: 600;">YOU</span>' : ''}
              </div>
              <div>
                ${actionButtonHtml}
              </div>
            </div>

            ${
              member.isDeleted
                ? `
                  <div style="padding: 8px 12px; background: rgba(239, 68, 68, 0.12); border-radius: 4px; color: #f87171; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                    <span>⚠️ Marked for deletion. Click <strong>Save Updates</strong> below to permanently delete this user.</span>
                    <button type="button" class="btn btn-secondary btn-sm btn-undo-delete" data-id="${member.id}" style="height: 28px; padding: 0 10px;">Undo</button>
                  </div>
                `
                : `
                  <!-- Credentials Inputs: Viewable & Editable Username and Password -->
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 12px; background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div>
                      <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px; font-weight: 500;">
                        Username ${canEditCredentials ? '(Editable)' : '(Read-only)'}
                      </label>
                      <input 
                        type="text" 
                        class="edit-member-username" 
                        data-id="${member.id}" 
                        value="${member.username}" 
                        ${canEditCredentials ? '' : 'disabled style="opacity: 0.7; cursor: not-allowed;"'} 
                        autocomplete="off" 
                      />
                    </div>

                    <div>
                      <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px; font-weight: 500;">
                        Password ${canEditCredentials ? '(Click 👁️ to view or edit)' : '(Hidden)'}
                      </label>
                      <div style="position: relative; display: flex; align-items: center;">
                        <input 
                          type="password" 
                          id="pass-input-${member.id}" 
                          class="edit-member-password" 
                          data-id="${member.id}" 
                          value="${member.password || ''}" 
                          placeholder="Password not set..." 
                          ${canEditCredentials ? '' : 'disabled style="opacity: 0.7; cursor: not-allowed;"'} 
                          style="padding-right: 36px; font-family: monospace;" 
                          autocomplete="new-password" 
                        />
                        <button 
                          type="button" 
                          class="btn-toggle-eye" 
                          data-target="pass-input-${member.id}" 
                          style="position: absolute; right: 6px; background: transparent; border: none; cursor: pointer; font-size: 15px; padding: 4px 6px; color: var(--text-muted);" 
                          title="Show/Hide Password"
                        >
                          👁️
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Roles Section: Shown ONLY for Team Members. Hidden for Admin and Owner -->
                  ${
                    !isThisOwner && !isThisAdmin
                      ? `
                        <div>
                          <div class="helper-text" style="margin-bottom: 6px; font-size: 12px; font-weight: 500;">Roles &amp; their Check boxes:</div>
                          <div class="roles-grid">
                            ${roles
                              .map((r) => {
                                const checked = (member.roles || []).includes(r.name);
                                return `
                                  <label class="checkbox-label" style="font-size: 12px;">
                                    <input 
                                      type="checkbox" 
                                      class="member-role-check" 
                                      data-member-id="${member.id}" 
                                      data-role-name="${r.name}" 
                                      ${checked ? 'checked' : ''} 
                                    />
                                    ${r.name}
                                  </label>
                                `;
                              })
                              .join('')}
                          </div>
                        </div>
                      `
                      : `
                        <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 4px 2px;">
                          ⚡ ${isThisOwner ? 'Owner Account — Complete system authority. No task roles needed.' : 'Administrative Account — Full access across production, channels, and admin panel.'}
                        </div>
                      `
                  }
                `
            }
          </div>
        `;
      })
      .join('');

    // Creation Form HTML (Visible exclusively to Owner)
    let creationSectionHtml = '';
    if (isCurrentUserOwner) {
      creationSectionHtml = `
        <div class="card" style="margin-bottom: 24px;">
          <h2>Add New User (Team Member or Admin)</h2>
          
          <form id="add-member-form" style="margin-top: 14px;">
            <!-- Account Type Selector -->
            <div style="margin-bottom: 14px;">
              <label style="font-size: 12px; font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-primary);">
                Select Account Type:
              </label>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid ${newUserType === 'member' ? 'var(--accent)' : 'var(--border)'}; border-radius: var(--radius); background: ${newUserType === 'member' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg)'}; font-size: 13px; font-weight: 500;">
                  <input type="radio" name="new-user-type" value="member" ${newUserType === 'member' ? 'checked' : ''} style="margin: 0;" />
                  <span>👤 Team Member</span>
                </label>
                <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid ${newUserType === 'admin' ? 'var(--accent)' : 'var(--border)'}; border-radius: var(--radius); background: ${newUserType === 'admin' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg)'}; font-size: 13px; font-weight: 500;">
                  <input type="radio" name="new-user-type" value="admin" ${newUserType === 'admin' ? 'checked' : ''} style="margin: 0;" />
                  <span>🛡️ Admin (Full Admin Access)</span>
                </label>
              </div>
            </div>

            <!-- Credentials Input Row -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="new-member-user">Assign username</label>
                <input type="text" id="new-member-user" placeholder="e.g. john_editor" required autocomplete="off" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="new-member-pass">Password</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input type="password" id="new-member-pass" placeholder="Create password" required autocomplete="new-password" style="padding-right: 36px; font-family: monospace;" />
                  <button type="button" class="btn-toggle-eye" data-target="new-member-pass" style="position: absolute; right: 6px; background: transparent; border: none; cursor: pointer; font-size: 15px; padding: 4px 6px; color: var(--text-muted);" title="Show/Hide Password">👁️</button>
                </div>
              </div>
            </div>

            <!-- Roles Grid (ONLY shown if user type is Team Member) -->
            ${
              newUserType === 'member'
                ? `
                  <div class="form-group" style="margin-bottom: 16px;">
                    <label style="margin-bottom: 8px; display: block;">Select Initial Roles:</label>
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
                `
                : `
                  <div style="margin-bottom: 16px; padding: 10px 14px; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: var(--radius); font-size: 12px; color: var(--text-primary);">
                    🛡️ <strong>Admin Account:</strong> Admins receive complete management privileges across the Production Table, Channels, Videos, and Roles. No task roles are required.
                  </div>
                `
            }

            <button type="submit" class="btn btn-primary" style="height: 38px;">
              Create ${newUserType === 'admin' ? 'Admin' : 'Team Member'}
            </button>
          </form>
        </div>
      `;
    } else {
      creationSectionHtml = `
        <div class="card" style="padding: 16px 20px; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border); border-radius: var(--radius); margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">🛡️</span>
            <div>
              <strong style="color: var(--text-primary); font-size: 13px;">User Creation Restricted</strong>
              <div class="helper-text" style="font-size: 12px; margin-top: 2px;">
                Only the Owner can create new Admins or Team Members. You have administrative access to view the team and manage your own credentials below.
              </div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="main-content">
        ${feedbackMessage ? `<div class="notification-banner" style="background-color: var(--surface); border-color: var(--border); color: var(--text-primary); margin-bottom: 16px;">${feedbackMessage}</div>` : ''}

        ${creationSectionHtml}

        <!-- Members List Card -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
            <div>
              <h3 style="margin-bottom: 2px;">Team Members &amp; Admins (${activeMembersCount})</h3>
            </div>
            <div>
              ${
                hasPendingEdits()
                  ? `
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <span class="sidebar-tag" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); font-weight: 700; padding: 4px 10px;">⚠️ Unsaved Changes</span>
                      <button type="button" class="btn btn-primary btn-sm btn-save-changes-trigger" ${isSaving ? 'disabled' : ''} style="height: 30px;">
                        ${isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  `
                  : ''
              }
            </div>
          </div>

          <div class="scrollable-container" style="max-height: 520px; padding: 2px;">
            ${membersListHtml || '<div style="padding: 24px; text-align: center;" class="helper-text">No members found.</div>'}
          </div>

          <!-- Bottom Action Bar: Save Changes Button -->
          <div style="margin-top: 20px; padding: 14px 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: var(--radius); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">Save Changes</div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              ${
                hasPendingEdits()
                  ? `<button type="button" id="btn-discard-all" class="btn btn-secondary btn-sm" style="height: 38px;">Discard Changes</button>`
                  : ''
              }
              <button 
                type="button" 
                id="btn-save-all-updates" 
                class="btn btn-primary btn-cta" 
                ${!hasPendingEdits() || isSaving ? 'disabled' : ''} 
                style="height: 38px; min-width: 170px; font-weight: 700;"
              >
                ${isSaving ? 'Saving Changes...' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // -------------------------------------------------------------------------
    // Event Handlers
    // -------------------------------------------------------------------------

    // 1. Eye Show/Hide Password Toggle
    container.querySelectorAll('.btn-toggle-eye').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.dataset.target;
        const input = container.querySelector(`#${targetId}`);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🙈';
            btn.title = 'Hide Password';
          } else {
            input.type = 'password';
            btn.textContent = '👁️';
            btn.title = 'Show Password';
          }
        }
      });
    });

    // 2. New User Type Radio (Team Member vs Admin)
    container.querySelectorAll('input[name="new-user-type"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        newUserType = e.target.value;
        render();
      });
    });

    // 3. Add Member Form Submit (Staged or Direct)
    const addMemberForm = container.querySelector('#add-member-form');
    if (addMemberForm) {
      addMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uInput = container.querySelector('#new-member-user');
        const pInput = container.querySelector('#new-member-pass');
        const submitBtn = addMemberForm.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        const selectedRoles = [];
        if (newUserType === 'member') {
          container.querySelectorAll('.new-member-role-input:checked').forEach((cb) => {
            selectedRoles.push(cb.value);
          });
        }

        const isAdmin = newUserType === 'admin';
        const res = await store.addTeamMember(uInput.value, pInput.value, selectedRoles, isAdmin, false);

        if (res.success) {
          feedbackMessage = `✓ ${isAdmin ? 'Admin' : 'Team Member'} "${res.member.username}" created successfully!`;
          uInput.value = '';
          pInput.value = '';
        } else {
          feedbackMessage = `⚠️ ${res.error || 'Failed to create user.'}`;
        }

        submitBtn.disabled = false;
        render();
      });
    }

    // 4. Staged Edit: Username input changes
    container.querySelectorAll('.edit-member-username').forEach((input) => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        if (!stagedEdits[id]) stagedEdits[id] = {};
        stagedEdits[id].username = e.target.value;
        hasUnsavedChanges = true;
        updateSaveBtnState();
      });
    });

    // 5. Staged Edit: Password input changes
    container.querySelectorAll('.edit-member-password').forEach((input) => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        if (!stagedEdits[id]) stagedEdits[id] = {};
        stagedEdits[id].password = e.target.value;
        hasUnsavedChanges = true;
        updateSaveBtnState();
      });
    });

    // 6. Staged Edit: Role checkboxes (Team members only)
    container.querySelectorAll('.member-role-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const memberId = e.target.dataset.memberId;
        const roleName = e.target.dataset.roleName;

        const currentMerged = getMergedMember(members.find((m) => m.id === memberId) || {});
        let newRoles = [...(currentMerged.roles || [])];

        if (e.target.checked) {
          newRoles = [...new Set([...newRoles, roleName])];
        } else {
          newRoles = newRoles.filter((r) => r !== roleName);
        }

        if (!stagedEdits[memberId]) stagedEdits[memberId] = {};
        stagedEdits[memberId].roles = newRoles;
        hasUnsavedChanges = true;
        updateSaveBtnState();
      });
    });

    // 7. Staged Delete Member
    container.querySelectorAll('.btn-delete-member').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        if (!stagedEdits[id]) stagedEdits[id] = {};
        stagedEdits[id].isDeleted = true;
        hasUnsavedChanges = true;
        render();
      });
    });

    // 8. Staged Undo Delete
    container.querySelectorAll('.btn-undo-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        if (stagedEdits[id]) {
          stagedEdits[id].isDeleted = false;
        }
        checkUnsavedStatus();
        render();
      });
    });

    // 9. Discard All Changes
    const discardBtn = container.querySelector('#btn-discard-all');
    if (discardBtn) {
      discardBtn.addEventListener('click', () => {
        stagedEdits = {};
        hasUnsavedChanges = false;
        feedbackMessage = 'Staged changes discarded.';
        render();
      });
    }

    // 10. Save Changes Action (Commits all staged changes to DB in one go)
    async function executeSaveBatch() {
      if (!hasPendingEdits() || isSaving) return;

      isSaving = true;
      const saveBtn = container.querySelector('#btn-save-all-updates');
      const triggerBtn = container.querySelector('.btn-save-changes-trigger');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving Changes...';
      }
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = 'Saving...';
      }

      const modified = [];
      const deletedIds = [];

      Object.keys(stagedEdits).forEach((id) => {
        const s = stagedEdits[id];
        if (s.isDeleted) {
          deletedIds.push(id);
        } else if (s.username !== undefined || s.password !== undefined || s.roles !== undefined) {
          modified.push({
            id,
            username: s.username,
            password: s.password,
            roles: s.roles
          });
        }
      });

      const res = await store.batchSaveTeamMembers({ modified, deletedIds });

      isSaving = false;
      if (res.success) {
        stagedEdits = {};
        feedbackMessage = `✓ All changes (${res.savedCount || (modified.length + deletedIds.length)}) successfully saved to the database!`;
      } else {
        feedbackMessage = `⚠️ Error saving: ${(res.errors || []).join('; ')}`;
      }

      render();
    }

    const saveBtn = container.querySelector('#btn-save-all-updates');
    if (saveBtn) saveBtn.addEventListener('click', executeSaveBatch);

    const triggerBtn = container.querySelector('.btn-save-changes-trigger');
    if (triggerBtn) triggerBtn.addEventListener('click', executeSaveBatch);

    function updateSaveBtnState() {
      const btn = container.querySelector('#btn-save-all-updates');
      if (btn) btn.disabled = !hasPendingEdits();
      const topBtn = container.querySelector('.btn-save-changes-trigger');
      if (topBtn) topBtn.disabled = !hasPendingEdits();
    }
  }

  render();
}

