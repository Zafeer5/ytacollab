// ==============================================================================
// YTA - colabapp Pure Supabase Data Store
// Single Source of Truth: Supabase (Auth, Postgres, Storage, Realtime)
// Unified for Web (Vercel) and Android (Native/Flutter)
// ==============================================================================

import { supabase, supabaseAuthHelper, uploadStorageFile } from './supabase.js';

// Helper to parse Supabase bucket and path from various URL structures or storage paths
export function parseSupabaseStorageUrl(url) {
  if (!url || typeof url !== 'string' || url === '#' || url === 'undefined') {
    return null;
  }

  // 1. Matches standard Supabase storage URLs:
  // e.g. https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  // e.g. https://<project>.supabase.co/storage/v1/object/authenticated/<bucket>/<path>
  // e.g. https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>
  // e.g. /storage/v1/object/public/<bucket>/<path>
  const storageObjectRegex = /\/storage\/v1\/object\/(?:public\/|authenticated\/|sign\/)?([^/?#]+)\/(.+)$/;
  const match = url.match(storageObjectRegex);
  if (match) {
    const bucket = match[1];
    const pathWithoutQuery = match[2].split('?')[0].split('#')[0];
    let path = decodeURIComponent(pathWithoutQuery);
    // Remove redundant leading bucket if path was saved as "voiceovers/vid_1/..."
    if (path.startsWith(`${bucket}/`)) {
      path = path.slice(bucket.length + 1);
    }
    return { bucket, path };
  }

  // 2. Relative paths starting with known bucket names: e.g. "voiceovers/vid_1/abc.wav"
  const knownBuckets = ['voiceovers', 'thumbnails'];
  for (const b of knownBuckets) {
    if (url.startsWith(`${b}/`)) {
      const pathWithoutQuery = url.slice(b.length + 1).split('?')[0].split('#')[0];
      return {
        bucket: b,
        path: decodeURIComponent(pathWithoutQuery)
      };
    }
  }

  // 3. Relative file paths without bucket: e.g. "vid_1/1789463623_abc.wav"
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:') && !url.startsWith('data:')) {
    const clean = url.split('?')[0].split('#')[0];
    const ext = clean.split('.').pop()?.toLowerCase();
    const isAudio = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac'].includes(ext);
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext);
    if (isAudio) return { bucket: 'voiceovers', path: decodeURIComponent(clean) };
    if (isImage) return { bucket: 'thumbnails', path: decodeURIComponent(clean) };
  }

  return null;
}

