import { store } from '../../lib/store.js';
import { showToast } from '../../components/Toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';

// Tracks which member is currently in active Edit Mode (id or null)
let editingMemberId = null;

const EYE_OPEN_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

export function renderAdminMembersView(container, navigate) {
  let newUserType = 'member'; // 'member' or 'admin'

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

    const activeMembersCount = members.length;

    // Generate HTML for each member card
    const membersListHtml = members
      .map((member) => {
        const isThisOwner = Boolean(
          member.isOwner ||
          member.roleType === 'OWNER' ||
          member.username?.toLowerCase() === 'owner' ||
          member.username?.toLowerCase() === 'admin'
        );
        const isThisAdmin = !isThisOwner && Boolean(member.isAdmin || member.roleType === 'ADMIN');
        const isSelf = currentUser?.id === member.id || currentUser?.username?.toLowerCase() === member.username?.toLowerCase();

        // Permissions
        const canEditCredentials = isCurrentUserOwner || isSelf;
        const canDeleteAccount = (isCurrentUserOwner && !isThisOwner) || (isCurrentUserAdmin && !isThisOwner && !isThisAdmin);
        const isCurrentlyEditing = editingMemberId === member.id;

        // Role Badge
        let badgeHtml = '';
        if (isThisOwner) {
          badgeHtml = '<span class="sidebar-tag" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.4); font-weight: 700;">OWNER</span>';
        } else if (isThisAdmin) {
          badgeHtml = '<span class="sidebar-tag" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border-color: rgba(99, 102, 241, 0.4); font-weight: 700;">ADMIN</span>';
        } else {
          badgeHtml = '<span class="sidebar-tag" style="border-color: var(--border); color: var(--text-secondary); font-weight: 700;">MEMBER</span>';
        }

        // Action Buttons in header
        let actionsHtml = '';
        if (isCurrentlyEditing) {
          actionsHtml = `
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" class="btn btn-secondary btn-sm btn-cancel-card-edit" data-id="${member.id}" style="height: 32px; padding: 0 12px;">
                Cancel
              </button>
              <button type="button" class="btn btn-primary btn-sm btn-save-card-edit" data-id="${member.id}" style="height: 32px; padding: 0 16px; font-weight: 700;">
                Save
              </button>
            </div>
          `;
        } else {
          const editBtnHtml = canEditCredentials ? `
            <button type="button" class="btn btn-secondary btn-sm btn-start-card-edit" data-id="${member.id}" style="height: 32px; padding: 0 12px; font-weight: 600;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Edit
            </button>
          ` : '';

          const deleteBtnHtml = canDeleteAccount ? `
            <button type="button" class="btn btn-danger btn-sm btn-delete-member" data-id="${member.id}" data-username="${escapeHtml(member.username)}" data-is-admin="${isThisAdmin}" style="height: 32px; padding: 0 12px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              ${isThisAdmin ? 'Delete Admin' : 'Delete'}
            </button>
          ` : isThisOwner ? '<span class="sidebar-tag" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.3); font-weight: 700;">Protected Owner</span>' : '';

          actionsHtml = `
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              ${editBtnHtml}
              ${deleteBtnHtml}
            </div>
          `;
        }

        // Card Content: either Active Edit Form or Read-Only display
        let bodyHtml = '';
        if (isCurrentlyEditing) {
          bodyHtml = `
            <form class="card-edit-form" data-id="${member.id}" style="margin-top: 14px;">
              <div class="member-credentials-box" style="border-color: rgba(255, 122, 0, 0.35); background: rgba(255, 122, 0, 0.02);">
                <div>
                  <label for="edit-user-${member.id}" style="font-size: 12px; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px;">
                    Username (Editable)
                  </label>
                  <input 
                    type="text" 
                    id="edit-user-${member.id}"
                    class="card-edit-username-input" 
                    value="${escapeHtml(member.username)}" 
                    required 
                    autocomplete="off" 
                  />
                  <span class="helper-text" style="font-size: 11px; margin-top: 4px; display: block;">Change identifier or keep unchanged</span>
                </div>

                <div>
                  <label for="edit-pass-${member.id}" style="font-size: 12px; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px;">
                    New Password
                  </label>
                  <div style="position: relative; display: flex; align-items: center;">
                    <input 
                      type="password" 
                      id="edit-pass-${member.id}" 
                      class="card-edit-password-input" 
                      placeholder="Enter new password (leave blank to keep current)..." 
                      style="padding-right: 42px; font-family: monospace;" 
                      autocomplete="new-password" 
                    />
                    <button 
                      type="button" 
                      class="btn-toggle-eye" 
                      data-target="edit-pass-${member.id}" 
                      style="position: absolute; right: 8px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; padding: 6px; color: var(--text-muted); border-radius: 4px; transition: color 0.15s ease;" 
                      title="Show password"
                      aria-label="Toggle password visibility"
                    >
                      ${EYE_OPEN_SVG}
                    </button>
                  </div>
                  <span class="helper-text" style="font-size: 11px; margin-top: 4px; display: block;">Leave blank if you do not want to change the password</span>
                </div>
              </div>

              <!-- Roles Section (for regular team members only) -->
              ${
                !isThisOwner && !isThisAdmin
                  ? `
                    <div style="margin-bottom: 16px;">
                      <div style="margin-bottom: 8px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">Roles &amp; Check boxes:</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                        ${roles
                          .map((r) => {
                            const checked = (member.roles || []).includes(r.name);
                            return `
                              <label class="checkbox-label" style="font-size: 12.5px; padding: 6px 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 6px;">
                                <input 
                                  type="checkbox" 
                                  class="card-edit-role-check" 
                                  value="${escapeHtml(r.name)}" 
                                  ${checked ? 'checked' : ''} 
                                />
                                <span style="font-weight: 500;">${escapeHtml(r.name)}</span>
                              </label>
                            `;
                          })
                          .join('')}
                      </div>
                    </div>
                  `
                  : ''
              }

              <!-- In-Card Action Footer -->
              <div style="margin-top: 14px; padding: 12px 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="font-size: 12.5px; color: var(--text-secondary);">
                  Editing account <strong style="color: var(--text-primary);">${escapeHtml(member.username)}</strong>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="btn btn-secondary btn-sm btn-cancel-card-edit" data-id="${member.id}" style="height: 36px; padding: 0 14px;">
                    Cancel
                  </button>
                  <button type="submit" class="btn btn-primary btn-sm btn-save-card-edit" data-id="${member.id}" style="height: 36px; padding: 0 18px; font-weight: 700;">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          `;
        } else {
          // Read-Only Card Body
          bodyHtml = `
            <div class="member-credentials-box" style="margin-bottom: 12px;">
              <div>
                <span style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em;">Username</span>
                <span style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${escapeHtml(member.username)}</span>
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em;">Password</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-family: monospace; font-size: 14px; color: var(--text-secondary); letter-spacing: 2px;">••••••••••••</span>
                  <span style="font-size: 11px; color: var(--text-muted);">(Encrypted &amp; Protected)</span>
                </div>
              </div>
            </div>

            <!-- Assigned Roles Display -->
            ${
              !isThisOwner && !isThisAdmin
                ? `
                  <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 4px;">
                    <span style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">Assigned Roles:</span>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                      ${
                        (member.roles && member.roles.length > 0)
                          ? member.roles.map((r) => `<span class="sidebar-tag" style="background: rgba(255, 122, 0, 0.08); border-color: rgba(255, 122, 0, 0.3); color: var(--accent); font-weight: 600; font-size: 11px;">${escapeHtml(r)}</span>`).join('')
                          : '<span style="font-size: 12px; color: var(--text-muted); font-style: italic;">No task roles assigned</span>'
                      }
                    </div>
                  </div>
                `
                : `
                  <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding-top: 4px;">
                    ${isThisOwner ? 'Owner Account — Full system authority. No task roles needed.' : 'Administrative Account — Full system management access.'}
                  </div>
                `
            }
          `;
        }

        return `
          <div class="member-card" style="${isCurrentlyEditing ? 'border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: rgba(255, 122, 0, 0.02);' : ''}">
            <!-- Header Row: Name, Badges, Action Buttons -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 700; font-size: 16px; color: var(--text-primary); letter-spacing: -0.01em;">
                  ${escapeHtml(member.username)}
                </span>
                ${badgeHtml}
                ${isSelf ? '<span class="sidebar-tag" style="border-color: #10b981; color: #10b981; font-weight: 700;">YOU</span>' : ''}
                ${isCurrentlyEditing ? '<span class="sidebar-tag" style="background: rgba(255, 122, 0, 0.2); color: var(--accent); border-color: var(--accent); font-weight: 700;">EDITING MODE</span>' : ''}
              </div>
              <div>
                ${actionsHtml}
              </div>
            </div>

            <!-- Card Body -->
            ${bodyHtml}
          </div>
        `;
      })
      .join('');

    // Creation Form HTML (Visible exclusively to Owner)
    let creationSectionHtml = '';
    if (isCurrentUserOwner) {
      creationSectionHtml = `
        <div class="card" style="margin-bottom: 24px; padding: 22px;">
          <h2 style="font-size: 17px; margin-bottom: 4px;">Add New User (Team Member or Admin)</h2>
          <p class="helper-text" style="margin-bottom: 16px; font-size: 12.5px;">Create a user account and assign initial production permissions.</p>
          
          <form id="add-member-form">
            <!-- Account Type Selector -->
            <div style="margin-bottom: 16px;">
              <label style="font-size: 12px; font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-primary);">
                Select Account Type:
              </label>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 9px 16px; border: 1px solid ${newUserType === 'member' ? 'var(--accent)' : 'var(--border)'}; border-radius: var(--radius); background: ${newUserType === 'member' ? 'rgba(255, 122, 0, 0.1)' : 'var(--surface)'}; font-size: 13px; font-weight: 500; transition: all 0.15s ease;">
                  <input type="radio" name="new-user-type" value="member" ${newUserType === 'member' ? 'checked' : ''} style="margin: 0;" />
                  <span>Team Member</span>
                </label>
                <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 9px 16px; border: 1px solid ${newUserType === 'admin' ? 'var(--accent)' : 'var(--border)'}; border-radius: var(--radius); background: ${newUserType === 'admin' ? 'rgba(255, 122, 0, 0.1)' : 'var(--surface)'}; font-size: 13px; font-weight: 500; transition: all 0.15s ease;">
                  <input type="radio" name="new-user-type" value="admin" ${newUserType === 'admin' ? 'checked' : ''} style="margin: 0;" />
                  <span>Admin (Full Admin Access)</span>
                </label>
              </div>
            </div>

            <!-- Credentials Input Row -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 16px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="new-member-user" style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 6px;">Assign username</label>
                <input type="text" id="new-member-user" placeholder="e.g. john_editor" required autocomplete="off" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="new-member-pass" style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 6px;">Password</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input type="password" id="new-member-pass" placeholder="Create password" required autocomplete="new-password" style="padding-right: 42px; font-family: monospace;" />
                  <button type="button" class="btn-toggle-eye" data-target="new-member-pass" style="position: absolute; right: 8px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; padding: 6px; color: var(--text-muted); border-radius: 4px; transition: color 0.15s ease;" title="Show password" aria-label="Toggle password visibility">${EYE_OPEN_SVG}</button>
                </div>
              </div>
            </div>

            <!-- Roles Grid (ONLY shown if user type is Team Member) -->
            ${
              newUserType === 'member'
                ? `
                  <div class="form-group" style="margin-bottom: 18px;">
                    <label style="margin-bottom: 8px; display: block; font-size: 12px; font-weight: 600;">Select Initial Roles:</label>
                    <div class="roles-grid" id="new-member-roles-grid" style="display: flex; flex-wrap: wrap; gap: 12px;">
                      ${roles
                        .map((r) => `
                          <label class="checkbox-label" style="font-size: 12.5px; padding: 6px 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 6px;">
                            <input type="checkbox" value="${escapeHtml(r.name)}" class="new-member-role-input" />
                            <span>${escapeHtml(r.name)}</span>
                          </label>
                        `)
                        .join('')}
                    </div>
                  </div>
                `
                : `
                  <div style="margin-bottom: 18px; padding: 12px 16px; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: var(--radius); font-size: 12.5px; color: var(--text-primary); line-height: 1.5;">
                    <strong>Admin Account:</strong> Admins receive complete management privileges across the Production Table, Channels, Videos, and Roles. No specific task roles are required.
                  </div>
                `
            }

            <button type="submit" class="btn btn-primary" id="btn-create-user-submit" style="height: 40px; padding: 0 20px; font-weight: 700;">
              Create ${newUserType === 'admin' ? 'Admin' : 'Team Member'}
            </button>
          </form>
        </div>
      `;
    } else {
      creationSectionHtml = `
        <div class="card" style="padding: 18px 22px; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border); border-radius: var(--radius); margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); flex-shrink: 0;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <div>
              <strong style="color: var(--text-primary); font-size: 13.5px;">User Creation Restricted</strong>
              <div class="helper-text" style="font-size: 12px; margin-top: 3px;">
                Only the Owner can create new Admins or Team Members. You have administrative access to view the team and manage your own credentials below.
              </div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="main-content" style="max-width: 1040px; margin: 0 auto; padding-bottom: 60px;">
        ${creationSectionHtml}

        <!-- Members List Card -->
        <div class="card" style="padding: 22px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h3 style="margin-bottom: 3px; font-size: 17px;">Team Members &amp; Admins (${activeMembersCount})</h3>
              <p class="helper-text" style="font-size: 12.5px; margin: 0;">Click <strong>Edit</strong> on any account to update its username, password, or task roles.</p>
            </div>
          </div>

          <div class="scrollable-container" style="max-height: 650px; padding: 2px;">
            ${membersListHtml || '<div style="padding: 32px; text-align: center;" class="helper-text">No team members found.</div>'}
          </div>
        </div>
      </div>
    `;

    // -------------------------------------------------------------------------
    // Event Handlers
    // -------------------------------------------------------------------------

    // 1. Password Visibility Eye Toggle
    container.querySelectorAll('.btn-toggle-eye').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.dataset.target;
        const input = container.querySelector(`#${targetId}`);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = EYE_OFF_SVG;
            btn.title = 'Hide password';
          } else {
            input.type = 'password';
            btn.innerHTML = EYE_OPEN_SVG;
            btn.title = 'Show password';
          }
        }
      });
    });

    // 2. New User Type Radio
    container.querySelectorAll('input[name="new-user-type"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        newUserType = e.target.value;
        render();
      });
    });

    // 3. Add Member Form Submit
    const addMemberForm = container.querySelector('#add-member-form');
    if (addMemberForm) {
      addMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uInput = container.querySelector('#new-member-user');
        const pInput = container.querySelector('#new-member-pass');
        const submitBtn = container.querySelector('#btn-create-user-submit');

        const uVal = (uInput?.value || '').trim();
        const pVal = pInput?.value || '';

        if (!uVal || !pVal) {
          showToast('Please enter both username and password.', 'warning');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="btn-spinner"></span> Creating...';
        }

        const selectedRoles = [];
        if (newUserType === 'member') {
          container.querySelectorAll('.new-member-role-input:checked').forEach((cb) => {
            selectedRoles.push(cb.value);
          });
        }

        const isAdmin = newUserType === 'admin';
        const res = await store.addTeamMember(uVal, pVal, selectedRoles, isAdmin, false);

        if (res.success) {
          showToast(`✓ ${isAdmin ? 'Admin' : 'Team Member'} "${res.member.username}" created successfully!`, 'success');
          if (uInput) uInput.value = '';
          if (pInput) pInput.value = '';
        } else {
          showToast(res.error || 'Failed to create user.', 'danger');
        }

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = `Create ${newUserType === 'admin' ? 'Admin' : 'Team Member'}`;
        }

        render();
      });
    }

    // 4. Start Editing a Member (Edit button clicked)
    container.querySelectorAll('.btn-start-card-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        editingMemberId = id;
        render();
      });
    });

    // 5. Cancel Editing a Member (Cancel button clicked)
    container.querySelectorAll('.btn-cancel-card-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        editingMemberId = null;
        showToast('Editing cancelled.', 'info');
        render();
      });
    });

    // 6. Save Card Edits (Handles Save button or Form Submit)
    async function handleSaveCard(memberId) {
      const card = container.querySelector(`.member-card [data-id="${memberId}"]`)?.closest('.member-card') || container;
      const uInput = card.querySelector(`#edit-user-${memberId}`);
      const pInput = card.querySelector(`#edit-pass-${memberId}`);
      const saveBtn = card.querySelector('.btn-save-card-edit');

      const newUsername = (uInput?.value || '').trim();
      const newPassword = pInput?.value || '';

      if (!newUsername) {
        showToast('Username cannot be empty.', 'warning');
        if (uInput) uInput.focus();
        return;
      }

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="btn-spinner"></span> Saving...';
      }

      const selectedRoles = [];
      card.querySelectorAll('.card-edit-role-check:checked').forEach((cb) => {
        selectedRoles.push(cb.value);
      });

      const res = await store.updateTeamMember(memberId, {
        username: newUsername,
        password: newPassword, // If blank, store preserves existing password
        roles: selectedRoles
      });

      if (res.success) {
        editingMemberId = null;
        showToast(`✓ Credentials for "${newUsername}" updated successfully!`, 'success');
        render();
      } else {
        showToast(res.error || 'Failed to update credentials.', 'danger');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    }

    container.querySelectorAll('.btn-save-card-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        handleSaveCard(id);
      });
    });

    container.querySelectorAll('.card-edit-form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = form.dataset.id;
        handleSaveCard(id);
      });
    });

    // 7. Delete Member: Prompts confirmation modal, then calls delete API
    container.querySelectorAll('.btn-delete-member').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const username = btn.dataset.username || 'this user';
        const isAdminAccount = btn.dataset.isAdmin === 'true';

        showConfirmModal({
          title: isAdminAccount ? 'Delete Admin Account' : 'Delete Team Member',
          message: `Are you sure you want to delete <strong>${escapeHtml(username)}</strong>? This will remove their account and revoke their access. (Their previous video submissions will remain preserved in the database.)`,
          confirmText: 'Delete Account',
          cancelText: 'Cancel',
          danger: true,
          loadingText: 'Deleting...',
          onConfirm: async () => {
            const res = await store.deleteTeamMember(id);
            if (res.success) {
              if (editingMemberId === id) editingMemberId = null;
              showToast(`Account "${username}" was deleted successfully.`, 'danger');
              render();
            } else {
              showToast(`Failed to delete account: ${res.error || 'Unknown error'}`, 'danger');
            }
          }
        });
      });
    });
  }

  render();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
