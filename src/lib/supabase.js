import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL || 'https://tandgmuuixassiflkcgb.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhbmRnbXV1aXhhc3NpZmxrY2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NjM2MjMsImV4cCI6MjEwNTAzOTYyM30.byGuw3S6E5JyJU3WbLy_BiGwaLr0Yz8ZGsbnzaLgWAo';

// Main client: handles active logged-in user session, postgres queries, realtime, and storage
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Auxiliary client: used exclusively for user registration without overriding the admin's current session
export const supabaseAuthHelper = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'sb-aux-auth-token',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

/**
 * Cloudflare R2 Audio Upload Helper
 * 1. Requests S3 presigned PUT URL from backend endpoint (/api/r2-presign)
 * 2. Uploads audio file directly to Cloudflare R2
 * 3. Constructs and returns the final public R2 URL
 */
export async function uploadAudioToR2(path, file) {
  const fileExt = (file.name ? file.name.split('.').pop() : 'mp3').toLowerCase();
  const mimeMap = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm'
  };
  const contentType = file.type || mimeMap[fileExt] || 'audio/mpeg';

  try {
    // 1. Fetch S3 presigned PUT URL from backend endpoint
    const presignRes = await fetch('/api/r2-presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileName: file.name,
        fileType: contentType,
        path: path || ''
      })
    });

    if (!presignRes.ok) {
      let errMsg = `Failed to get presigned URL from backend (HTTP ${presignRes.status})`;
      try {
        const errJson = await presignRes.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (_) {}
      return {
        error: errMsg,
        filePath: null,
        publicUrl: null,
        fileName: file.name
      };
    }

    const presignData = await presignRes.json();
    const presignedUrl = presignData.presignedUrl || presignData.uploadUrl;
    const key = presignData.key;

    if (!presignedUrl) {
      return {
        error: 'Backend did not return a valid presigned upload URL',
        filePath: null,
        publicUrl: null,
        fileName: file.name
      };
    }

    // 2. Upload the audio file directly to Cloudflare R2
    const uploadRes = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      body: file
    });

    if (!uploadRes.ok) {
      return {
        error: `Cloudflare R2 direct upload failed with HTTP status ${uploadRes.status}`,
        filePath: null,
        publicUrl: null,
        fileName: file.name
      };
    }

    // 3. Construct the final public URL
    const r2PublicBase = (
      import.meta.env?.NEXT_PUBLIC_R2_PUBLIC_URL ||
      import.meta.env?.VITE_R2_PUBLIC_URL ||
      presignData.publicBaseUrl ||
      'https://pub-3fc489abf5ed493a82e3194beec83469.r2.dev'
    ).replace(/\/+$/, '');
    const publicUrl = presignData.publicUrl || `${r2PublicBase}/${key}`;

    return {
      filePath: publicUrl,
      publicUrl: publicUrl,
      fileName: file.name,
      error: null
    };
  } catch (err) {
    console.error('Cloudflare R2 audio upload exception:', err);
    return {
      error: err.message || 'Failed to upload audio to Cloudflare R2',
      filePath: null,
      publicUrl: null,
      fileName: file.name
    };
  }
}

/**
 * Storage upload helper - routes audio files to Cloudflare R2 and images to Supabase storage
 */
export async function uploadStorageFile(bucket, path, file) {
  const fileExt = (file.name ? file.name.split('.').pop() : 'dat').toLowerCase();
  const isAudio =
    bucket === 'voiceovers' ||
    (file.type && file.type.startsWith('audio/')) ||
    ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm'].includes(fileExt);

  // Use Cloudflare R2 for audio files
  if (isAudio) {
    return uploadAudioToR2(path, file);
  }

  // Use Supabase Storage for thumbnails and other non-audio assets
  const cleanPath = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${fileExt}`;
  const fullPath = path ? `${path}/${cleanPath}` : cleanPath;

  const mimeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
  };
  const contentType = file.type || mimeMap[fileExt] || 'application/octet-stream';

  try {
    const { data, error } = await supabase.storage.from(bucket).upload(fullPath, file, {
      upsert: false,
      cacheControl: '3600',
      contentType: contentType
    });

    if (error) {
      console.error(`Storage upload error to ${bucket}:`, error);
      return {
        error: error.message || 'Storage upload failed',
        filePath: null,
        publicUrl: null,
        fileName: file.name
      };
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fullPath);

    return {
      filePath: data.path,
      publicUrl: urlData?.publicUrl || '',
      fileName: file.name
    };
  } catch (err) {
    console.error('Storage helper exception:', err);
    return {
      error: err.message || 'Storage exception occurred',
      filePath: null,
      publicUrl: null,
      fileName: file.name
    };
  }
}