// Secure in-browser file download helper with explicit error handling and delayed revoke
export async function downloadFileSecurely(url, filename = 'download') {
  if (!url || url === '#' || url === 'undefined') {
    alert('No file available to download.');
    return;
  }

  // 1. Direct Blob URL (e.g., local preview before upload)
  if (url.startsWith('blob:')) {
    // Validate that the blob URL is alive in the current browser memory
    try {
      const check = await fetch(url, { method: 'GET' });
      if (!check.ok) throw new Error('Blob resource unavailable');
      const blobData = await check.blob();
      if (!blobData || blobData.size === 0) throw new Error('Empty blob');
      const safeBlobUrl = URL.createObjectURL(blobData);
      const a = document.createElement('a');
      a.href = safeBlobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try { URL.revokeObjectURL(safeBlobUrl); } catch (e) {}
      }, 2000);
      return;
    } catch (blobErr) {
      console.error('[Download Error] Blob URL is expired or unavailable in this browser session:', url, blobErr);
      alert('Download unavailable: This file was not stored in cloud storage and only existed temporarily on the device where it was selected. Please ask the team member to re-upload it.');
      return;
    }
  }

  // 2. Check if URL points to Supabase Storage
  const storageInfo = parseSupabaseStorageUrl(url);

  if (storageInfo) {
    const { bucket, path } = storageInfo;
    console.log(`[Supabase Storage] Initiating download from bucket: "${bucket}", path: "${path}"`);

    try {
      // Primary: Use Supabase SDK download (authenticated & handles private/public buckets)
      let { data, error } = await supabase.storage.from(bucket).download(path);

      // If clean path failed with 404, retry with full prefixed path if different
      if (error && !path.startsWith(`${bucket}/`)) {
        const retryRes = await supabase.storage.from(bucket).download(`${bucket}/${path}`);
        if (!retryRes.error && retryRes.data) {
          data = retryRes.data;
          error = null;
        }
      }

      // Explicitly check for a Supabase download error and log it, preventing blob creation if error exists
      if (error) {
        console.error(`[Supabase Storage Download Error] Failed to download "${path}" from bucket "${bucket}":`, error);
        alert(`Download failed: ${error.message || 'File could not be found or downloaded from Supabase storage.'}`);
        return; // Prevent blob creation and stop execution
      }

      // Check for empty data / blob
      if (!data || data.size === 0) {
        console.error(`[Supabase Storage Download Error] Supabase returned empty data (0 bytes) for "${path}" in bucket "${bucket}".`);
        alert('Download failed: The requested file is empty or missing from storage.');
        return; // Prevent empty blob creation
      }

      // Deduce file extension for filename if missing or generic
      let safeFilename = filename;
      if (safeFilename === 'download' || !safeFilename.includes('.')) {
        const ext = path.split('.').pop();
        if (ext && ext !== path) {
          safeFilename = safeFilename === 'download' ? `voiceover.${ext}` : `${safeFilename}.${ext}`;
        }
      }

      // Create blob URL and initiate download
      const blobUrl = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Wrap the URL.revokeObjectURL(url) cleanup step in a setTimeout of at least 1000ms
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (revErr) {
          console.warn('URL.revokeObjectURL cleanup error:', revErr);
        }
      }, 2000); // 2000ms ensures browser download manager has time to initiate download

      return;
    } catch (storageErr) {
      console.error('[Supabase Storage] Unexpected exception during download:', storageErr);
      alert(`Download failed: ${storageErr.message || 'Storage download error'}`);
      return;
    }
  }

  // 3. Fallback for external HTTP/HTTPS files
  try {
    console.log(`[File Download] Fetching external file: ${url}`);
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      console.error(`[File Download Error] HTTP ${response.status} ${response.statusText} fetching ${url}`);
      alert(`Download failed: Server returned HTTP ${response.status}`);
      return;
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      console.error('[File Download Error] Fetched file is empty (0 bytes).');
      alert('Download failed: The file is empty.');
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Wrap revoke in setTimeout of at least 1000ms
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (revErr) {
        console.warn('URL.revokeObjectURL cleanup error:', revErr);
      }
    }, 2000);
  } catch (err) {
    console.error('[File Download Error] Network or fetch error downloading file:', err);
    alert(`Download failed: ${err.message || 'Could not download file.'}`);
  }
}

