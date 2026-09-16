// ==============================================================================
// YTA - colabapp Pure Supabase Data Store
// Single Source of Truth: Supabase (Auth, Postgres, Storage, Realtime)
// Unified for Web (Vercel) and Android (Native/Flutter)
// ==============================================================================

import { supabase, supabaseAuthHelper, uploadStorageFile } from './supabase.js';

function formatTimestamp(date = new Date()) {
  const d = new Date(date);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const dateStr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    time,
    dayDate: `${day}, ${dateStr}`,
    full: `${time} on ${day}, ${dateStr}`
  };
}

class SupabaseStore {
  constructor() {
    this.subscribers = new Set();

    // Fast-cache user profile from localStorage for synchronous route rehydration on refresh
    let cachedUser = null;
    try {
      const raw = localStorage.getItem('yta_active_user');
      if (raw) cachedUser = JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse cached user:', e);
    }

    this.state = {
      currentUser: cachedUser,
      isAuthInitialized: false,
      channels: [],
      videos: [],
      roles: [],
      prompts: [],
      teamMembers: [],
      submissions: [],
      ledger: [],
      notifications: [],
      realTimeFeed: [],
      schemaReady: true,
      lastError: null
    };

    this.init();
  }

  async init() {
    // 1. Restore auth session
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await this.loadUserProfile(session.user);
      } else {
        this.state.currentUser = null;
        try {
          localStorage.removeItem('yta_active_user');
        } catch (e) {}
      }
    } catch (err) {
      console.warn('Session restoration error:', err);
    } finally {
      this.state.isAuthInitialized = true;
      this.notifySubscribers();
    }

    // 2. Initial data fetch
    await this.refreshAll();

    // 3. Supabase Realtime channel subscription
    try {
      supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public' },
          () => {
            this.refreshAll();
          }
        )
        .subscribe();
    } catch (rtErr) {
      console.warn('Realtime subscription warning:', rtErr);
    }

    // 4. Auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await this.loadUserProfile(session.user);
      } else {
        this.state.currentUser = null;
      }
      this.notifySubscribers();
    });
  }

  async loadUserProfile(authUser) {
    try {
      // Query profile
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      // If profile not yet created by trigger, create or fallback
      if (!profile) {
        const username = authUser.user_metadata?.username || splitEmail(authUser.email);
        const isAdmin = Boolean(authUser.user_metadata?.is_admin || username === 'admin');
        const { data: newProf } = await supabase
          .from('profiles')
          .insert({ id: authUser.id, username, is_admin: isAdmin })
          .select()
          .single();
        profile = newProf || { id: authUser.id, username, is_admin: isAdmin };
      }

      // Query assigned roles
      const { data: mRoles } = await supabase
        .from('member_roles')
        .select('roles(name)')
        .eq('member_id', authUser.id);

      const assignedRoles = (mRoles || []).map((mr) => mr.roles?.name).filter(Boolean);

      this.state.currentUser = {
        id: profile.id,
        username: profile.username,
        role: profile.is_admin ? 'ADMIN' : 'TEAM_MEMBER',
        assignedRoles: assignedRoles
      };
      try {
        localStorage.setItem('yta_active_user', JSON.stringify(this.state.currentUser));
      } catch (err) {}
    } catch (e) {
      console.warn('Error loading user profile:', e);
      this.state.currentUser = {
        id: authUser.id,
        username: splitEmail(authUser.email),
        role: authUser.email?.includes('admin') ? 'ADMIN' : 'TEAM_MEMBER',
        assignedRoles: []
      };
      try {
        localStorage.setItem('yta_active_user', JSON.stringify(this.state.currentUser));
      } catch (err) {}
    }
  }

  async refreshAll() {
    try {
      // Fetch Channels
      const { data: chData, error: chErr } = await supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: false });

      if (chErr) {
        this.handleSchemaError(chErr);
        return;
      }
      this.state.channels = chData || [];

      // Fetch Videos
      const { data: vidData } = await supabase
        .from('videos')
        .select('*')
        .order('video_number', { ascending: true });
      this.state.videos = (vidData || []).map((v) => ({
        id: v.id,
        channelId: v.channel_id,
        videoNumber: v.video_number,
        title: v.title,
        status: v.status || false,
        script: '',
        voiceover: null,
        thumbnail: null,
        metaInfo: '',
        customFields: {}
      }));

      // Fetch Roles
      const { data: rolesData } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: true });
      this.state.roles = (rolesData || []).map((r) => ({
        id: r.id,
        name: r.name,
        inputType: r.input_type === 'file' ? 'Attach File' : r.input_type === 'number' ? 'Number' : 'Text'
      }));

      // Fetch Role Prompts
      const { data: promptsData } = await supabase
        .from('role_prompts')
        .select('*, roles(name)')
        .order('sort_order', { ascending: true });
      this.state.prompts = (promptsData || []).map((p) => ({
        id: p.id,
        roleName: p.roles?.name || '',
        label: p.label || 'Prompt',
        promptText: p.prompt_text
      }));

      // Fetch Submissions and map onto videos
      const { data: subData } = await supabase
        .from('submissions')
        .select('*, roles(name)');
      this.state.submissions = subData || [];

      this.state.submissions.forEach((sub) => {
        const vid = this.state.videos.find((v) => v.id === sub.video_id);
        if (vid && sub.roles?.name) {
          const rName = sub.roles.name.toLowerCase();
          if (rName.includes('script')) {
            vid.script = sub.content_text || '';
          } else if (rName.includes('voiceover')) {
            vid.voiceover = {
              name: sub.file_name || 'voiceover.mp3',
              url: sub.file_path || '#'
            };
          } else if (rName.includes('thumbnail')) {
            vid.thumbnail = {
              name: sub.file_name || 'thumbnail.png',
              url: sub.file_path || '#'
            };
          } else if (rName.includes('meta')) {
            vid.metaInfo = sub.content_text || '';
          } else {
            if (!vid.customFields) vid.customFields = {};
            if (sub.file_path) {
              vid.customFields[sub.roles.name] = {
                name: sub.file_name || 'file',
                url: sub.file_path
              };
            } else {
              vid.customFields[sub.roles.name] = sub.content_text || '';
            }
          }
        }
      });

      // Fetch Profiles & Member Roles
      const { data: profData } = await supabase
        .from('profiles')
        .select('*, member_roles(roles(name))');

      this.state.teamMembers = (profData || []).map((prof) => ({
        id: prof.id,
        username: prof.username,
        isAdmin: prof.is_admin,
        roles: (prof.member_roles || []).map((mr) => mr.roles?.name).filter(Boolean)
      }));

      // Fetch Ledger
      const { data: ledData } = await supabase
        .from('ledger')
        .select('*, profiles(username), channels(name), videos(video_number)')
        .order('created_at', { ascending: false })
        .limit(100);

      this.state.ledger = (ledData || []).map((l) => ({
        id: l.id,
        actor: l.profiles?.username || 'System',
        action: l.action,
        channel: l.channels?.name || 'System',
        videoNumber: l.videos?.video_number || null,
        task: l.details?.task || 'General',
        fileReference: l.details?.fileReference || '',
        timestamp: formatTimestamp(l.created_at).full
      }));

      // Fetch RealTime Feed from recent submissions and ledger
      this.state.realTimeFeed = this.state.ledger
        .filter((l) => l.action.toLowerCase().includes('submit') || l.action.toLowerCase().includes('paste') || l.action.toLowerCase().includes('upload'))
        .slice(0, 15)
        .map((l) => ({
          id: l.id,
          message: `${l.actor} has ${l.action} at ${l.timestamp}`,
          time: l.timestamp.split(' on ')[0] || '',
          dayDate: l.timestamp.split(' on ')[1] || ''
        }));

      // Fetch Notifications
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      this.state.notifications = (notifData || []).map((n) => ({
        id: n.id,
        recipientId: n.recipient_id,
        targetUsername: this.state.teamMembers.find((m) => m.id === n.recipient_id)?.username || '',
        message: n.message,
        isRead: n.is_read,
        timestamp: formatTimestamp(n.created_at).full
      }));

      this.state.schemaReady = true;
      this.state.lastError = null;
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      this.notifySubscribers();
    }
  }

  handleSchemaError(err) {
    if (err.code === 'PGRST205' || err.message?.includes('schema cache') || err.message?.includes('does not exist')) {
      this.state.schemaReady = false;
      this.state.lastError = 'Supabase database tables not found. Please run the SQL migration script (supabase/schema.sql) in your Supabase SQL Editor.';
      this.notifySubscribers();
    }
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  notifySubscribers() {
    for (const listener of this.subscribers) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Subscriber error:', err);
      }
    }
  }

  getState() {
    return this.state;
  }

  // --- Authentication ---
  async login(username, password) {
    const trimmedUser = (username || '').trim();
    if (!trimmedUser || !password) {
      return { success: false, error: 'Username and password required.' };
    }

    const email = trimmedUser.includes('@') ? trimmedUser : `${trimmedUser.toLowerCase()}@colab.yta`;

    // Attempt sign in
    let { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    // If user is 'admin' and not found yet, bootstrap admin signup on first attempt
    if (error && (trimmedUser.toLowerCase() === 'admin' || email.startsWith('admin@'))) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: 'admin', is_admin: true }
        }
      });
      if (!signUpError && signUpData.user) {
        data = signUpData;
        error = null;
      }
    }

    if (error) {
      return { success: false, error: error.message || 'Invalid username or password.' };
    }

    await this.loadUserProfile(data.user);
    await this.refreshAll();

    return { success: true, user: this.state.currentUser };
  }

  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    this.state.currentUser = null;
    try {
      localStorage.removeItem('yta_active_user');
      sessionStorage.removeItem('yta_team_channel_id');
      sessionStorage.removeItem('yta_team_video_num');
      sessionStorage.removeItem('yta_post_login_redirect');
    } catch (e) {}
    this.notifySubscribers();
  }

  // --- Channel Operations ---
  async addChannel(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const { data, error } = await supabase
      .from('channels')
      .insert({
        name: trimmed,
        created_by: this.state.currentUser?.id || null
      })
      .select()
      .single();

    if (error) {
      console.error('Add channel error:', error);
      return false;
    }

    await this.addLedgerEntry({
      action: 'created channel',
      channelId: data.id,
      task: 'Channel Management',
      fileReference: trimmed
    });

    await this.refreshAll();
    return data;
  }

  async editChannel(id, newName) {
    const trimmed = newName.trim();
    if (!trimmed) return false;

    const { error } = await supabase
      .from('channels')
      .update({ name: trimmed })
      .eq('id', id);

    if (error) return false;

    await this.addLedgerEntry({
      action: `renamed channel to "${trimmed}"`,
      channelId: id,
      task: 'Channel Management',
      fileReference: trimmed
    });

    await this.refreshAll();
    return true;
  }

  async deleteChannel(id) {
    const chan = this.state.channels.find((c) => c.id === id);
    const { error } = await supabase.from('channels').delete().eq('id', id);
    if (error) return false;

    await this.addLedgerEntry({
      action: `deleted channel "${chan?.name || id}"`,
      channelId: null,
      task: 'Channel Management',
      fileReference: chan?.name || ''
    });

    await this.refreshAll();
    return true;
  }

  // --- Titles Line-by-Line ---
  async addTitlesToChannel(channelId, rawTitlesText) {
    const chan = this.state.channels.find((c) => c.id === channelId);
    if (!chan) return { success: false, error: 'Channel not found.' };

    const lines = rawTitlesText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { success: false, error: 'Please enter at least one title line.' };
    }

    const currentVideos = this.state.videos.filter((v) => v.channelId === channelId);
    let nextNum = currentVideos.length > 0 ? Math.max(...currentVideos.map((v) => v.videoNumber)) + 1 : 1;

    const rowsToInsert = lines.map((title) => ({
      channel_id: channelId,
      video_number: nextNum++,
      title: title,
      status: false
    }));

    const { data, error } = await supabase
      .from('videos')
      .insert(rowsToInsert)
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    await this.addLedgerEntry({
      action: `added ${rowsToInsert.length} title(s)`,
      channelId: channelId,
      task: 'Titles',
      fileReference: `${rowsToInsert.length} titles added`
    });

    await this.refreshAll();
    return {
      success: true,
      videos: (data || []).map((d) => ({
        id: d.id,
        channelId: d.channel_id,
        videoNumber: d.video_number,
        title: d.title
      }))
    };
  }

  // --- Roles & Prompts ---
  async addRole(name, inputType) {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const dbInputType = inputType.toLowerCase().includes('file') ? 'file' : inputType.toLowerCase().includes('num') ? 'number' : 'text';

    const { data, error } = await supabase
      .from('roles')
      .insert({ name: trimmed, input_type: dbInputType })
      .select()
      .single();

    if (error) return false;

    await this.addLedgerEntry({
      action: `created role "${trimmed}" [${dbInputType}]`,
      task: 'Role Management',
      fileReference: trimmed
    });

    await this.refreshAll();
    return { id: data.id, name: data.name, inputType: inputType };
  }

  async editRole(id, newName, newInputType) {
    const dbInputType = newInputType.toLowerCase().includes('file') ? 'file' : newInputType.toLowerCase().includes('num') ? 'number' : 'text';
    const { error } = await supabase
      .from('roles')
      .update({ name: newName.trim(), input_type: dbInputType })
      .eq('id', id);

    if (error) return false;
    await this.refreshAll();
    return true;
  }

  async deleteRole(id) {
    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) return false;
    await this.refreshAll();
    return true;
  }

  async addRolePrompt(roleName, label, promptText) {
    const role = this.state.roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) return false;

    const { data, error } = await supabase
      .from('role_prompts')
      .insert({
        role_id: role.id,
        label: label.trim(),
        prompt_text: promptText.trim(),
        sort_order: this.state.prompts.length
      })
      .select()
      .single();

    if (error) return false;

    await this.addLedgerEntry({
      action: `added prompt "${label}" for role "${roleName}"`,
      task: 'Role Prompts',
      fileReference: label
    });

    await this.refreshAll();
    return { id: data.id, roleName, label, promptText };
  }

  async deleteRolePrompt(id) {
    const { error } = await supabase.from('role_prompts').delete().eq('id', id);
    if (error) return false;
    await this.refreshAll();
    return true;
  }

  getPromptsForRole(roleName) {
    return (this.state.prompts || []).filter(
      (p) => p.roleName.toLowerCase() === roleName.toLowerCase()
    );
  }

  // --- Team Members & Roles Assignment ---
  async addTeamMember(username, password, assignedRoles = [], isAdmin = false) {
    const trimmed = username.trim();
    if (!trimmed || !password) return { success: false, error: 'Username and password required.' };

    const email = `${trimmed.toLowerCase()}@colab.yta`;

    // Sign up via Supabase Auth Helper (does not touch admin's active session)
    const { data: authData, error: authError } = await supabaseAuthHelper.auth.signUp({
      email,
      password,
      options: {
        data: { username: trimmed, is_admin: isAdmin }
      }
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    const memberId = authData.user?.id;
    if (memberId && assignedRoles.length > 0) {
      await this.assignMemberRoles(memberId, assignedRoles);
    }

    await this.addLedgerEntry({
      action: `created team member "${trimmed}"`,
      task: 'Team Member Management',
      fileReference: `Assigned: ${assignedRoles.join(', ') || 'None'}`
    });

    await this.refreshAll();
    return { success: true, member: { id: memberId, username: trimmed, roles: assignedRoles } };
  }

  async assignMemberRoles(memberId, roleNames) {
    // Delete existing
    await supabase.from('member_roles').delete().eq('member_id', memberId);

    const rows = [];
    for (const rName of roleNames) {
      const role = this.state.roles.find((r) => r.name.toLowerCase() === rName.toLowerCase());
      if (role) {
        rows.push({ member_id: memberId, role_id: role.id });
      }
    }

    if (rows.length > 0) {
      await supabase.from('member_roles').insert(rows);
    }
  }

  async updateMemberRoles(memberId, newRoles) {
    await this.assignMemberRoles(memberId, newRoles);
    await this.addLedgerEntry({
      action: `updated roles for member`,
      task: 'Role Assignment',
      fileReference: newRoles.join(', ')
    });
    await this.refreshAll();
    return true;
  }

  async deleteTeamMember(id) {
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) return false;
    await this.refreshAll();
    return true;
  }

  // --- Submissions & Storage Upload ---
  async submitContent({ channelId, videoNumber, task, textValue, file }) {
    const vid = this.state.videos.find((v) => v.channelId === channelId && v.videoNumber === Number(videoNumber));
    if (!vid) return { success: false, error: 'Target video not found for this channel.' };

    const normTask = (task || '').trim().toLowerCase();
    const role = this.state.roles.find(
      (r) =>
        r.name.toLowerCase() === normTask ||
        (normTask.includes('meta') && r.name.toLowerCase().includes('meta')) ||
        (normTask.includes('thumb') && r.name.toLowerCase().includes('thumb')) ||
        (normTask.includes('script') && r.name.toLowerCase().includes('script')) ||
        (normTask.includes('voice') && r.name.toLowerCase().includes('voice'))
    );

    if (!role || !role.id) {
      return { success: false, error: `Role "${task}" was not found in the database roles.` };
    }

    // Ensure we do not submit empty content
    if (!file && (!textValue || !textValue.trim())) {
      return { success: false, error: 'Cannot submit empty content. Please provide input before submitting.' };
    }

    let filePath = null;
    let fileName = null;

    if (file) {
      const bucket = normTask.includes('voice') ? 'voiceovers' : 'thumbnails';
      const uploadRes = await uploadStorageFile(bucket, `vid_${videoNumber}`, file);
      filePath = uploadRes.publicUrl || uploadRes.filePath;
      fileName = uploadRes.fileName || file.name;
    }

    // Upsert into submissions table
    const submissionRow = {
      video_id: vid.id,
      role_id: role.id,
      submitted_by: this.state.currentUser?.id || null,
      content_text: textValue ? textValue.trim() : null,
      file_path: filePath,
      file_name: fileName,
      submitted_at: new Date().toISOString()
    };

    const { error: subErr } = await supabase
      .from('submissions')
      .upsert(submissionRow, { onConflict: 'video_id,role_id' });

    if (subErr) {
      console.error('Submission error:', subErr);
      return { success: false, error: subErr.message };
    }

    const chan = this.state.channels.find((c) => c.id === channelId);
    const actionDesc = file ? `uploaded ${task}` : `submitted ${task}`;

    await this.addLedgerEntry({
      action: actionDesc,
      channelId: channelId,
      videoId: vid.id,
      task: task,
      fileReference: fileName || (textValue ? textValue.slice(0, 40) : '')
    });

    await this.refreshAll();
    return { success: true };
  }

  // --- Status Checkbox ---
  async toggleVideoStatus(videoId) {
    const vid = this.state.videos.find((v) => v.id === videoId);
    if (!vid) return false;

    const nextStatus = !vid.status;
    const { error } = await supabase
      .from('videos')
      .update({ status: nextStatus })
      .eq('id', videoId);

    if (error) return false;

    await this.addLedgerEntry({
      action: nextStatus ? 'marked status complete' : 'cleared status',
      videoId: videoId,
      channelId: vid.channelId,
      task: 'Status',
      fileReference: nextStatus ? 'Complete' : 'Pending'
    });

    await this.refreshAll();
    return nextStatus;
  }

  // --- Pending Cell Detection Rule ---
  getCellStatus(video, columnKey) {
    const hasTitle = Boolean(video.title && video.title.trim());
    const hasScript = Boolean(video.script && video.script.trim());
    const hasVoiceover = Boolean(video.voiceover && video.voiceover.name);
    const hasThumbnail = Boolean(video.thumbnail && video.thumbnail.name);
    const hasMeta = Boolean(video.metaInfo && video.metaInfo.trim());

    const values = {
      title: hasTitle,
      script: hasScript,
      voiceover: hasVoiceover,
      thumbnail: hasThumbnail,
      metaInfo: hasMeta
    };

    const hasAnyValue = Object.values(values).some(Boolean);
    const hasCurrentValue = values[columnKey];

    if (hasCurrentValue) {
      return { status: 'filled', value: video[columnKey] };
    }

    if (hasAnyValue && !hasCurrentValue) {
      return { status: 'pending', value: null };
    }

    return { status: 'empty', value: null };
  }

  // --- Send Notifications ---
  async sendPendingNotifications(channelId) {
    const chan = this.state.channels.find((c) => c.id === channelId);
    if (!chan) return { count: 0, recipients: [] };

    const channelVideos = this.state.videos.filter((v) => v.channelId === channelId);
    const pendingTasks = [];

    for (const vid of channelVideos) {
      const scriptStatus = this.getCellStatus(vid, 'script');
      const voStatus = this.getCellStatus(vid, 'voiceover');
      const thumbStatus = this.getCellStatus(vid, 'thumbnail');
      const metaStatus = this.getCellStatus(vid, 'metaInfo');

      if (scriptStatus.status === 'pending') pendingTasks.push({ videoId: vid.id, videoNumber: vid.videoNumber, roleName: 'Script' });
      if (voStatus.status === 'pending') pendingTasks.push({ videoId: vid.id, videoNumber: vid.videoNumber, roleName: 'voiceover' });
      if (thumbStatus.status === 'pending') pendingTasks.push({ videoId: vid.id, videoNumber: vid.videoNumber, roleName: 'thumbnail' });
      if (metaStatus.status === 'pending') pendingTasks.push({ videoId: vid.id, videoNumber: vid.videoNumber, roleName: 'Meta Info' });
    }

    if (pendingTasks.length === 0) {
      return { count: 0, recipients: [], message: 'No pending cells found for this channel.' };
    }

    const notifiedMembers = new Set();
    const notificationRows = [];

    for (const task of pendingTasks) {
      const matchingMembers = this.state.teamMembers.filter(
        (m) => m.roles && m.roles.some((r) => r.toLowerCase() === task.roleName.toLowerCase())
      );

      for (const member of matchingMembers) {
        notifiedMembers.add(member.username);
        notificationRows.push({
          recipient_id: member.id,
          message: `Pending ${task.roleName} on Video ${task.videoNumber} for '${chan.name}'`,
          related_video_id: task.videoId,
          is_read: false
        });
      }
    }

    if (notificationRows.length > 0) {
      await supabase.from('notifications').insert(notificationRows);
    }

    const recipientList = Array.from(notifiedMembers);
    await this.addLedgerEntry({
      action: `sent notifications for ${pendingTasks.length} pending task(s)`,
      channelId: channelId,
      task: 'Notifications',
      fileReference: `Notified: ${recipientList.join(', ') || 'No members with matching roles'}`
    });

    await this.refreshAll();
    return {
      count: pendingTasks.length,
      recipients: recipientList,
      message: `Notifications sent to ${recipientList.length} member(s) (${recipientList.join(', ') || 'None'}) for ${pendingTasks.length} pending cell(s).`
    };
  }

  // --- Audit Ledger Logging ---
  async addLedgerEntry({ action, channelId = null, videoId = null, task = '', fileReference = '' }) {
    try {
      await supabase.from('ledger').insert({
        actor_id: this.state.currentUser?.id || null,
        action: action,
        channel_id: channelId,
        video_id: videoId,
        details: { task, fileReference }
      });
    } catch (e) {
      console.warn('Ledger logging warning:', e);
    }
  }
}

function splitEmail(email) {
  return email ? email.split('@')[0] : 'user';
}

export const store = new SupabaseStore();
