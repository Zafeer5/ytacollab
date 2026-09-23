// ==============================================================================
// YTA - colabapp Pure Supabase Data Store
// Single Source of Truth: Supabase (Auth, Postgres, Storage, Realtime)
// Unified for Web (Vercel) and Android (Native/Flutter)
// ==============================================================================

import { supabase, supabaseAuthHelper, uploadStorageFile } from './supabase.js';

// Secure in-browser file download helper (bypasses cross-origin/blob errors)
export async function downloadFileSecurely(url, filename = 'download') {
  if (!url || url === '#' || url === 'undefined') {
    alert('No file available to download.');
    return;
  }

  try {
    // 1. Direct Blob URL
    if (url.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 2. Fetch as Blob to prevent cross-origin 403/browser handling errors
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch (err) {
    console.warn('Direct blob fetch failed, trying fallback download mechanism:', err);

    // Fallback A: Supabase storage SDK download
    try {
      if (url.includes('/storage/v1/object/public/')) {
        const parts = url.split('/storage/v1/object/public/')[1];
        if (parts) {
          const slashIdx = parts.indexOf('/');
          const bucket = parts.substring(0, slashIdx);
          const path = decodeURIComponent(parts.substring(slashIdx + 1));
          const { data, error } = await supabase.storage.from(bucket).download(path);
          if (!error && data) {
            const blobUrl = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
            return;
          }
        }
      }
    } catch (sErr) {
      console.warn('Storage SDK download fallback failed:', sErr);
    }

    // Fallback B: New window / tab direct link
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

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
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('yta_active_user');
        if (raw) cachedUser = JSON.parse(raw);
      }
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
        const isOwner = Boolean(
          authUser.user_metadata?.is_owner ||
          username.toLowerCase() === 'admin' ||
          username.toLowerCase() === 'owner' ||
          authUser.email?.toLowerCase().startsWith('admin@') ||
          authUser.email?.toLowerCase().startsWith('owner@')
        );
        const isAdmin = Boolean(authUser.user_metadata?.is_admin || isOwner);
        const passwordText = authUser.user_metadata?.password_text || '';

        const { data: newProf } = await supabase
          .from('profiles')
          .insert({
            id: authUser.id,
            username,
            is_admin: isAdmin,
            is_owner: isOwner,
            password_text: passwordText
          })
          .select()
          .single();
        profile = newProf || { id: authUser.id, username, is_admin: isAdmin, is_owner: isOwner, password_text: passwordText };
      }

      // Query assigned roles
      const { data: mRoles } = await supabase
        .from('member_roles')
        .select('roles(name)')
        .eq('member_id', authUser.id);

      const assignedRoles = (mRoles || []).map((mr) => mr.roles?.name).filter(Boolean);

      const username = profile.username || authUser.user_metadata?.username || splitEmail(authUser.email);
      const isOwner = Boolean(
        profile.is_owner ||
        authUser.user_metadata?.is_owner ||
        username.toLowerCase() === 'admin' ||
        username.toLowerCase() === 'owner' ||
        authUser.email?.toLowerCase().startsWith('admin@') ||
        authUser.email?.toLowerCase().startsWith('owner@')
      );
      const isAdmin = Boolean(profile.is_admin || authUser.user_metadata?.is_admin || isOwner);

      this.state.currentUser = {
        id: profile.id,
        username: username,
        role: isOwner ? 'OWNER' : isAdmin ? 'ADMIN' : 'TEAM_MEMBER',
        isAdmin: isAdmin,
        isOwner: isOwner,
        assignedRoles: assignedRoles
      };
      try {
        localStorage.setItem('yta_active_user', JSON.stringify(this.state.currentUser));
      } catch (err) {}
    } catch (e) {
      console.warn('Error loading user profile:', e);
      const uname = splitEmail(authUser.email);
      const isOwner = uname.toLowerCase() === 'admin' || uname.toLowerCase() === 'owner';
      const isAdmin = isOwner || authUser.email?.includes('admin');
      this.state.currentUser = {
        id: authUser.id,
        username: uname,
        role: isOwner ? 'OWNER' : isAdmin ? 'ADMIN' : 'TEAM_MEMBER',
        isAdmin: isAdmin,
        isOwner: isOwner,
        assignedRoles: []
      };
      try {
        localStorage.setItem('yta_active_user', JSON.stringify(this.state.currentUser));
      } catch (err) {}
    }
  }

  async refreshAll() {
    try {
      // Execute all 8 core queries concurrently via Promise.all for 5-8x faster loading
      const [
        chRes,
        vidRes,
        rolesRes,
        promptsRes,
        subRes,
        profRes,
        ledRes,
        notifRes
      ] = await Promise.all([
        supabase.from('channels').select('*').order('created_at', { ascending: false }),
        supabase.from('videos').select('*').order('video_number', { ascending: true }),
        supabase.from('roles').select('*').order('created_at', { ascending: true }),
        supabase.from('role_prompts').select('*, roles(name), channels(name)').order('sort_order', { ascending: true }).then((r) => {
          if (r.error && (r.error.code === '42703' || r.error.message?.includes('channel_id') || r.error.message?.includes('channels'))) {
            return supabase.from('role_prompts').select('*, roles(name)').order('sort_order', { ascending: true });
          }
          return r;
        }).catch((err) => {
          console.warn('Prompts fetch fallback:', err);
          return supabase.from('role_prompts').select('*, roles(name)').order('sort_order', { ascending: true });
        }),
        supabase.from('submissions').select('*, roles(name)'),
        supabase.from('profiles').select('*, member_roles(roles(name))'),
        supabase.from('ledger').select('*, profiles(username), channels(name), videos(video_number)').order('created_at', { ascending: false }).limit(100),
        supabase.from('notifications').select('*').order('created_at', { ascending: false })
      ]);

      if (chRes.error) {
        this.handleSchemaError(chRes.error);
        return;
      }
      this.state.channels = chRes.data || [];

      // Videos
      this.state.videos = (vidRes.data || []).map((v) => ({
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

      // Roles
      this.state.roles = (rolesRes.data || []).map((r) => ({
        id: r.id,
        name: r.name,
        inputType: r.input_type === 'file' ? 'Attach File' : r.input_type === 'number' ? 'Number' : 'Text'
      }));

      // Prompts
      const promptsData = promptsRes.data || [];
      this.state.prompts = promptsData.map((p) => {
        const matchedChannel = p.channels?.name
          ? p.channels.name
          : p.channel_id
          ? this.state.channels.find((c) => c.id === p.channel_id)?.name
          : null;

        return {
          id: p.id,
          roleName: p.roles?.name || '',
          channelId: p.channel_id || null,
          channelName: matchedChannel || 'All Channels',
          label: p.label || 'Prompt',
          promptText: p.prompt_text
        };
      });

      // Submissions mapping (with full storage path resolution)
      this.state.submissions = subRes.data || [];
      this.state.submissions.forEach((sub) => {
        const vid = this.state.videos.find((v) => v.id === sub.video_id);
        if (vid && sub.roles?.name) {
          const rName = sub.roles.name.toLowerCase();
          if (rName.includes('script')) {
            vid.script = sub.content_text || '';
          } else if (rName.includes('voiceover')) {
            let voUrl = sub.file_path || '#';
            if (voUrl && !voUrl.startsWith('http') && !voUrl.startsWith('blob:') && voUrl !== '#') {
              const { data: urlData } = supabase.storage.from('voiceovers').getPublicUrl(voUrl);
              if (urlData?.publicUrl) voUrl = urlData.publicUrl;
            }
            vid.voiceover = {
              name: sub.file_name || 'voiceover.mp3',
              url: voUrl
            };
          } else if (rName.includes('thumbnail')) {
            let thumbUrl = sub.file_path || '#';
            if (thumbUrl && !thumbUrl.startsWith('http') && !thumbUrl.startsWith('blob:') && thumbUrl !== '#') {
              const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(thumbUrl);
              if (urlData?.publicUrl) thumbUrl = urlData.publicUrl;
            }
            vid.thumbnail = {
              name: sub.file_name || 'thumbnail.png',
              url: thumbUrl
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

      // Profiles & Member Roles
      const profData = profRes.data || [];
      this.state.teamMembers = profData.map((prof) => {
        const isOwner = Boolean(
          prof.is_owner ||
          prof.username?.toLowerCase() === 'admin' ||
          prof.username?.toLowerCase() === 'owner'
        );
        const isAdmin = Boolean(prof.is_admin || isOwner);

        return {
          id: prof.id,
          username: prof.username,
          password: prof.password_text || '',
          isAdmin: isAdmin,
          isOwner: isOwner,
          roleType: isOwner ? 'OWNER' : isAdmin ? 'ADMIN' : 'TEAM_MEMBER',
          roles: (prof.member_roles || []).map((mr) => mr.roles?.name).filter(Boolean)
        };
      });

      // Ledger
      const ledData = ledRes.data || [];
      this.state.ledger = ledData.map((l) => ({
        id: l.id,
        actor: l.profiles?.username || 'System',
        action: l.action,
        channel: l.channels?.name || 'System',
        videoNumber: l.videos?.video_number || null,
        task: l.details?.task || 'General',
        fileReference: l.details?.fileReference || '',
        timestamp: formatTimestamp(l.created_at).full
      }));

      // Realtime Feed
      this.state.realTimeFeed = this.state.ledger
        .filter((l) => l.action.toLowerCase().includes('submit') || l.action.toLowerCase().includes('paste') || l.action.toLowerCase().includes('upload'))
        .slice(0, 15)
        .map((l) => ({
          id: l.id,
          message: `${l.actor} has ${l.action} at ${l.timestamp}`,
          time: l.timestamp.split(' on ')[0] || '',
          dayDate: l.timestamp.split(' on ')[1] || ''
        }));

      // Notifications
      const notifData = notifRes.data || [];
      this.state.notifications = notifData.map((n) => ({
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

    // If initial login for 'admin' or 'owner' bootstrap signup on first attempt
    if (error && (trimmedUser.toLowerCase() === 'admin' || trimmedUser.toLowerCase() === 'owner' || email.startsWith('admin@') || email.startsWith('owner@'))) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: trimmedUser.toLowerCase(), is_admin: true, is_owner: true, password_text: password }
        }
      });
      if (!signUpError && signUpData.user) {
        data = signUpData;
        error = null;
      }
    }

    // If sign in failed, check if password in profiles matches (handles cases where password was updated in profiles)
    if (error) {
      try {
        const { data: matchedProf } = await supabase
          .from('profiles')
          .select('*')
          .ilike('username', trimmedUser)
          .single();

        if (matchedProf && matchedProf.password_text === password) {
          try {
            await supabase.rpc('admin_update_user_credentials', {
              target_user_id: matchedProf.id,
              new_username: matchedProf.username,
              new_password: password
            });
            const retry = await supabase.auth.signInWithPassword({
              email: `${matchedProf.username.toLowerCase()}@colab.yta`,
              password
            });
            if (retry.data?.user) {
              data = retry.data;
              error = null;
            }
          } catch (syncErr) {
            console.warn('Auth password sync retry error:', syncErr);
          }
        }
      } catch (chkErr) {}
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

  async addRolePrompt(channelIdOrRoleName, roleNameOrLabel, labelOrPromptText, maybePromptText) {
    let channelId = null;
    let roleName = '';
    let label = '';
    let promptText = '';

    if (maybePromptText !== undefined) {
      // 4-arg signature: addRolePrompt(channelId, roleName, label, promptText)
      channelId = channelIdOrRoleName;
      roleName = roleNameOrLabel;
      label = labelOrPromptText;
      promptText = maybePromptText;
    } else {
      // 3-arg signature: addRolePrompt(roleName, label, promptText)
      roleName = channelIdOrRoleName;
      label = roleNameOrLabel;
      promptText = labelOrPromptText;
    }

    const role = this.state.roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) return false;

    const payload = {
      role_id: role.id,
      label: (label || 'Prompt').trim(),
      prompt_text: (promptText || '').trim(),
      sort_order: this.state.prompts.length
    };

    if (channelId && channelId !== '__all__') {
      payload.channel_id = channelId;
    }

    let insertRes = await supabase
      .from('role_prompts')
      .insert(payload)
      .select()
      .single();

    // Fallback if channel_id column does not exist yet in Supabase
    if (insertRes.error && (insertRes.error.code === '42703' || insertRes.error.message?.includes('channel_id')) && payload.channel_id) {
      delete payload.channel_id;
      insertRes = await supabase
        .from('role_prompts')
        .insert(payload)
        .select()
        .single();
    }

    if (insertRes.error) {
      console.error('Failed to add role prompt:', insertRes.error);
      return false;
    }

    const data = insertRes.data;
    const channelObj = (channelId && channelId !== '__all__')
      ? this.state.channels.find((c) => c.id === channelId)
      : null;
    const channelName = channelObj ? channelObj.name : 'All Channels';

    await this.addLedgerEntry({
      action: `added prompt "${label}" for role "${roleName}" (${channelName})`,
      task: 'Role Prompts',
      channelId: channelObj ? channelObj.id : null,
      channel: channelName,
      fileReference: label
    });

    await this.refreshAll();
    return { id: data.id, roleName, channelId: payload.channel_id || null, channelName, label, promptText };
  }

  async deleteRolePrompt(id) {
    const { error } = await supabase.from('role_prompts').delete().eq('id', id);
    if (error) return false;
    await this.refreshAll();
    return true;
  }

  getPromptsForRole(roleName, channelId = null) {
    if (!roleName) return [];
    const rLower = roleName.toLowerCase();
    const rolePrompts = (this.state.prompts || []).filter(
      (p) => (p.roleName || '').toLowerCase() === rLower
    );

    if (!channelId) {
      return rolePrompts;
    }

    const channelPrompts = rolePrompts.filter((p) => p.channelId === channelId);
    const globalPrompts = rolePrompts.filter((p) => !p.channelId);

    // Prioritize channel-specific prompts if defined
    if (channelPrompts.length > 0) {
      return [...channelPrompts, ...globalPrompts];
    }

    return globalPrompts;
  }

  // --- Team Members & Roles Assignment ---
  async addTeamMember(username, password, assignedRoles = [], isAdmin = false, isOwner = false) {
    const trimmed = username.trim();
    if (!trimmed || !password) return { success: false, error: 'Username and password required.' };

    const effectiveIsOwner = Boolean(isOwner || trimmed.toLowerCase() === 'owner');
    const effectiveIsAdmin = Boolean(isAdmin || effectiveIsOwner);
    const email = `${trimmed.toLowerCase()}@colab.yta`;

    // Sign up via Supabase Auth Helper (does not touch active admin session)
    const { data: authData, error: authError } = await supabaseAuthHelper.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: trimmed,
          is_admin: effectiveIsAdmin,
          is_owner: effectiveIsOwner,
          password_text: password
        }
      }
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    const memberId = authData.user?.id;
    if (memberId) {
      // Ensure profiles record has password_text, is_owner, and is_admin
      try {
        await supabase.from('profiles').update({
          username: trimmed,
          is_admin: effectiveIsAdmin,
          is_owner: effectiveIsOwner,
          password_text: password
        }).eq('id', memberId);
      } catch (pErr) {
        console.warn('Profile direct update warning:', pErr);
      }

      if (!effectiveIsAdmin && !effectiveIsOwner && assignedRoles.length > 0) {
        await this.assignMemberRoles(memberId, assignedRoles);
      }
    }

    const typeLabel = effectiveIsOwner ? 'Owner' : effectiveIsAdmin ? 'Admin' : 'Team Member';
    await this.addLedgerEntry({
      action: `created ${typeLabel} "${trimmed}"`,
      task: 'Team Member Management',
      fileReference: effectiveIsAdmin ? 'Full System Access' : `Assigned: ${assignedRoles.join(', ') || 'None'}`
    });

    await this.refreshAll();
    return {
      success: true,
      member: {
        id: memberId,
        username: trimmed,
        password: password,
        isAdmin: effectiveIsAdmin,
        isOwner: effectiveIsOwner,
        roles: assignedRoles
      }
    };
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
    const member = this.state.teamMembers.find((m) => m.id === id);
    if (member?.isOwner) {
      return { success: false, error: 'Owner account cannot be deleted.' };
    }
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    await this.refreshAll();
    return { success: true };
  }

  // --- Batch Save for Team Members (No real-time auto-saving) ---
  async batchSaveTeamMembers({ modified = [], deletedIds = [] }) {
    const errors = [];
    const savedActions = [];

    // 1. Process deletions
    for (const id of deletedIds) {
      const member = this.state.teamMembers.find((m) => m.id === id);
      if (member?.isOwner) {
        errors.push(`The Owner account (${member.username}) cannot be deleted.`);
        continue;
      }

      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) {
        errors.push(`Failed to delete "${member?.username || id}": ${error.message}`);
      } else {
        savedActions.push(`deleted ${member?.username || id}`);
      }
    }

    // 2. Process modified credentials and roles
    for (const item of modified) {
      const current = this.state.teamMembers.find((m) => m.id === item.id);
      if (!current) continue;

      const newUsername = (item.username || current.username).trim();
      const newPassword = item.password !== undefined ? item.password : current.password;
      const usernameChanged = newUsername !== current.username;
      const passwordChanged = newPassword !== current.password;
      const rolesChanged = !current.isAdmin && !current.isOwner && item.roles && (
        item.roles.length !== current.roles.length ||
        !item.roles.every((r) => current.roles.includes(r))
      );

      // Save credential updates
      if (usernameChanged || passwordChanged) {
        const updatePayload = {
          username: newUsername,
          updated_at: new Date().toISOString()
        };
        if (newPassword) {
          updatePayload.password_text = newPassword;
        }

        const { error: profErr } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', item.id);

        if (profErr) {
          errors.push(`Failed to update credentials for "${current.username}": ${profErr.message}`);
        } else {
          // Attempt RPC to sync auth.users
          try {
            await supabase.rpc('admin_update_user_credentials', {
              target_user_id: item.id,
              new_username: newUsername,
              new_password: newPassword || ''
            });
          } catch (rpcErr) {
            console.warn('Credentials RPC update notice:', rpcErr);
          }
          savedActions.push(`updated credentials for ${newUsername}`);
        }
      }

      // Save roles updates for team members (skip admin/owner)
      if (rolesChanged && !current.isAdmin && !current.isOwner) {
        await this.assignMemberRoles(item.id, item.roles);
        savedActions.push(`updated roles for ${newUsername}`);
      }
    }

    if (savedActions.length > 0) {
      await this.addLedgerEntry({
        action: `saved batch team updates (${savedActions.length} item${savedActions.length > 1 ? 's' : ''})`,
        task: 'Team Member Management',
        fileReference: savedActions.slice(0, 3).join(', ')
      });
    }

    await this.refreshAll();

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : null,
      savedCount: savedActions.length
    };
  }

  // --- Batch Save for Role Assignments (No realtime lag) ---
  async batchSaveRoles(rolesByMemberId = {}) {
    const memberIds = Object.keys(rolesByMemberId);
    if (memberIds.length === 0) return { success: true, count: 0 };
    for (const memberId of memberIds) {
      await this.assignMemberRoles(memberId, rolesByMemberId[memberId]);
    }
    await this.addLedgerEntry({
      action: `saved role assignments for ${memberIds.length} member(s)`,
      task: 'Role Management',
      fileReference: `${memberIds.length} member(s) updated`
    });
    await this.refreshAll();
    return { success: true, count: memberIds.length };
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
    // Optimistic in-memory update: instant UI response without waiting for network!
    vid.status = nextStatus;
    this.notifySubscribers();

    const { error } = await supabase
      .from('videos')
      .update({ status: nextStatus })
      .eq('id', videoId);

    if (error) {
      vid.status = !nextStatus;
      this.notifySubscribers();
      return false;
    }

    await this.addLedgerEntry({
      action: nextStatus ? 'marked status complete' : 'cleared status',
      videoId: videoId,
      channelId: vid.channelId,
      task: 'Status',
      fileReference: nextStatus ? 'Complete' : 'Pending'
    });

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
  async sendPendingNotifications(channelId, selectedVideoIds = null) {
    const chan = this.state.channels.find((c) => c.id === channelId);
    if (!chan) return { count: 0, recipients: [], message: 'Channel not found.' };

    let channelVideos = this.state.videos.filter((v) => v.channelId === channelId);
    if (selectedVideoIds !== null && Array.isArray(selectedVideoIds)) {
      channelVideos = channelVideos.filter((v) => selectedVideoIds.includes(v.id));
    }

    if (channelVideos.length === 0) {
      return { count: 0, recipients: [], message: 'No matching videos selected.' };
    }

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
      return {
        count: 0,
        recipients: [],
        message: `No pending cells found in the ${channelVideos.length} selected video(s).`
      };
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
      action: `sent notifications for ${pendingTasks.length} pending task(s) across ${channelVideos.length} selected video(s)`,
      channelId: channelId,
      task: 'Notifications',
      fileReference: `Notified: ${recipientList.join(', ') || 'None'}`
    });

    await this.refreshAll();
    return {
      count: pendingTasks.length,
      recipients: recipientList,
      message: `Notifications sent to ${recipientList.length} member(s) (${recipientList.join(', ') || 'None'}) for ${pendingTasks.length} pending task(s) across ${channelVideos.length} video(s).`
    };
  }

  async clearNotification(notificationId) {
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
    if (!error) {
      this.state.notifications = this.state.notifications.filter((n) => n.id !== notificationId);
      this.notifySubscribers();
    }
    return !error;
  }

  async clearAllMyNotifications(userId) {
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', userId);
    if (!error) {
      this.state.notifications = this.state.notifications.filter((n) => n.recipientId !== userId);
      this.notifySubscribers();
    }
    return !error;
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