// Opens a high-resolution thumbnail modal popup with a download button on top
export function openThumbnailModal(url, filename = 'thumbnail.png') {
  if (!url || url === '#' || url === 'undefined') {
    alert('No thumbnail available to preview.');
    return;
  }

  // Remove any previously open modal
  const prevModal = document.getElementById('yta-thumbnail-modal');
  if (prevModal) prevModal.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'yta-thumbnail-modal';
  backdrop.className = 'thumbnail-modal-backdrop';

  // Sanitize filename for display
  const safeTitle = (filename || 'thumbnail.png').replace(/[<>&"]/g, '');

  backdrop.innerHTML = `
    <div class="thumbnail-modal-dialog" role="dialog" aria-modal="true" aria-label="Thumbnail Preview">
      <div class="thumbnail-modal-header">
        <div class="thumbnail-modal-title" title="${safeTitle}">
          ${safeTitle}
        </div>
        <div class="thumbnail-modal-actions">
          <button type="button" class="btn btn-primary btn-sm btn-modal-download" style="padding: 5px 14px; font-size: 12px; font-weight: 700;">
            Download
          </button>
          <button type="button" class="thumbnail-modal-close" title="Close preview (Esc)">
            ✕
          </button>
        </div>
      </div>
      <div class="thumbnail-modal-body">
        <img src="${url}" alt="${safeTitle}" class="thumbnail-modal-image" />
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeModal = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeModal();
  };

  document.addEventListener('keydown', onKeyDown);

  backdrop.querySelector('.thumbnail-modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  const dlBtn = backdrop.querySelector('.btn-modal-download');
  dlBtn.addEventListener('click', async () => {
    const origText = dlBtn.textContent;
    dlBtn.textContent = 'Downloading...';
    dlBtn.disabled = true;
    try {
      await downloadFileSecurely(url, filename);
    } finally {
      dlBtn.textContent = origText;
      dlBtn.disabled = false;
    }
  });
}

// Channel Identification & Masking Helpers
export function getChannelInitials(name) {
  if (!name || typeof name !== 'string') return '';
  const clean = name.trim();
  const words = clean.split(/[\s_\-]+/).filter(Boolean);
  if (words.length > 1) {
    return words.map((w) => w[0]).join('').toUpperCase();
  }
  const upperChars = clean.replace(/[^A-Z0-9]/g, '');
  if (upperChars.length >= 2) {
    return upperChars.slice(0, 3).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function getChannelDisplayNumber(channel, channels = []) {
  if (!channel) return 1;
  const list = channels.length ? channels : (store?.getState()?.channels || []);
  const sorted = [...list].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const idx = sorted.findIndex((c) => c.id === channel.id);
  return idx >= 0 ? idx + 1 : 1;
}

export function getChannelMemberDisplayName(channel, channels = []) {
  if (!channel) return '';
  const num = getChannelDisplayNumber(channel, channels);
  const initials = getChannelInitials(channel.name);
  return `Channel ${num} - ${initials}`;
}

export function maskTextForMember(text, channels = []) {
  if (!text || typeof text !== 'string') return text;
  let masked = text;
  const list = channels.length ? channels : (store?.getState()?.channels || []);
  for (const c of list) {
    if (c.name) {
      const displayName = getChannelMemberDisplayName(c, list);
      const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replace(new RegExp(escaped, 'gi'), displayName);
    }
  }
  return masked;
}

// Opens modal popup displaying channel description / about information
export function openChannelAboutModal(channel, channels = []) {
  if (!channel) return;
  const prev = document.getElementById('yta-channel-about-modal');
  if (prev) prev.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'yta-channel-about-modal';
  backdrop.className = 'channel-about-modal-backdrop';

  const memberName = getChannelMemberDisplayName(channel, channels);
  const initials = getChannelInitials(channel.name);
  const description = (channel.description || '').trim();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  backdrop.innerHTML = `
    <div class="channel-about-modal-dialog" role="dialog" aria-modal="true" aria-label="About ${escapeHtml(memberName)}">
      <div class="channel-about-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="sidebar-tag" style="background: rgba(255, 122, 0, 0.15); color: var(--accent); border-color: var(--accent); font-weight: 700;">${escapeHtml(initials)}</span>
          <div class="channel-about-modal-title">
            About ${escapeHtml(memberName)}
          </div>
        </div>
        <button type="button" class="channel-about-modal-close" id="btn-close-channel-about" title="Close (Esc)">✕</button>
      </div>
      <div class="channel-about-modal-body">
        ${
          description
            ? `<div class="channel-about-content">${escapeHtml(description).replace(/\n/g, '<br/>')}</div>`
            : `<div class="channel-about-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px; opacity: 0.5;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                <p style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No guidelines added yet</p>
                <p class="helper-text" style="font-size: 12px;">The administrator has not added specific instructions or guidelines for this channel yet.</p>
              </div>`
        }
      </div>
      <div class="channel-about-modal-footer">
        <button type="button" class="btn btn-secondary btn-sm btn-modal-close-action">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeModal = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeModal();
  };

  document.addEventListener('keydown', onKeyDown);
  backdrop.querySelector('#btn-close-channel-about').addEventListener('click', closeModal);
  backdrop.querySelector('.btn-modal-close-action').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
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
        supabase.from('channels').select('*').order('created_at', { ascending: true }),
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
      const rawChannels = chRes.data || [];
      const promptsData = promptsRes.data || [];

      // Channel About / Description map from role_prompts
      const channelAboutMap = new Map();
      promptsData.forEach((p) => {
        if (p.label === '__CHANNEL_ABOUT__' && p.channel_id) {
          channelAboutMap.set(p.channel_id, p.prompt_text);
        }
      });

      this.state.channels = rawChannels.map((c, idx) => ({
        ...c,
        channelNumber: idx + 1,
        initials: getChannelInitials(c.name),
        description: c.description || channelAboutMap.get(c.id) || ''
      }));

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

      // Filter out internal __CHANNEL_ABOUT__ entries from active prompts list
      this.state.prompts = promptsData
        .filter((p) => p.label !== '__CHANNEL_ABOUT__')
        .map((p) => {
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
            if (voUrl.startsWith('blob:')) {
              // Remote blob: URLs are invalid client references from past browser sessions
              voUrl = '#';
            }
            if (voUrl && !voUrl.startsWith('http') && voUrl !== '#') {
              const { data: urlData } = supabase.storage.from('voiceovers').getPublicUrl(voUrl);
              if (urlData?.publicUrl) voUrl = urlData.publicUrl;
            }
            if (sub.file_name && voUrl && voUrl !== '#') {
              vid.voiceover = {
                name: sub.file_name,
                url: voUrl
              };
            } else if (sub.file_name) {
              vid.voiceover = {
                name: sub.file_name,
                url: '#',
                needsReupload: true
              };
            }
          } else if (rName.includes('thumbnail')) {
            let thumbUrl = sub.file_path || '#';
            if (thumbUrl.startsWith('blob:')) {
              thumbUrl = '#';
            }
            if (thumbUrl && !thumbUrl.startsWith('http') && thumbUrl !== '#') {
              const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(thumbUrl);
              if (urlData?.publicUrl) thumbUrl = urlData.publicUrl;
            }
            if (sub.file_name && thumbUrl && thumbUrl !== '#') {
              vid.thumbnail = {
                name: sub.file_name,
                url: thumbUrl
              };
            } else if (sub.file_name) {
              vid.thumbnail = {
                name: sub.file_name,
                url: '#',
                needsReupload: true
              };
            }
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
  async addChannel(name, description = '') {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const trimmedDesc = (description || '').trim();

    // 1. Try insert with description column
    let { data, error } = await supabase
      .from('channels')
      .insert({
        name: trimmed,
        description: trimmedDesc,
        created_by: this.state.currentUser?.id || null
      })
      .select()
      .single();

    // If description column missing in schema, fallback to inserting without description column
    if (error && (error.code === 'PGRST204' || error.message?.includes('description'))) {
      const fallbackRes = await supabase
        .from('channels')
        .insert({
          name: trimmed,
          created_by: this.state.currentUser?.id || null
        })
        .select()
        .single();
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error || !data) {
      console.error('Add channel error:', error);
      return false;
    }

    // 2. Persist description in role_prompts (__CHANNEL_ABOUT__) for guaranteed persistence & realtime sync
    if (trimmedDesc) {
      const defaultRole = this.state.roles[0];
      if (defaultRole?.id) {
        try {
          await supabase.from('role_prompts').insert({
            channel_id: data.id,
            role_id: defaultRole.id,
            label: '__CHANNEL_ABOUT__',
            prompt_text: trimmedDesc,
            sort_order: 999
          });
        } catch (aboutErr) {
          console.warn('Channel about prompt sync warning:', aboutErr);
        }
      }
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

  async editChannel(id, newName, newDescription = '') {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const trimmedDesc = typeof newDescription === 'string' ? newDescription.trim() : '';

    // 1. Try update channels table
    let { error } = await supabase
      .from('channels')
      .update({ name: trimmed, description: trimmedDesc })
      .eq('id', id);

    if (error && (error.code === 'PGRST204' || error.message?.includes('description'))) {
      const fb = await supabase
        .from('channels')
        .update({ name: trimmed })
        .eq('id', id);
      error = fb.error;
    }

    if (error) {
      console.error('Edit channel error:', error);
      return false;
    }

    // 2. Sync to role_prompts (__CHANNEL_ABOUT__)
    const defaultRole = this.state.roles[0];
    if (defaultRole?.id) {
      try {
        const { data: existingAbout } = await supabase
          .from('role_prompts')
          .select('id')
          .eq('channel_id', id)
          .eq('label', '__CHANNEL_ABOUT__')
          .maybeSingle();

        if (existingAbout?.id) {
          if (trimmedDesc) {
            await supabase.from('role_prompts').update({ prompt_text: trimmedDesc }).eq('id', existingAbout.id);
          } else {
            await supabase.from('role_prompts').delete().eq('id', existingAbout.id);
          }
        } else if (trimmedDesc) {
          await supabase.from('role_prompts').insert({
            channel_id: id,
            role_id: defaultRole.id,
            label: '__CHANNEL_ABOUT__',
            prompt_text: trimmedDesc,
            sort_order: 999
          });
        }
      } catch (aboutErr) {
        console.warn('Channel about prompt update warning:', aboutErr);
      }
    }

    await this.addLedgerEntry({
      action: `updated channel "${trimmed}"`,
      channelId: id,
      task: 'Channel Management',
      fileReference: trimmed
    });

    await this.refreshAll();
    return true;
  }

  getChannelAbout(channelId) {
    if (!channelId) return '';
    const chan = this.state.channels.find((c) => c.id === channelId);
    return chan?.description || '';
  }

  // --- Account Credentials Update (Self-service for each account) ---
  async updateMyCredentials({ username, password }) {
    const current = this.state.currentUser;
    if (!current) return { success: false, error: 'Not authenticated.' };

    const trimmedUsername = (username || '').trim();
    if (!trimmedUsername) {
      return { success: false, error: 'Username cannot be empty.' };
    }

    const authUpdatePayload = {};
    if (password && password.trim()) {
      authUpdatePayload.password = password.trim();
    }
    if (trimmedUsername !== current.username) {
      authUpdatePayload.data = { username: trimmedUsername };
    }

    // 1. Update Supabase Auth user
    if (Object.keys(authUpdatePayload).length > 0) {
      const { error: authErr } = await supabase.auth.updateUser(authUpdatePayload);
      if (authErr) {
        return { success: false, error: authErr.message };
      }
    }

    // 2. Update profiles record
    const profilePayload = {
      username: trimmedUsername,
      updated_at: new Date().toISOString()
    };
    if (password && password.trim()) {
      profilePayload.password_text = password.trim();
    }

    let { error: profErr } = await supabase
      .from('profiles')
      .update(profilePayload)
      .eq('id', current.id);

    if (profErr && (profErr.code === 'PGRST204' || profErr.message?.includes('password_text'))) {
      const fb = await supabase
        .from('profiles')
        .update({ username: trimmedUsername, updated_at: new Date().toISOString() })
        .eq('id', current.id);
      profErr = fb.error;
    }

    if (profErr) {
      return { success: false, error: profErr.message };
    }

    // Update memory & localStorage
    this.state.currentUser.username = trimmedUsername;
    try {
      localStorage.setItem('yta_active_user', JSON.stringify(this.state.currentUser));
    } catch (e) {}

    await this.addLedgerEntry({
      action: 'updated account credentials',
      task: 'Account Settings',
      fileReference: trimmedUsername
    });

    await this.refreshAll();
    return { success: true };
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

  async editRolePrompt(id, channelId, roleName, label, promptText) {
    const role = this.state.roles.find((r) => r.name.toLowerCase() === (roleName || '').toLowerCase());
    if (!role) return false;

    const trimmedLabel = (label || 'Prompt').trim();
    const trimmedText = (promptText || '').trim();
    const targetChannelId = (channelId && channelId !== '__all__') ? channelId : null;

    const payload = {
      role_id: role.id,
      label: trimmedLabel,
      prompt_text: trimmedText,
      channel_id: targetChannelId
    };

    let updateRes = await supabase
      .from('role_prompts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    // Fallback if channel_id column does not exist yet in Supabase
    if (updateRes.error && (updateRes.error.code === '42703' || updateRes.error.message?.includes('channel_id')) && payload.channel_id) {
      delete payload.channel_id;
      updateRes = await supabase
        .from('role_prompts')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    }

    if (updateRes.error) {
      console.error('Failed to update role prompt:', updateRes.error);
      return false;
    }

    const channelObj = targetChannelId
      ? this.state.channels.find((c) => c.id === targetChannelId)
      : null;
    const channelName = channelObj ? channelObj.name : 'All Channels';

    await this.addLedgerEntry({
      action: `updated prompt "${trimmedLabel}" for role "${role.name}" (${channelName})`,
      task: 'Role Prompts',
      channelId: channelObj ? channelObj.id : null,
      channel: channelName,
      fileReference: trimmedLabel
    });

    await this.refreshAll();
    return true;
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

        let { error: profErr } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', item.id);

        if (profErr && (profErr.code === 'PGRST204' || profErr.message?.includes('password_text'))) {
          const fallbackProf = await supabase
            .from('profiles')
            .update({ username: newUsername, updated_at: new Date().toISOString() })
            .eq('id', item.id);
          profErr = fallbackProf.error;
        }

        if (profErr) {
          errors.push(`Failed to update credentials for "${current.username}": ${profErr.message}`);
        } else {
          // If editing self, update active Supabase Auth user session directly
          if (item.id === this.state.currentUser?.id) {
            const selfPayload = {};
            if (newPassword) selfPayload.password = newPassword;
            if (newUsername !== this.state.currentUser.username) selfPayload.data = { username: newUsername };
            if (Object.keys(selfPayload).length > 0) {
              try {
                await supabase.auth.updateUser(selfPayload);
              } catch (selfAuthErr) {
                console.warn('Self auth update notice:', selfAuthErr);
              }
            }
          }

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
      if (uploadRes.error) {
        return { success: false, error: `Upload to storage failed: ${uploadRes.error}` };
      }
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
