import { store } from '../../lib/store.js';
import { showToast } from '../../components/Toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';

// Module-level staged edits so store updates/refreshes do not erase in-progress changes
let stagedEdits = {}; // id -> { username, password, roles }

const EYE_OPEN_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

export function renderAdminMembersView(container, navigate) {
  let newUserType = 'member'; // 'member' or 'admin'
  let isSaving = false;

  function hasPendingEdits() {
    return Object.values(stagedEdits).some(
      (s) => s.username !== undefined || s.password !== undefined || s.roles !== undefined
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
        password: staged.password !== undefined ? staged.password : '',
        roles: staged.roles !== undefined ? staged.roles : (member.roles || [])
      };
    }

    const mergedMembers = members.map(getMergedMember);
    const activeMembersCount = mergedMembers.length;

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

        // Permissions
        const canEditCredentials = isCurrentUserOwner || isSelf;

        let actionButtonHtml = '';
        if (isThisOwner) {
          actionButtonHtml = '<span class="sidebar-tag" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.3); font-weight: 700;">Protected Owner</span>';
        } else if (isThisAdmin) {
          if (isCurrentUserOwner) {
            actionButtonHtml = `
              <button type="button" class="btn btn-danger btn-sm btn-delete-member" data-id="${member.id}" data-username="${escapeHtml(member.username)}" data-is-admin="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete Admin
              </button>
            `;
          } else {
            actionButtonHtml = '<span class="sidebar-tag" style="background: rgba(99, 102, 241, 0.12); color: #818cf8; border-color: rgba(99, 102, 241, 0.3); font-weight: 600;">Admin Account</span>';
          }
        } else {
          // Normal team member
          if (isCurrentUserOwner || isCurrentUserAdmin) {
            actionButtonHtml = `
              <button type="button" class="btn btn-danger btn-sm btn-delete-member" data-id="${member.id}" data-username="${escapeHtml(member.username)}" data-is-admin="false">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete
              </button>
            `;
          }
        }

        // Role Badge
        let badgeHtml = '';
        if (isThisOwner) {
          badgeHtml = '<span class="sidebar-tag" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.4); font-weight: 700;">OWNER</span>';
        } else if (isThisAdmin) {
          badgeHtml = '<span class="sidebar-tag" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border-color: rgba(99, 102, 241, 0.4); font-weight: 700;">ADMIN</span>';
        } else {
          badgeHtml = '<span class="sidebar-tag" style="border-color: var(--border); color: var(--text-secondary); font-weight: 700;">MEMBER</span>';
        }

        const isMemberEdited = stagedEdits[member.id] && (
          stagedEdits[member.id].username !== undefined ||
          stagedEdits[member.id].password !== undefined ||
          stagedEdits[member.id].roles !== undefined
        );

        return `
          <div class="member-card" style="${isMemberEdited ? 'border-color: rgba(255, 122, 0, 0.4); background: rgba(255, 122, 0, 0.02);' : ''}">
            <!-- Header Row: Name, Badge, Action Button -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 700; font-size: 15px; color: var(--text-primary); letter-spacing: -0.01em;">
                  ${escapeHtml(member.username)}
                </span>
                ${badgeHtml}
                ${isSelf ? '<span class="sidebar-tag" style="border-color: #10b981; color: #10b981; font-weight: 700;">YOU</span>' : ''}
                ${isMemberEdited ? '<span class="sidebar-tag" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); font-weight: 700;">EDITED</span>' : ''}
              </div>
              <div>
                ${actionButtonHtml}
              </div>
            </div>

            <!-- Credentials Inputs: Viewable & Editable Username and New Password -->
            <div class="member-credentials-box">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                  <label for="user-input-${member.id}" style="font-size: 12px; font-weight: 600; color: var(--text-primary);">
                    Username
                  </label>
                  <span style="font-size: 11px; color: var(--text-muted);">
                    ${canEditCredentials ? '(Editable)' : '(Read-only)'}
                  </span>
                </div>
                <input 
                  type="text" 
                  id="user-input-${member.id}"
                  class="edit-member-username" 
                  data-id="${member.id}" 
                  value="${escapeHtml(member.username)}" 
                  ${canEditCredentials ? '' : 'disabled style="opacity: 0.6; cursor: not-allowed;"'} 
                  autocomplete="off" 
                />
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                  <label for="pass-input-${member.id}" style="font-size: 12px; font-weight: 600; color: var(--text-primary);">
                    Password
                  </label>
                  <span style="font-size: 11px; color: var(--text-muted);">
                    ${canEditCredentials ? '(Leave blank to keep current)' : '(Hidden)'}
                  </span>
                </div>
                <div style="position: relative; display: flex; align-items: center;">
                  <input 
                    type="password" 
                    id="pass-input-${member.id}" 
                    class="edit-member-password" 
                    data-id="${member.id}" 
                    value="${escapeHtml(member.password)}" 
                    placeholder="${canEditCredentials ? 'Enter new password to update...' : '••••••••'}" 
                    ${canEditCredentials ? '' : 'disabled style="opacity: 0.6; cursor: not-allowed;"'} 
                    style="padding-right: 42px; font-family: monospace;" 
                    autocomplete="new-password" 
                  />
                  ${canEditCredentials ? `
                    <button 
                      type="button" 
                      class="btn-toggle-eye" 
                      data-target="pass-input-${member.id}" 
                      style="position: absolute; right: 8px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; padding: 6px; color: var(--text-muted); border-radius: 4px; transition: color 0.15s ease;" 
                      title="Show password"
                      aria-label="Toggle password visibility"
                    >
                      ${EYE_OPEN_SVG}
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Roles Section: Shown ONLY for Team Members. Hidden for Admin and Owner -->
            ${
              !isThisOwner && !isThisAdmin
                ? `
                  <div>
                    <div style="margin-bottom: 8px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">Roles &amp; their Check boxes:</div>
                    <div class="roles-grid" style="display: flex; flex-wrap: wrap; gap: 14px;">
                      ${roles
                        .map((r) => {
                          const checked = (member.roles || []).includes(r.name);
                          return `
                            <label class="checkbox-label" style="font-size: 12.5px; padding: 4px 8px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 6px; transition: all 0.15s ease;">
                              <input 
                                type="checkbox" 
                                class="member-role-check" 
                                data-member-id="${member.id}" 
                                data-role-name="${escapeHtml(r.name)}" 
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
                : `
                  <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 4px 2px;">
                    ${isThisOwner ? 'Owner Account — Complete system authority. No task roles needed.' : 'Administrative Account — Full access across production, channels, and admin panel.'}
                  </div>
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
        <div class="card" style="margin-bottom: 24px; padding: 22px;">
          <h2 style="font-size: 17px; margin-bottom: 4px;">Add New User (Team Member or Admin)</h2>
          <p class="helper-text" style="margin-bottom: 16px; font-size: 12.5px;">Create a team account and assign initial production permissions.</p>
          
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
              <p class="helper-text" style="font-size: 12px; margin: 0;">Manage accounts, credentials, and role assignments.</p>
            </div>
            <div>
              ${
                hasPendingEdits()
                  ? `
                    <div style="display: flex; gap: 10px; align-items: center;">
                      <span class="sidebar-tag" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); font-weight: 700; padding: 4px 10px;">Unsaved Changes</span>
                      <button type="button" class="btn btn-primary btn-sm btn-save-changes-trigger" ${isSaving ? 'disabled' : ''} style="height: 32px; padding: 0 14px; font-weight: 700;">
                        ${isSaving ? '<span class="btn-spinner"></span> Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  `
                  : ''
              }
            </div>
          </div>

          <div class="scrollable-container" style="max-height: 600px; padding: 2px;">
            ${membersListHtml || '<div style="padding: 32px; text-align: center;" class="helper-text">No team members found.</div>'}
          </div>

          <!-- Bottom Action Bar: Save Changes Button -->
          <div style="margin-top: 22px; padding: 16px 20px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: var(--radius); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
            <div>
              <div style="font-weight: 700; font-size: 14.5px; color: var(--text-primary);">Save Changes</div>
              <div class="helper-text" style="font-size: 12px; margin-top: 2px;">Commit all username, password, and role updates to the database.</div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              ${
                hasPendingEdits()
                  ? `<button type="button" id="btn-discard-all" class="btn btn-secondary btn-sm" style="height: 40px; padding: 0 16px;">Discard Changes</button>`
                  : ''
              }
              <button 
                type="button" 
                id="btn-save-all-updates" 
                class="btn btn-primary btn-cta" 
                ${!hasPendingEdits() || isSaving ? 'disabled' : ''} 
                style="height: 40px; min-width: 170px; font-weight: 700; font-size: 13.5px;"
              >
                ${isSaving ? '<span class="btn-spinner"></span> Saving Changes...' : 'Save Changes'}
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

    // 2. New User Type Radio (Team Member vs Admin)
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

    // 4. Staged Edit: Username input changes
    container.querySelectorAll('.edit-member-username').forEach((input) => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        if (!stagedEdits[id]) stagedEdits[id] = {};
        stagedEdits[id].username = e.target.value;
        updateSaveBtnState();
      });
    });

    // 5. Staged Edit: Password input changes
    container.querySelectorAll('.edit-member-password').forEach((input) => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        if (!stagedEdits[id]) stagedEdits[id] = {};
        stagedEdits[id].password = e.target.value;
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
        updateSaveBtnState();
      });
    });

    // 7. Delete Member: Prompts smooth blur-overlay confirmation modal, then deletes
    container.querySelectorAll('.btn-delete-member').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const username = btn.dataset.username || 'this user';
        const isAdminAccount = btn.dataset.isAdmin === 'true';

        showConfirmModal({
          title: isAdminAccount ? 'Delete Admin Account' : 'Delete Team Member',
          message: `Are you sure you want to delete <strong>${escapeHtml(username)}</strong>? This action cannot be undone and will permanently revoke their access and assigned duties.`,
          confirmText: 'Delete Account',
          cancelText: 'Cancel',
          danger: true,
          loadingText: 'Deleting...',
          onConfirm: async () => {
            const res = await store.deleteTeamMember(id);
            if (res.success) {
              if (stagedEdits[id]) delete stagedEdits[id];
              showToast(`Account "${username}" was deleted successfully.`, 'danger');
              render();
            } else {
              showToast(`Failed to delete account: ${res.error || 'Unknown error'}`, 'danger');
            }
          }
        });
      });
    });

    // 8. Discard All Changes
    const discardBtn = container.querySelector('#btn-discard-all');
    if (discardBtn) {
      discardBtn.addEventListener('click', () => {
        stagedEdits = {};
        showToast('All staged changes have been discarded.', 'info');
        render();
      });
    }

    // 9. Save Changes Action (Commits all modified fields mapped to each user's ID)
    async function executeSaveBatch() {
      if (!hasPendingEdits() || isSaving) return;

      isSaving = true;
      const saveBtn = container.querySelector('#btn-save-all-updates');
      const triggerBtn = container.querySelector('.btn-save-changes-trigger');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="btn-spinner"></span> Saving Changes...';
      }
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.innerHTML = '<span class="btn-spinner"></span> Saving...';
      }

      const modified = [];

      Object.keys(stagedEdits).forEach((id) => {
        const s = stagedEdits[id];
        if (s.username !== undefined || s.password !== undefined || s.roles !== undefined) {
          modified.push({
            id,
            username: s.username,
            password: s.password,
            roles: s.roles
          });
        }
      });

      const res = await store.batchSaveTeamMembers({ modified, deletedIds: [] });

      isSaving = false;
      if (res.success) {
        stagedEdits = {};
        showToast('Changes saved successfully!', 'success');
      } else {
        showToast(`Failed to save changes: ${(res.errors || []).join('; ')}`, 'danger');
      }

      render();
    }

    const saveBtn = container.querySelector('#btn-save-all-updates');
    if (saveBtn) saveBtn.addEventListener('click', executeSaveBatch);

    const triggerBtn = container.querySelector('.btn-save-changes-trigger');
    if (triggerBtn) triggerBtn.addEventListener('click', executeSaveBatch);

    function updateSaveBtnState() {
      const pending = hasPendingEdits();
      const btn = container.querySelector('#btn-save-all-updates');
      if (btn) btn.disabled = !pending || isSaving;
      const topBtn = container.querySelector('.btn-save-changes-trigger');
      if (topBtn) topBtn.disabled = !pending || isSaving;
    }
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
